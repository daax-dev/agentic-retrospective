/**
 * Test harness for Claude-native source attribution (Issue #38).
 *
 * Validates PRD-03 acceptance criteria against a hand-computed fixture:
 *  - AC#1: an MCP call, a subagent, a skill, and a Bash call each attribute to
 *    the correct category, with priority (mcp > subagent > skill > tool > direct)
 *    resolving a multi-category turn;
 *  - AC#2: subagent tokens attribute to the spawning prompt, never "direct";
 *  - AC#3: skill attribution records the specific skill identity;
 *  - AC#4: a prompt's tool/result/token linkage reconstructs the causal chain;
 *  - the anti-slop invariant: sum(spend by source) === ingestion grand totals;
 *  - classification is name-only, so em-dash / literal `--` / inline `mcp__`
 *    text in a Bash command never produces a false positive.
 */

import { describe, test, expect } from 'vitest';
import { join } from 'path';
import {
  ClaudeNativeAnalyzer,
  attributeSpend,
  classifyTool,
  parseMcpName,
  totalAttributedTokens,
  type AttributionResult,
  type ClaudeUsage,
} from '../../../src/analyzers/claude-native/index.js';
import { getFixturesDir } from '../../helpers/fixture-loader.js';

const ATTR_PROJECTS = join(getFixturesDir(), 'claude-native', 'attribution', 'projects');
const COLLISION_PROJECTS = join(getFixturesDir(), 'claude-native', 'collision', 'projects');
const CACHEREAD_PROJECTS = join(getFixturesDir(), 'claude-native', 'cacheread', 'projects');

function analyzeAttribution(): { result: AttributionResult; totals: ClaudeUsage } {
  const ingestion = new ClaudeNativeAnalyzer({ baseDirs: [ATTR_PROJECTS] }).analyze();
  return { result: attributeSpend(ingestion), totals: ingestion.totals };
}

function usageOf(input: number, output: number): Partial<ClaudeUsage> {
  return { inputTokens: input, outputTokens: output, cacheCreationTokens: 0, cacheReadTokens: 0 };
}

describe('classifyTool — name-only classification', () => {
  test('MCP method by mcp__<server>__<method> convention', () => {
    expect(classifyTool('mcp__notion__API-post-search')).toMatchObject({
      category: 'mcp',
      identity: 'notion/API-post-search',
      mcpServer: 'notion',
      mcpMethod: 'API-post-search',
    });
  });

  test('subagent launch via Agent OR Task', () => {
    expect(classifyTool('Agent', 'general-purpose')).toMatchObject({ category: 'subagent', identity: 'general-purpose' });
    expect(classifyTool('Task', 'coder')).toMatchObject({ category: 'subagent', identity: 'coder' });
  });

  test('skill carries the specific skill identity', () => {
    expect(classifyTool('Skill', 'codex:rescue')).toMatchObject({ category: 'skill', identity: 'codex:rescue' });
  });

  test('built-in tools classify as tool', () => {
    expect(classifyTool('Bash', 'ls -la')).toMatchObject({ category: 'tool', identity: 'Bash' });
    expect(classifyTool('Read', '/x.ts')).toMatchObject({ category: 'tool', identity: 'Read' });
  });

  test('false-positive guard: mcp__ / -- / em-dash inside a Bash command is still a tool', () => {
    const cls = classifyTool('Bash', "echo 'mcp__fake__call -- not a skill — em-dash'");
    expect(cls.category).toBe('tool');
    expect(cls.identity).toBe('Bash');
  });

  test('parseMcpName splits on the first __ after the prefix (server may have underscores)', () => {
    expect(parseMcpName('mcp__claude_ai_Gmail__authenticate')).toEqual({
      server: 'claude_ai_Gmail',
      method: 'authenticate',
    });
    expect(parseMcpName('mcp__backlog__task_create')).toEqual({ server: 'backlog', method: 'task_create' });
    // Degrades, never throws.
    expect(parseMcpName('mcp__weird')).toEqual({ server: 'weird', method: 'unknown' });
  });
});

describe('attributeSpend — rollups and invariants', () => {
  test('AC#1: every tool call attributes to the correct category', () => {
    const { result } = analyzeAttribution();
    const byId = (id: string) => result.toolCalls.find(c => c.toolUseId === id);

    expect(byId('toolu_MCP1')).toMatchObject({ category: 'mcp', identity: 'notion/API-post-search' });
    expect(byId('toolu_SKILL1')).toMatchObject({ category: 'skill', identity: 'codex:rescue' });
    expect(byId('toolu_AGENT_L')).toMatchObject({ category: 'subagent', identity: 'general-purpose' });
    expect(byId('toolu_BASH1')).toMatchObject({ category: 'tool', identity: 'Bash' });
    expect(byId('toolu_MCP2')).toMatchObject({ category: 'mcp', identity: 'backlog/task_create' });
    // Guarded Bash call (command embeds mcp__/--/em-dash) stays a tool.
    expect(byId('toolu_BASH2')).toMatchObject({ category: 'tool', identity: 'Bash' });
    // A subagent-internal Grep is classified and flagged sidechain.
    expect(byId('toolu_SL_GREP')).toMatchObject({ category: 'tool', identity: 'Grep', isSidechain: true });
  });

  test('anti-slop invariant: sum of by-source spend + cache-read overhead equals grand totals', () => {
    const { result, totals } = analyzeAttribution();
    const summed = result.bySource.reduce((n, s) => n + totalAttributedTokens(s.usage), 0);
    expect(summed + result.cacheReadOverhead).toBe(totalAttributedTokens(totals));
    // And field-exact, not just the scalar total.
    const sumField = (k: keyof ClaudeUsage) =>
      result.bySource.reduce((n, s) => n + (s.usage[k] as number), 0);
    expect(sumField('inputTokens')).toBe(totals.inputTokens);
    expect(sumField('outputTokens')).toBe(totals.outputTokens);
    // Cache-read is not attributed to any source bucket.
    expect(sumField('cacheReadTokens')).toBe(0);
    expect(result.cacheReadOverhead).toBe(totals.cacheReadTokens);
  });

  test('by-source category totals match hand-computed values', () => {
    const { result } = analyzeAttribution();
    const cat = (c: string) => result.bySource.find(s => s.category === c)?.usage;
    expect(cat('mcp')).toMatchObject(usageOf(22, 11)); // a1 + a5
    expect(cat('skill')).toMatchObject(usageOf(8, 4)); // a3
    expect(cat('subagent')).toMatchObject(usageOf(146, 73)); // a4 + LINK + ORPH
    expect(cat('tool')).toMatchObject(usageOf(14, 9)); // a7
    expect(cat('direct')).toMatchObject(usageOf(37, 12)); // a1f + a4f + a5f + a7f
  });

  test('priority: a multi-category turn (mcp + Bash) is charged to mcp', () => {
    const { result } = analyzeAttribution();
    // a5's 12/6 usage lands under mcp/backlog/task_create, not tool/Bash.
    const backlog = result.byIdentity.find(i => i.identity === 'backlog/task_create');
    expect(backlog?.usage).toMatchObject(usageOf(12, 6));
    const bash = result.byIdentity.find(i => i.category === 'tool' && i.identity === 'Bash');
    expect(bash?.usage).toMatchObject(usageOf(14, 9)); // only a7's spend, NOT a5's Bash
    // a5's Bash call is still classified in the per-call list (the by-identity
    // `events` count reflects spend turns, not raw call frequency).
    expect(result.toolCalls.filter(c => c.identity === 'Bash')).toHaveLength(2);
  });

  test('by-identity events count spend turns/subagents, not raw call frequency', () => {
    const { result } = analyzeAttribution();
    // general-purpose: a4 launch turn (winning) + ORPH subagent = 2 spend events.
    const gp = result.byIdentity.find(i => i.category === 'subagent' && i.identity === 'general-purpose');
    expect(gp?.events).toBe(2);
    expect(gp?.usage).toMatchObject(usageOf(46, 23)); // a4 (6/3) + ORPH (40/20)
  });

  test('AC#3: skill attribution records the specific skill identity', () => {
    const { result } = analyzeAttribution();
    const skill = result.byIdentity.find(i => i.category === 'skill');
    expect(skill?.identity).toBe('codex:rescue');
    expect(skill?.usage).toMatchObject(usageOf(8, 4));
  });
});

describe('attributeSpend — prompt chains and lineage (AC#2, AC#4)', () => {
  test('segments the session into one chain per genuine prompt', () => {
    const { result } = analyzeAttribution();
    expect(result.prompts.map(p => p.promptUuid)).toEqual(['u1', 'u3', 'u5', 'u7']);
  });

  test('AC#4: a prompt reconstructs its tool/result/token linkage', () => {
    const { result } = analyzeAttribution();
    const p1 = result.prompts.find(p => p.promptUuid === 'u1')!;
    expect(p1.turnUuids).toEqual(['u1', 'a1', 'u2', 'a1f']);
    expect(p1.usage).toMatchObject(usageOf(30, 12)); // a1 + a1f
    const mcpCall = p1.toolCalls.find(c => c.toolUseId === 'toolu_MCP1')!;
    expect(mcpCall.isError).toBe(false);
    expect(mcpCall.resultBytes).toBe('search results'.length); // inline result size
  });

  test('AC#2: subagent tokens attribute to the spawning prompt, never direct', () => {
    const { result } = analyzeAttribution();
    const p2 = result.prompts.find(p => p.promptUuid === 'u3')!;
    expect(p2.subagentIds).toContain('LINK');
    // Prompt usage includes the linked subagent's 100/50 spend.
    expect(p2.usage).toMatchObject(usageOf(119, 59)); // a3 + a4 + a4f + LINK
    const subSpend = p2.bySource.find(s => s.category === 'subagent')?.usage;
    expect(subSpend).toMatchObject(usageOf(106, 53)); // a4 (6/3) + LINK (100/50)
    // None of the subagent spend leaked into a "direct" bucket for this prompt.
    const directSpend = p2.bySource.find(s => s.category === 'direct')?.usage;
    expect(directSpend).toMatchObject(usageOf(5, 2)); // only a4f
  });

  test('unlinked subagent is reported at session level, not folded into a prompt', () => {
    const { result } = analyzeAttribution();
    expect(result.unlinkedSubagents).toHaveLength(1);
    expect(result.unlinkedSubagents[0]).toMatchObject({
      agentId: 'ORPH',
      agentType: 'general-purpose',
    });
    expect(result.unlinkedSubagents[0].usage).toMatchObject(usageOf(40, 20));
    // ORPH never appears in any prompt's subagentIds.
    expect(result.prompts.some(p => p.subagentIds.includes('ORPH'))).toBe(false);
    // No spurious attribution warnings (ORPH's missing lineage is the ingester's
    // concern; attribution only warns when a *linked* sub has no segment).
    expect(result.warnings).toHaveLength(0);
  });

  test('prompt spend plus unlinked subagent spend reconciles to grand totals', () => {
    const { result, totals } = analyzeAttribution();
    const promptInput = result.prompts.reduce((n, p) => n + p.usage.inputTokens, 0);
    const orphInput = result.unlinkedSubagents.reduce((n, s) => n + s.usage.inputTokens, 0);
    expect(promptInput + orphInput).toBe(totals.inputTokens);
    const promptOutput = result.prompts.reduce((n, p) => n + p.usage.outputTokens, 0);
    const orphOutput = result.unlinkedSubagents.reduce((n, s) => n + s.usage.outputTokens, 0);
    expect(promptOutput + orphOutput).toBe(totals.outputTokens);
  });
});

describe('attributeSpend — cross-session identity collisions', () => {
  test('two sessions reusing the same uuid/toolUseId do not collide', () => {
    // sessA and sessB both use uuid u1/a1 and toolUseId toolu_DUP, but the DUP
    // call is an MCP call in A and a Bash call in B. Session-scoped keys must
    // keep both calls and classify each correctly.
    const ingestion = new ClaudeNativeAnalyzer({ baseDirs: [COLLISION_PROJECTS] }).analyze();
    const result = attributeSpend(ingestion);

    const dup = result.toolCalls.filter(c => c.toolUseId === 'toolu_DUP');
    expect(dup).toHaveLength(2);
    expect(dup.map(c => c.category).sort()).toEqual(['mcp', 'tool']);

    // One prompt per session, each owning its own call — no clobbering.
    expect(result.prompts).toHaveLength(2);

    // The invariant still holds across the collision.
    const summed = result.bySource.reduce((n, s) => n + totalAttributedTokens(s.usage), 0);
    expect(summed).toBe(totalAttributedTokens(ingestion.totals));
    expect(result.bySource.find(s => s.category === 'mcp')?.usage).toMatchObject(usageOf(10, 5));
    expect(result.bySource.find(s => s.category === 'tool')?.usage).toMatchObject(usageOf(20, 7));
  });
});

describe('attributeSpend — cache-read overhead', () => {
  test('cache-read is excluded from per-source attribution and reported separately', () => {
    // sessC: one MCP turn with input 10, cache-creation 5, cache-read 100, output 3.
    const ingestion = new ClaudeNativeAnalyzer({ baseDirs: [CACHEREAD_PROJECTS] }).analyze();
    const result = attributeSpend(ingestion);

    const mcp = result.bySource.find(s => s.category === 'mcp')?.usage;
    // Attributable spend = input + cache-creation + output; cache-read stripped.
    expect(mcp).toMatchObject({ inputTokens: 10, cacheCreationTokens: 5, cacheReadTokens: 0, outputTokens: 3 });
    expect(result.cacheReadOverhead).toBe(100);

    // Per-prompt: full usage keeps cache-read; bySource excludes it.
    const prompt = result.prompts[0];
    expect(prompt.usage.cacheReadTokens).toBe(100);
    const promptSourceCacheRead = prompt.bySource.reduce((n, s) => n + s.usage.cacheReadTokens, 0);
    expect(promptSourceCacheRead).toBe(0);

    // Invariant holds with overhead added back.
    const summed = result.bySource.reduce((n, s) => n + totalAttributedTokens(s.usage), 0);
    expect(summed + result.cacheReadOverhead).toBe(totalAttributedTokens(ingestion.totals));
  });
});

describe('attributeSpend — empty input', () => {
  test('an empty ingestion yields empty attribution, no throw', () => {
    const ingestion = new ClaudeNativeAnalyzer({ baseDirs: [] }).analyze();
    const result = attributeSpend(ingestion);
    expect(result.bySource).toHaveLength(0);
    expect(result.toolCalls).toHaveLength(0);
    expect(result.prompts).toHaveLength(0);
    expect(result.unlinkedSubagents).toHaveLength(0);
    expect(result.cacheReadOverhead).toBe(0);
  });
});

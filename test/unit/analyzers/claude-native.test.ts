/**
 * Test harness for the Claude-native session ingester (Issue #36).
 *
 * Validates the normalized data contract and ingestion behaviour against the
 * PRD-01 acceptance criteria:
 *  - emits ClaudeTurn / ClaudeToolCall / ClaudeSubagent matching spec §3;
 *  - subagent tokens attributed to the spawning parent; a subagent-bearing
 *    session reports strictly higher totals than a main-stream-only scan;
 *  - duplicate streaming records collapse to one turn (no double-count);
 *  - malformed lines / unknown record types do not abort;
 *  - schema-version guard warns on version drift.
 */

import { describe, test, expect } from 'vitest';
import { join } from 'path';
import {
  ClaudeNativeAnalyzer,
  discoverSessions,
  resolveProjectDirs,
} from '../../../src/analyzers/claude-native/index.js';
import { extractExternalFile } from '../../../src/analyzers/claude-native/parse.js';
import { isWithinPath } from '../../../src/analyzers/claude-native/io.js';
import { getFixturesDir } from '../../helpers/fixture-loader.js';

const ROOT = join(getFixturesDir(), 'claude-native');
const HAPPY_PROJECTS = join(ROOT, 'happy', 'projects');
const MALFORMED_PROJECTS = join(ROOT, 'malformed', 'projects');
const DRIFT_PROJECTS = join(ROOT, 'drift', 'projects');
const WINDOWED_PROJECTS = join(ROOT, 'windowed', 'projects');
const MULTIBRANCH_PROJECTS = join(ROOT, 'multibranch', 'projects');
const CONFIG_HOME = join(ROOT, 'config-home');

function analyzeHappy() {
  return new ClaudeNativeAnalyzer({ baseDirs: [HAPPY_PROJECTS] }).analyze();
}

describe('ClaudeNativeAnalyzer — discovery', () => {
  test('discovers only top-level session files, not subagent transcripts', () => {
    const sessions = discoverSessions({ baseDirs: [HAPPY_PROJECTS] });
    expect(sessions).toHaveLength(1);
    expect(sessions[0].sessionId).toBe('sess-main');
    expect(sessions[0].projectSlug).toBe('project-alpha');
    // Subagent agent-*.jsonl live in <session>/subagents/ and must NOT be
    // discovered as sessions (that would double-count their tokens).
    expect(sessions.some(s => s.sessionId.startsWith('agent-'))).toBe(false);
  });

  test('resolveProjectDirs honors the home override and default roots', () => {
    const dirs = resolveProjectDirs({ home: CONFIG_HOME, env: {} });
    expect(dirs).toContain(join(CONFIG_HOME, '.claude', 'projects'));
  });

  test('resolveProjectDirs honors CLAUDE_CONFIG_DIR (comma-separated)', () => {
    const dirs = resolveProjectDirs({
      home: join(ROOT, 'does-not-exist'),
      env: { CLAUDE_CONFIG_DIR: `${join(CONFIG_HOME, '.claude')},${join(ROOT, 'missing')}` },
    });
    expect(dirs).toContain(join(CONFIG_HOME, '.claude', 'projects'));
  });

  test('CLAUDE_CONFIG_DIR replaces the home defaults (override, not addition)', () => {
    const dirs = resolveProjectDirs({
      home: CONFIG_HOME, // would otherwise contribute .claude/projects
      env: { CLAUDE_CONFIG_DIR: join(ROOT, 'missing-base') },
    });
    // Override is set but points at a non-existent base → no dirs, and the
    // home-based default (CONFIG_HOME/.claude/projects) is NOT mixed in.
    expect(dirs).not.toContain(join(CONFIG_HOME, '.claude', 'projects'));
    expect(dirs).toHaveLength(0);
  });

  test('an explicitly empty baseDirs is honored (no fallback to ~/.claude)', () => {
    // baseDirs: [] means "no roots", NOT "use the home defaults".
    expect(resolveProjectDirs({ baseDirs: [] })).toHaveLength(0);
    const result = new ClaudeNativeAnalyzer({ baseDirs: [] }).analyze();
    expect(result.sessions).toHaveLength(0);
  });

  test('non-existent roots yield an empty, non-throwing result', () => {
    const result = new ClaudeNativeAnalyzer({ baseDirs: [join(ROOT, 'nope')] }).analyze();
    expect(result.sessions).toHaveLength(0);
    expect(result.turns).toHaveLength(0);
    expect(result.totals.inputTokens).toBe(0);
  });
});

describe('ClaudeNativeAnalyzer — normalization & contract', () => {
  test('emits normalized turns for user/assistant/attachment records', () => {
    const { turns } = analyzeHappy();
    // Main stream: u1, msg_1 (deduped), u2, msg_2, u3, msg_3, att1 = 7 turns.
    const mainTurns = turns.filter(t => !t.isSidechain);
    expect(mainTurns).toHaveLength(7);

    const user = turns.find(t => t.uuid === 'u1');
    expect(user?.kind).toBe('message');
    expect(user?.role).toBe('user');
    expect(user?.gitBranch).toBe('main');
    expect(user?.cwd).toBe('/repo/alpha');
    expect(user?.projectSlug).toBe('project-alpha');

    const attachment = turns.find(t => t.uuid === 'att1');
    expect(attachment?.kind).toBe('attachment');
    expect(attachment?.role).toBeUndefined();

    const assistant = turns.find(t => t.role === 'assistant' && t.model === 'claude-opus-4');
    expect(assistant?.usage).toBeDefined();
  });

  test('normalizes the usage ledger with contract field names', () => {
    const { turns } = analyzeHappy();
    const finalMsg1 = turns.find(t => t.uuid === 'a1b' || t.uuid === 'a1');
    // Dedup keeps the LAST record (a1b) with the final tally (output 40).
    expect(finalMsg1?.usage).toEqual({
      inputTokens: 100,
      cacheCreationTokens: 200,
      cacheReadTokens: 50,
      outputTokens: 40,
      serviceTier: 'standard',
      speed: 'standard',
      serverToolUse: { webSearch: 1, webFetch: 0 },
    });
  });

  test('extracts tool-use blocks with tool-specific targets', () => {
    const { toolCalls } = analyzeHappy();
    // 3 main (READ1 deduped, BASH1, AGENT1) + 1 subagent (Grep) = 4.
    expect(toolCalls).toHaveLength(4);

    const read = toolCalls.find(c => c.toolUseId === 'toolu_READ1');
    expect(read?.name).toBe('Read');
    expect(read?.target).toBe('/repo/alpha/src/x.ts');
    expect(read?.turnUuid).toBe('a1b');

    const bash = toolCalls.find(c => c.toolUseId === 'toolu_BASH1');
    expect(bash?.target).toBe('ls -la');

    const agent = toolCalls.find(c => c.toolUseId === 'toolu_AGENT1');
    expect(agent?.name).toBe('Agent');
    expect(agent?.target).toBe('general-purpose');
  });

  test('resolves tool-result size from externalized file, inline otherwise', () => {
    const { toolCalls } = analyzeHappy();
    const read = toolCalls.find(c => c.toolUseId === 'toolu_READ1');
    // Inline body "file contents here" = 18 bytes, no externalized file.
    expect(read?.resultBytes).toBe(18);
    expect(read?.isError).toBe(false);

    const bash = toolCalls.find(c => c.toolUseId === 'toolu_BASH1');
    // Externalized file is referenced inline by an arbitrary name
    // (tool-results/bqyti0sz3.txt, NOT <toolUseId>.txt) = 100 bytes; the parsed
    // path is resolved and overrides the tiny inline placeholder.
    expect(bash?.resultBytes).toBe(100);

    const agent = toolCalls.find(c => c.toolUseId === 'toolu_AGENT1');
    // No matching tool_result observed.
    expect(agent?.resultBytes).toBeUndefined();
    expect(agent?.isError).toBeUndefined();
  });
});

describe('isWithinPath — separator-agnostic containment', () => {
  test('matches POSIX descendants and the dir itself', () => {
    expect(isWithinPath('/repo/alpha', '/repo/alpha')).toBe(true);
    expect(isWithinPath('/repo/alpha/src', '/repo/alpha')).toBe(true);
    expect(isWithinPath('/repo/alpha-2', '/repo/alpha')).toBe(false);
    expect(isWithinPath(undefined, '/repo/alpha')).toBe(false);
  });

  test('matches Windows backslash paths regardless of runtime platform', () => {
    expect(isWithinPath('C:\\repo\\subdir', 'C:\\repo')).toBe(true);
    expect(isWithinPath('C:\\repo', 'C:\\repo\\')).toBe(true);
    expect(isWithinPath('C:\\other', 'C:\\repo')).toBe(false);
  });
});

describe('extractExternalFile — externalized result path parsing', () => {
  test('extracts an arbitrary tool-results filename from a body', () => {
    expect(extractExternalFile('saved to tool-results/bqyti0sz3.txt')).toBe('bqyti0sz3.txt');
    expect(extractExternalFile([{ type: 'text', text: 'tool-results/abc-123.txt' }])).toBe(
      'abc-123.txt'
    );
  });

  test('returns undefined when no reference is present', () => {
    expect(extractExternalFile('plain inline result')).toBeUndefined();
    expect(extractExternalFile(null)).toBeUndefined();
  });

  test('does not match path-traversal references (stays in tool-results/)', () => {
    expect(extractExternalFile('tool-results/../../etc/passwd')).toBeUndefined();
    expect(extractExternalFile('tool-results/../secret.txt')).toBeUndefined();
    expect(extractExternalFile('tool-results/sub/dir.txt')).toBeUndefined();
  });
});

describe('ClaudeNativeAnalyzer — deduplication (regression)', () => {
  test('collapses streaming partials sharing message.id into one turn', () => {
    const result = analyzeHappy();
    const msg1Turns = result.turns.filter(t => t.usage?.outputTokens === 40 || t.usage?.outputTokens === 10);
    // Only the final (output 40) survives; the output-10 partial is collapsed.
    expect(msg1Turns).toHaveLength(1);
    expect(msg1Turns[0].usage?.outputTokens).toBe(40);
    expect(result.stats.duplicatesCollapsed).toBeGreaterThanOrEqual(1);
  });

  test('does not double-count tokens from collapsed partials', () => {
    const { mainStreamTotals } = analyzeHappy();
    // msg_1 final (in100/cc200/cr50/out40) + msg_2 (20/0/0/5) + msg_3 (30/0/0/15).
    expect(mainStreamTotals.inputTokens).toBe(150);
    expect(mainStreamTotals.cacheCreationTokens).toBe(200);
    expect(mainStreamTotals.cacheReadTokens).toBe(50);
    expect(mainStreamTotals.outputTokens).toBe(60);
    expect(mainStreamTotals.serverToolUse.webSearch).toBe(1);
  });
});

describe('ClaudeNativeAnalyzer — subagent resolution & attribution', () => {
  test('emits a ClaudeSubagent per sidecar with lineage flags', () => {
    const { subagents } = analyzeHappy();
    expect(subagents).toHaveLength(2);

    const linked = subagents.find(s => s.agentId === 'AAA');
    expect(linked?.agentType).toBe('general-purpose');
    expect(linked?.spawnedByToolUseId).toBe('toolu_AGENT1');
    expect(linked?.lineageUnknown).toBe(false);
    // Subagent transcript streams (msg_sa output 100 then 8647) → dedup keeps 8647.
    expect(linked?.usageTotals.inputTokens).toBe(1000);
    expect(linked?.usageTotals.outputTokens).toBe(8647);

    const orphan = subagents.find(s => s.agentId === 'BBB');
    expect(orphan?.agentType).toBe('explorer');
    expect(orphan?.spawnedByToolUseId).toBeUndefined();
    expect(orphan?.lineageUnknown).toBe(true);
  });

  test('attribution links subagent → parent tool_use → parent turn', () => {
    const result = analyzeHappy();
    const sub = result.subagents.find(s => s.agentId === 'AAA')!;
    const parentCall = result.toolCalls.find(c => c.toolUseId === sub.spawnedByToolUseId);
    expect(parentCall).toBeDefined();
    expect(parentCall?.name).toBe('Agent');
    const parentTurn = result.turns.find(t => t.uuid === parentCall?.turnUuid);
    expect(parentTurn?.role).toBe('assistant');
  });

  test('warns when subagent lineage is unknown (no toolUseId sidecar)', () => {
    const { warnings } = analyzeHappy();
    expect(warnings.some(w => w.includes('BBB') && w.includes('lineage unknown'))).toBe(true);
  });

  test('session totals strictly exceed a main-stream-only scan', () => {
    const result = analyzeHappy();
    // totals include subagent spend (AAA 1000/8647 + BBB 10/20); main stream excludes it.
    expect(result.totals.inputTokens).toBeGreaterThan(result.mainStreamTotals.inputTokens);
    expect(result.totals.outputTokens).toBeGreaterThan(result.mainStreamTotals.outputTokens);
    expect(result.totals.inputTokens).toBe(150 + 1000 + 10);
    expect(result.totals.outputTokens).toBe(60 + 8647 + 20);

    const session = result.sessions[0];
    expect(session.subagentCount).toBe(2);
    expect(session.totals.inputTokens).toBeGreaterThan(session.mainStreamTotals.inputTokens);
    // Summary time bounds reflect the main stream (u1 .. att1).
    expect(session.firstTimestamp).toBe('2026-05-01T10:00:00Z');
    expect(session.lastTimestamp).toBe('2026-05-01T10:00:11Z');
  });

  test('keeps the per-turn ledger pristine (subagent tokens not folded in)', () => {
    const { turns } = analyzeHappy();
    // The parent Agent turn (msg_3) keeps its own usage only (30/15), not subagent spend.
    const parent = turns.find(t => t.uuid === 'a3');
    expect(parent?.usage?.inputTokens).toBe(30);
    expect(parent?.usage?.outputTokens).toBe(15);
  });

  test('emits subagent turns flagged isSidechain with an agentId', () => {
    const { turns } = analyzeHappy();
    const sidechain = turns.filter(t => t.isSidechain);
    // AAA: sa1 (user) + msg_sa (deduped) = 2; BBB: 1 = 3 sidechain turns.
    expect(sidechain).toHaveLength(3);
    expect(sidechain.every(t => Boolean(t.agentId))).toBe(true);
    expect(sidechain.some(t => t.agentId === 'AAA')).toBe(true);
    expect(sidechain.some(t => t.agentId === 'BBB')).toBe(true);
  });

  test('emits tool calls made inside a subagent transcript', () => {
    const { toolCalls } = analyzeHappy();
    const grep = toolCalls.find(c => c.toolUseId === 'toolu_SAGREP');
    expect(grep?.name).toBe('Grep');
    expect(grep?.target).toBe('TODO');
    expect(grep?.turnUuid).toBe('sa2b');
  });
});

describe('ClaudeNativeAnalyzer — defensive parsing', () => {
  test('malformed lines and unknown record types do not abort the run', () => {
    const result = new ClaudeNativeAnalyzer({ baseDirs: [MALFORMED_PROJECTS] }).analyze();
    // m1 (user), m2 (assistant), m3 (assistant, non-object message) survive;
    // permission-mode / last-prompt / malformed / array lines do not become turns.
    expect(result.turns).toHaveLength(3);
    expect(result.stats.linesSkipped).toBe(2); // bad JSON + bare array
    expect(result.mainStreamTotals.inputTokens).toBe(7);
    expect(result.mainStreamTotals.outputTokens).toBe(3);
  });
});

describe('ClaudeNativeAnalyzer — schema-version guard', () => {
  test('no drift warning when observed version matches expected', () => {
    const result = analyzeHappy();
    expect(result.observedVersions).toEqual(['2.1.150']);
    expect(result.warnings.some(w => w.includes('Schema version drift'))).toBe(false);
  });

  test('warns when observed version differs from expected', () => {
    const result = new ClaudeNativeAnalyzer({ baseDirs: [DRIFT_PROJECTS] }).analyze();
    expect(result.observedVersions).toEqual(['2.0.0-legacy']);
    expect(result.warnings.some(w => w.includes('Schema version drift'))).toBe(true);
  });

  test('respects a caller-supplied expectedVersion', () => {
    const result = new ClaudeNativeAnalyzer({
      baseDirs: [DRIFT_PROJECTS],
      expectedVersion: '2.0.0-legacy',
    }).analyze();
    expect(result.warnings.some(w => w.includes('Schema version drift'))).toBe(false);
  });
});

describe('ClaudeNativeAnalyzer — sprint-window scope', () => {
  test('includes sessions whose turns fall within the window', () => {
    const result = new ClaudeNativeAnalyzer({
      baseDirs: [HAPPY_PROJECTS],
      scope: { fromTimestamp: '2026-05-01T00:00:00Z', toTimestamp: '2026-05-02T00:00:00Z' },
    }).analyze();
    expect(result.sessions).toHaveLength(1);
  });

  test('excludes sessions entirely outside the window', () => {
    const result = new ClaudeNativeAnalyzer({
      baseDirs: [HAPPY_PROJECTS],
      scope: { fromTimestamp: '2026-06-01T00:00:00Z' },
    }).analyze();
    expect(result.sessions).toHaveLength(0);
    expect(result.turns).toHaveLength(0);
  });

  test('filters by repo path (cwd containment)', () => {
    const included = new ClaudeNativeAnalyzer({
      baseDirs: [HAPPY_PROJECTS],
      scope: { repoPath: '/repo/alpha' },
    }).analyze();
    expect(included.sessions).toHaveLength(1);

    const excluded = new ClaudeNativeAnalyzer({
      baseDirs: [HAPPY_PROJECTS],
      scope: { repoPath: '/repo/other' },
    }).analyze();
    expect(excluded.sessions).toHaveLength(0);
  });

  test('trims out-of-window turns from a session that spans the boundary', () => {
    // sess-win has an in-window turn (out 10 @ 2026-05-01) and an out-of-window
    // turn (out 999 @ 2026-05-10). A --to of 2026-05-05 must exclude the latter.
    const result = new ClaudeNativeAnalyzer({
      baseDirs: [WINDOWED_PROJECTS],
      scope: { fromTimestamp: '2026-05-01T00:00:00Z', toTimestamp: '2026-05-05T00:00:00Z' },
    }).analyze();
    expect(result.sessions).toHaveLength(1);
    // Only the in-window turn's usage is counted; the out-of-window 999 is gone.
    expect(result.mainStreamTotals.outputTokens).toBe(10);
    expect(result.mainStreamTotals.inputTokens).toBe(100);
    expect(result.turns.some(t => t.uuid === 'w3')).toBe(false);
    expect(result.turns.some(t => t.uuid === 'w2')).toBe(true);
  });

  test('filters by exact git branch', () => {
    const excluded = new ClaudeNativeAnalyzer({
      baseDirs: [HAPPY_PROJECTS],
      scope: { gitBranch: 'feature/none' },
    }).analyze();
    expect(excluded.sessions).toHaveLength(0);
  });

  test('trims other-branch turns and their out-of-scope subagents', () => {
    // sess-mb: a main turn (out 10) and a feature/x turn (out 500) that spawns
    // subagent MB (out 300). Scoping to `main` must drop the feature turn AND the
    // subagent whose spawning Agent call was trimmed out of scope.
    const scopedToMain = new ClaudeNativeAnalyzer({
      baseDirs: [MULTIBRANCH_PROJECTS],
      scope: { gitBranch: 'main' },
    }).analyze();
    expect(scopedToMain.sessions).toHaveLength(1);
    expect(scopedToMain.mainStreamTotals.outputTokens).toBe(10);
    expect(scopedToMain.turns.some(t => t.uuid === 'mb2')).toBe(false);
    // Subagent MB's parent (toolu_MBAGENT) was trimmed → subagent not attributed.
    expect(scopedToMain.subagents).toHaveLength(0);
    expect(scopedToMain.totals.outputTokens).toBe(10);

    // Without scope, the subagent and its spend ARE attributed.
    const unscoped = new ClaudeNativeAnalyzer({ baseDirs: [MULTIBRANCH_PROJECTS] }).analyze();
    expect(unscoped.subagents).toHaveLength(1);
    expect(unscoped.totals.outputTokens).toBe(10 + 500 + 300);
  });

  test('compares timestamps as instants, not strings (timezone offsets)', () => {
    // 12:00:10+02:00 == 10:00:10Z. Subagent records (10:00:11Z+) are after it and
    // must be excluded. A naive string compare would wrongly keep them
    // ("...10:00:11Z" < "...12:00:10+02:00" lexicographically).
    const result = new ClaudeNativeAnalyzer({
      baseDirs: [HAPPY_PROJECTS],
      scope: { toTimestamp: '2026-05-01T12:00:10+02:00' },
    }).analyze();
    expect(result.subagents).toHaveLength(0);
    expect(result.turns.some(t => t.isSidechain)).toBe(false);
  });

  test('drops subagents with no in-scope activity (count not inflated)', () => {
    // to=10:00:10Z keeps the main stream through msg_3 but excludes the subagent
    // transcripts (all timestamped 10:00:11Z onward).
    const result = new ClaudeNativeAnalyzer({
      baseDirs: [HAPPY_PROJECTS],
      scope: { toTimestamp: '2026-05-01T10:00:10Z' },
    }).analyze();
    expect(result.sessions).toHaveLength(1);
    expect(result.subagents).toHaveLength(0);
    expect(result.sessions[0].subagentCount).toBe(0);
    // Totals equal the main stream only — no phantom subagent contribution.
    expect(result.totals.outputTokens).toBe(result.mainStreamTotals.outputTokens);
  });
});

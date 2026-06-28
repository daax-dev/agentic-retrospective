/**
 * Source attribution (Tier 2 — Epic #44, Issue #38).
 *
 * Answers "what consumed the context": a direct response, a built-in tool, a
 * subagent, a skill, or an MCP server/method. Consumes the read-only normalized
 * dataset from #36 (`ClaudeIngestionResult`) and produces:
 *  - spend rolled up by source category and by specific identity;
 *  - a classification for every tool call;
 *  - per-prompt causal chains (prompt -> tools -> results -> tokens).
 *
 * Design (PRD 03):
 *  - Classification is by tool NAME only (`mcp__*`, `Agent`/`Task`, `Skill`,
 *    else built-in). It never scans free text, so em-dash / literal `--` lines
 *    cannot produce false positives — matching the codebase's "no fragile text
 *    heuristics" rule.
 *  - Token spend is attributed with the existing `ClaudeUsage` ledger. Cache-read
 *    is whole-session overhead (epic principle / PRD 02), excluded from the
 *    per-source buckets and reported separately as `cacheReadOverhead`, so the
 *    invariant is `sum(bySource) + cacheReadOverhead === result.totals` (no
 *    double-count: main-stream assistant usage + subagent `usageTotals`).
 *  - Subagent spend is attributed to the spawning prompt via the deterministic
 *    `spawnedByToolUseId` link; when lineage is unknown it is reported at session
 *    level, never folded into "direct response".
 *
 * Out of scope (documented, not undercounted silently):
 *  - Slash-command (`<command-name>`) invocations: those live on `user` records
 *    that carry no `usage`, so they bear no attributable token spend here; their
 *    cost surfaces in the assistant turns that follow. Command/asset utilization
 *    is PRD 06.
 *  - A skill's *downstream* cost (context it injects into later turns) is not
 *    split out; this PRD attributes the skill identity and its own turn, which is
 *    what AC #3 requires.
 *  - Per-call token splitting within a single multi-tool turn: tokens follow the
 *    turn's highest-priority call (see `CATEGORY_PRIORITY`); every call still
 *    keeps its own classification for the by-call list and identity counts.
 */

import {
  type ClaudeIngestionResult,
  type ClaudeToolCall,
  type ClaudeTurn,
  type ClaudeUsage,
  addUsage,
  cloneUsage,
  emptyUsage,
} from './contract.js';
import { SUBAGENT_LAUNCH_TOOLS } from './parse.js';

/** Where a unit of context spend came from. */
export type SourceCategory = 'mcp' | 'subagent' | 'skill' | 'tool' | 'direct';

/** A category a tool call can resolve to (`direct` only applies to no-tool turns). */
export type ToolCategory = Exclude<SourceCategory, 'direct'>;

/**
 * Priority when one spend-bearing turn issues several tool calls: the highest
 * present category owns the turn's tokens (PRD 03 §1). `direct` is the floor —
 * a turn with no tool calls.
 */
export const CATEGORY_PRIORITY: Record<SourceCategory, number> = {
  mcp: 4,
  subagent: 3,
  skill: 2,
  tool: 1,
  direct: 0,
};

/** Classification of a single tool invocation. */
export interface ToolClassification {
  category: ToolCategory;
  /** Specific identity: MCP `server/method`, subagent type, skill id, or tool name. */
  identity: string;
  /** MCP server, when `category === 'mcp'`. */
  mcpServer?: string;
  /** MCP method, when `category === 'mcp'`. */
  mcpMethod?: string;
}

/** A tool call plus its resolved source classification and result evidence. */
export interface AttributedToolCall {
  sessionId: string;
  turnUuid: string;
  toolUseId: string;
  name: string;
  category: ToolCategory;
  identity: string;
  mcpServer?: string;
  mcpMethod?: string;
  /** `true` when this call ran inside a subagent transcript (sidechain). */
  isSidechain: boolean;
  resultBytes?: number;
  isError?: boolean;
}

/** Token spend rolled up under one source category. */
export interface SourceSpend {
  category: SourceCategory;
  usage: ClaudeUsage;
  /** Spend-bearing events here: main turns for tools/direct, subagents for `subagent`. */
  events: number;
}

/** Token spend rolled up under one specific identity within a category. */
export interface IdentitySpend {
  category: SourceCategory;
  identity: string;
  usage: ClaudeUsage;
  /**
   * Spend-bearing events charged to this identity: assistant turns (for
   * tool/skill/mcp/direct) or subagents (for `subagent`). This is NOT a raw
   * tool-call frequency — a turn's tokens are charged only to its
   * highest-priority call, so a lower-priority call sharing a turn (e.g. a Bash
   * call in an MCP-winning turn) is not counted here. Per-call classification
   * and counts are available in `AttributionResult.toolCalls`.
   */
  events: number;
}

/** A subagent whose spawning tool call was not found (lineage unknown). */
export interface UnlinkedSubagentSpend {
  sessionId: string;
  agentId: string;
  agentType: string;
  usage: ClaudeUsage;
}

/**
 * One prompt and everything it caused: the assistant/tool-result turns in its
 * segment, the tool calls it triggered (with result sizes), the subagents it
 * spawned, and the tokens the whole chain cost. `promptUuid` is `session:<id>`
 * for an orphan segment (a session that opens without a leading user prompt).
 */
export interface PromptChain {
  sessionId: string;
  promptUuid: string;
  promptTimestamp?: string;
  turnUuids: string[];
  toolCalls: AttributedToolCall[];
  subagentIds: string[];
  /** The prompt's FULL spend, including its cache-read overhead. */
  usage: ClaudeUsage;
  /**
   * Spend broken down by source. Cache-read is excluded here (session overhead),
   * so `sum(bySource) + usage.cacheReadTokens === usage`.
   */
  bySource: SourceSpend[];
}

/** The full attribution view over one ingestion result. */
export interface AttributionResult {
  bySource: SourceSpend[];
  byIdentity: IdentitySpend[];
  /**
   * Cache-read tokens summed across all turns/subagents. Whole-session overhead,
   * excluded from `bySource`/`byIdentity`. Invariant:
   * `sum(bySource) + cacheReadOverhead === ingestion.totals`.
   */
  cacheReadOverhead: number;
  toolCalls: AttributedToolCall[];
  prompts: PromptChain[];
  unlinkedSubagents: UnlinkedSubagentSpend[];
  warnings: string[];
}

const MCP_PREFIX = 'mcp__';

/**
 * Classify a tool by name (and target, for skills/subagents). Deterministic and
 * name-only — never inspects free text. Priority is encoded by the names
 * themselves: an `mcp__*` method, an `Agent`/`Task` launch, a `Skill` call, else
 * a built-in tool.
 */
export function classifyTool(name: string, target?: string): ToolClassification {
  if (name.startsWith(MCP_PREFIX)) {
    const { server, method } = parseMcpName(name);
    return { category: 'mcp', identity: `${server}/${method}`, mcpServer: server, mcpMethod: method };
  }
  if (SUBAGENT_LAUNCH_TOOLS.has(name)) {
    return { category: 'subagent', identity: target ?? 'unknown' };
  }
  if (name === 'Skill') {
    return { category: 'skill', identity: target ?? 'unknown' };
  }
  return { category: 'tool', identity: name };
}

/**
 * Split an `mcp__<server>__<method>` tool name. Server and method may both
 * contain underscores, so the split is on the FIRST `__` after the prefix
 * (`mcp__claude_ai_Gmail__authenticate` -> server `claude_ai_Gmail`, method
 * `authenticate`). Malformed names degrade to `unknown` rather than throwing.
 */
export function parseMcpName(name: string): { server: string; method: string } {
  const rest = name.startsWith(MCP_PREFIX) ? name.slice(MCP_PREFIX.length) : name;
  const sep = rest.indexOf('__');
  if (sep === -1) {
    return { server: rest || 'unknown', method: 'unknown' };
  }
  return {
    server: rest.slice(0, sep) || 'unknown',
    method: rest.slice(sep + 2) || 'unknown',
  };
}

/** Resolve the category that owns a turn's tokens: highest-priority call, else direct. */
function resolveTurnClassification(
  calls: ToolClassification[]
): { category: SourceCategory; identity: string } {
  let best: ToolClassification | undefined;
  for (const c of calls) {
    if (!best || CATEGORY_PRIORITY[c.category] > CATEGORY_PRIORITY[best.category]) {
      best = c;
    }
  }
  return best ? { category: best.category, identity: best.identity } : { category: 'direct', identity: 'direct' };
}

/**
 * Attribute every unit of context spend in an ingestion result to its source.
 *
 * Token spend is split so that `sum(bySource) + cacheReadOverhead` reconciles to
 * `result.totals`:
 *  - main-stream assistant turns are charged to the category of their
 *    highest-priority tool call (or `direct` when they call no tool);
 *  - each subagent's `usageTotals` is charged to `subagent`;
 *  - cache-read tokens are pulled out as whole-session overhead.
 */
export function attributeSpend(result: ClaudeIngestionResult): AttributionResult {
  const warnings: string[] = [];

  // Index turns once: identity lookups and sidechain flagging reuse it. Keyed by
  // (sessionId, uuid) — the merged contract dedupes per session, so `uuid` is
  // only unique within a session; a bare key could collide across sessions.
  const turnById = new Map<string, ClaudeTurn>();
  for (const turn of result.turns) turnById.set(scopedKey(turn.sessionId, turn.uuid), turn);

  // 1. Classify every tool call (main + subagent) up front — AC #1. Keyed by
  // (sessionId, toolUseId) for the same per-session-uniqueness reason: a bare
  // key would let one session's call clobber another's and silently drop it.
  const classified = new Map<string, AttributedToolCall>();
  for (const call of result.toolCalls) {
    const cls = classifyTool(call.name, call.target);
    const issuing = turnById.get(scopedKey(call.sessionId, call.turnUuid));
    classified.set(scopedKey(call.sessionId, call.toolUseId), toAttributed(call, cls, issuing?.isSidechain ?? false));
  }
  const toolCalls = [...classified.values()];

  // Index calls by the (session-scoped) turn that issued them.
  const callsByTurn = new Map<string, AttributedToolCall[]>();
  for (const call of toolCalls) {
    const key = scopedKey(call.sessionId, call.turnUuid);
    const list = callsByTurn.get(key);
    if (list) list.push(call);
    else callsByTurn.set(key, [call]);
  }

  // 2. Category + identity rollups over main turns and subagents. Cache-read
  // tokens are whole-session overhead (epic principle / PRD 02), NOT attributable
  // to a single source — they are stripped from the buckets and accumulated into
  // `cacheReadOverhead`. The invariant therefore is:
  //   sum(bySource usage) + cacheReadOverhead === result.totals.
  const bySource = new SpendBook<SourceCategory>();
  const byIdentity = new IdentityBook();
  let cacheReadOverhead = 0;

  for (const turn of result.turns) {
    if (turn.isSidechain || turn.role !== 'assistant' || !turn.usage) continue;
    const turnCls = (callsByTurn.get(scopedKey(turn.sessionId, turn.uuid)) ?? []).map(c => ({
      category: c.category,
      identity: c.identity,
    }));
    const { category, identity } = resolveTurnClassification(turnCls);
    bySource.add(category, attributableUsage(turn.usage));
    byIdentity.add(category, identity, attributableUsage(turn.usage));
    cacheReadOverhead += turn.usage.cacheReadTokens;
  }

  for (const sub of result.subagents) {
    bySource.add('subagent', attributableUsage(sub.usageTotals));
    byIdentity.add('subagent', sub.agentType, attributableUsage(sub.usageTotals));
    cacheReadOverhead += sub.usageTotals.cacheReadTokens;
  }

  // 3. Per-prompt causal chains + subagent lineage attribution.
  const { prompts, unlinkedSubagents } = buildPromptChains(result, turnById, callsByTurn, warnings);

  return {
    bySource: bySource.toArray(orderedCategories),
    byIdentity: byIdentity.toArray(),
    cacheReadOverhead,
    toolCalls,
    prompts,
    unlinkedSubagents,
    warnings,
  };
}

/**
 * The portion of a turn's usage attributable to a specific source: everything
 * EXCEPT cache-read, which is whole-session overhead and tracked separately
 * (epic principle / PRD 02). Returns a copy; the source usage is not mutated.
 */
function attributableUsage(u: ClaudeUsage): ClaudeUsage {
  const copy = cloneUsage(u);
  copy.cacheReadTokens = 0;
  return copy;
}

const orderedCategories: SourceCategory[] = ['mcp', 'subagent', 'skill', 'tool', 'direct'];

/** Session-scoped identity key (`uuid`/`toolUseId` are only unique within a session). */
function scopedKey(sessionId: string, id: string): string {
  return `${sessionId}::${id}`;
}

function toAttributed(
  call: ClaudeToolCall,
  cls: ToolClassification,
  isSidechain: boolean
): AttributedToolCall {
  return {
    sessionId: call.sessionId,
    turnUuid: call.turnUuid,
    toolUseId: call.toolUseId,
    name: call.name,
    category: cls.category,
    identity: cls.identity,
    mcpServer: cls.mcpServer,
    mcpMethod: cls.mcpMethod,
    isSidechain,
    resultBytes: call.resultBytes,
    isError: call.isError,
  };
}

/**
 * Group main-stream turns into prompt segments and attribute spend per prompt.
 *
 * Segment boundary (deterministic, normalized-data only): a `user` turn starts a
 * new prompt UNLESS its parent is an assistant turn that issued a tool call — in
 * that case the user turn is a `tool_result` continuation of the same prompt.
 * An assistant final answer (no tool call) therefore ends a segment; the next
 * user turn opens the next prompt.
 *
 * Known limitation: a user interrupt sent immediately after a tool_use turn is
 * read as a continuation (its parent issued a tool). Acceptable — interrupts are
 * rare and indistinguishable from tool results without richer record content.
 */
function buildPromptChains(
  result: ClaudeIngestionResult,
  turnById: Map<string, ClaudeTurn>,
  callsByTurn: Map<string, AttributedToolCall[]>,
  warnings: string[]
): { prompts: PromptChain[]; unlinkedSubagents: UnlinkedSubagentSpend[] } {
  // Turns grouped by session, preserving ingestion (file) order. Sidechains are
  // excluded — their spend is represented through subagent `usageTotals`.
  const bySession = new Map<string, ClaudeTurn[]>();
  for (const turn of result.turns) {
    if (turn.isSidechain) continue;
    const list = bySession.get(turn.sessionId);
    if (list) list.push(turn);
    else bySession.set(turn.sessionId, [turn]);
  }

  // Subagent usage keyed per session (agentId is only unique within a session).
  const subUsageBySessionAgent = new Map<string, ClaudeUsage>();
  for (const sub of result.subagents) {
    subUsageBySessionAgent.set(scopedKey(sub.sessionId, sub.agentId), sub.usageTotals);
  }

  // (sessionId, toolUseId) -> the prompt segment it belongs to (subagent lineage join).
  const segmentByToolUseId = new Map<string, PromptChain>();
  const prompts: PromptChain[] = [];

  for (const [sessionId, turns] of bySession) {
    let current: PromptChain | null = null;

    const open = (promptTurn: ClaudeTurn | null): PromptChain => {
      const seg: PromptChain = {
        sessionId,
        promptUuid: promptTurn?.uuid ?? `session:${sessionId}`,
        promptTimestamp: promptTurn?.timestamp,
        turnUuids: [],
        toolCalls: [],
        subagentIds: [],
        usage: emptyUsage(),
        bySource: [],
      };
      prompts.push(seg);
      return seg;
    };

    for (const turn of turns) {
      const startsPrompt = turn.role === 'user' && !isToolResultTurn(turn, turnById, callsByTurn);
      if (startsPrompt || !current) {
        current = open(startsPrompt ? turn : null);
      }
      current.turnUuids.push(turn.uuid);
      if (turn.role === 'assistant' && turn.usage) addUsage(current.usage, turn.usage);

      for (const call of callsByTurn.get(scopedKey(turn.sessionId, turn.uuid)) ?? []) {
        current.toolCalls.push(call);
        segmentByToolUseId.set(scopedKey(call.sessionId, call.toolUseId), current);
      }
    }
  }

  // Attribute each subagent's spend to the prompt that spawned it; otherwise
  // report it at session level (lineage unknown) — never as direct response.
  const unlinkedSubagents: UnlinkedSubagentSpend[] = [];
  for (const sub of result.subagents) {
    const seg = sub.spawnedByToolUseId
      ? segmentByToolUseId.get(scopedKey(sub.sessionId, sub.spawnedByToolUseId))
      : undefined;
    if (seg) {
      seg.subagentIds.push(sub.agentId);
      addUsage(seg.usage, sub.usageTotals);
    } else {
      unlinkedSubagents.push({
        sessionId: sub.sessionId,
        agentId: sub.agentId,
        agentType: sub.agentType,
        usage: cloneUsage(sub.usageTotals),
      });
      if (sub.spawnedByToolUseId) {
        warnings.push(
          `Subagent ${sub.agentId} links to tool call ${sub.spawnedByToolUseId}, which is not in any prompt segment; attributed at session level.`
        );
      }
    }
  }

  // Per-prompt category breakdown (after subagent spend is folded in). The sum
  // of a segment's `bySource` usage equals its `usage` total.
  for (const seg of prompts) {
    seg.bySource = computeSegmentBySource(seg, turnById, callsByTurn, subUsageBySessionAgent);
  }

  return { prompts, unlinkedSubagents };
}

/** A `user` turn is a tool_result carrier when its parent assistant issued a tool call. */
function isToolResultTurn(
  turn: ClaudeTurn,
  turnById: Map<string, ClaudeTurn>,
  callsByTurn: Map<string, AttributedToolCall[]>
): boolean {
  if (turn.role !== 'user' || !turn.parentUuid) return false;
  // The parent record is in the same session (parentUuid is an in-session ref).
  const parent = turnById.get(scopedKey(turn.sessionId, turn.parentUuid));
  if (!parent || parent.role !== 'assistant') return false;
  return callsByTurn.has(scopedKey(parent.sessionId, parent.uuid));
}

/**
 * Category rollup within one prompt segment. Each assistant turn is charged to
 * its highest-priority call's category (or `direct`); the segment's linked
 * subagent totals are charged to `subagent`. The summed usage equals `seg.usage`.
 */
function computeSegmentBySource(
  seg: PromptChain,
  turnById: Map<string, ClaudeTurn>,
  callsByTurn: Map<string, AttributedToolCall[]>,
  subUsageBySessionAgent: Map<string, ClaudeUsage>
): SourceSpend[] {
  const book = new SpendBook<SourceCategory>();
  for (const uuid of seg.turnUuids) {
    const turn = turnById.get(scopedKey(seg.sessionId, uuid));
    if (!turn || turn.role !== 'assistant' || !turn.usage) continue;
    const turnCls = (callsByTurn.get(scopedKey(seg.sessionId, uuid)) ?? []).map(c => ({
      category: c.category,
      identity: c.identity,
    }));
    const { category } = resolveTurnClassification(turnCls);
    book.add(category, attributableUsage(turn.usage));
  }
  for (const agentId of seg.subagentIds) {
    const usage = subUsageBySessionAgent.get(scopedKey(seg.sessionId, agentId));
    if (usage) book.add('subagent', attributableUsage(usage));
  }
  return book.toArray(orderedCategories);
}

/** Accumulator keyed by category. */
class SpendBook<K extends string> {
  private readonly map = new Map<K, { usage: ClaudeUsage; events: number }>();

  add(key: K, usage: ClaudeUsage, events = 1): void {
    let entry = this.map.get(key);
    if (!entry) {
      entry = { usage: emptyUsage(), events: 0 };
      this.map.set(key, entry);
    }
    addUsage(entry.usage, usage);
    entry.events += events;
  }

  toArray(order: K[]): SourceSpend[] {
    const out: SourceSpend[] = [];
    for (const key of order) {
      const entry = this.map.get(key);
      if (entry) out.push({ category: key as SourceCategory, usage: entry.usage, events: entry.events });
    }
    return out;
  }
}

/** Accumulator keyed by `category::identity`. */
class IdentityBook {
  private readonly map = new Map<
    string,
    { category: SourceCategory; identity: string; usage: ClaudeUsage; events: number }
  >();

  add(category: SourceCategory, identity: string, usage: ClaudeUsage): void {
    const key = `${category}::${identity}`;
    let entry = this.map.get(key);
    if (!entry) {
      entry = { category, identity, usage: emptyUsage(), events: 0 };
      this.map.set(key, entry);
    }
    addUsage(entry.usage, usage);
    entry.events += 1;
  }

  toArray(): IdentitySpend[] {
    return [...this.map.values()]
      .map(e => ({ category: e.category, identity: e.identity, usage: e.usage, events: e.events }))
      .sort(
        (a, b) =>
          CATEGORY_PRIORITY[b.category] - CATEGORY_PRIORITY[a.category] ||
          a.identity.localeCompare(b.identity)
      );
  }
}

/** Sum the billable-and-output tokens an attribution carries (helper for reports/tests). */
export function totalAttributedTokens(usage: ClaudeUsage): number {
  return usage.inputTokens + usage.cacheCreationTokens + usage.cacheReadTokens + usage.outputTokens;
}

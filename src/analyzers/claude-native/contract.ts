/**
 * Claude-native telemetry — normalized data contract (Tier 1 foundation).
 *
 * Shapes here mirror `docs/specs/claude-native-telemetry.md` §3. They are the
 * stable internal model the ingester emits and downstream PRs (token accounting,
 * attribution, detectors) consume. Field names are part of the contract — keep
 * them in sync with the spec.
 */

/**
 * Claude Code version the fixtures and field mapping were captured against.
 * The session format is undocumented and versioned; the ingester records the
 * observed `version` and warns when it drifts from this (inventory §7).
 */
export const FIXTURE_SCHEMA_VERSION = '2.1.150';

/** Normalized per-turn token ledger (from assistant `message.usage`, inventory §2.1). */
export interface ClaudeUsage {
  inputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  outputTokens: number;
  serviceTier?: string;
  speed?: string;
  serverToolUse: {
    webSearch: number;
    webFetch: number;
  };
}

/** One normalized conversation record: a user/assistant message or an attachment. */
export interface ClaudeTurn {
  sessionId: string;
  uuid: string;
  parentUuid: string | null;
  /** `message` for user/assistant records; `attachment` for hook/system events. */
  kind: 'message' | 'attachment';
  /** Present for `kind: 'message'`; omitted for attachments. */
  role?: 'user' | 'assistant';
  model?: string;
  timestamp?: string;
  gitBranch?: string;
  cwd?: string;
  /** Project directory slug the session file lives under. */
  projectSlug?: string;
  /** Present for assistant turns; user/attachment turns carry no usage. */
  usage?: ClaudeUsage;
  isSidechain: boolean;
  /** Present for subagent (sidechain) turns; absent on the main stream. */
  agentId?: string;
}

/** A normalized tool invocation extracted from an assistant `tool_use` block. */
export interface ClaudeToolCall {
  sessionId: string;
  /** `uuid` of the assistant turn that issued the call. */
  turnUuid: string;
  toolUseId: string;
  name: string;
  /**
   * Tool-specific target (inventory §2.2): file_path | pattern | command | url |
   * subagent_type. `undefined` when the tool is unknown or carries no target.
   */
  target?: string;
  /** Result size in bytes, resolved from inline body OR tool-results/<id>.txt. */
  resultBytes?: number;
  /** From the matching `tool_result` block; `undefined` when no result observed. */
  isError?: boolean;
}

/** A spawned subagent, resolved from `subagents/agent-<id>.{jsonl,meta.json}`. */
export interface ClaudeSubagent {
  sessionId: string;
  agentId: string;
  /** From the `.meta.json` sidecar; the only guaranteed sidecar field (§3.1). */
  agentType: string;
  /** Optional sidecar field. */
  description?: string;
  /**
   * Links to the parent `Agent`/`Task` tool_use when the sidecar carries
   * `toolUseId`. Absent => lineage unknown; attribute at session level.
   */
  spawnedByToolUseId?: string;
  /** `true` when no `toolUseId` sidecar field was present (lineage unknown). */
  lineageUnknown: boolean;
  /** Summed from the subagent's own deduped transcript usage. */
  usageTotals: ClaudeUsage;
}

/** Per-session rollup. `mainStreamTotals` excludes subagents; `totals` includes them. */
export interface ClaudeSessionSummary {
  sessionId: string;
  projectSlug?: string;
  cwd?: string;
  gitBranch?: string;
  version?: string;
  firstTimestamp?: string;
  lastTimestamp?: string;
  turnCount: number;
  toolCallCount: number;
  subagentCount: number;
  mainStreamTotals: ClaudeUsage;
  totals: ClaudeUsage;
}

/** Counters describing what the ingester saw, for observability and tests. */
export interface IngestionStats {
  baseDirsScanned: number;
  sessionsDiscovered: number;
  linesParsed: number;
  linesSkipped: number;
  recordsNormalized: number;
  duplicatesCollapsed: number;
  subagentsResolved: number;
  externalToolResultsResolved: number;
}

/** The full normalized dataset emitted by one ingestion run. */
export interface ClaudeIngestionResult {
  turns: ClaudeTurn[];
  toolCalls: ClaudeToolCall[];
  subagents: ClaudeSubagent[];
  sessions: ClaudeSessionSummary[];
  /** Grand totals across all sessions, INCLUDING subagent spend. */
  totals: ClaudeUsage;
  /** Grand totals across the main stream only, EXCLUDING subagents. */
  mainStreamTotals: ClaudeUsage;
  /** Distinct `version` values observed across ingested records. */
  observedVersions: string[];
  /** Non-fatal warnings (schema drift, sidecar gaps, etc.). */
  warnings: string[];
  stats: IngestionStats;
}

/** Empty usage accumulator. */
export function emptyUsage(): ClaudeUsage {
  return {
    inputTokens: 0,
    cacheCreationTokens: 0,
    cacheReadTokens: 0,
    outputTokens: 0,
    serverToolUse: { webSearch: 0, webFetch: 0 },
  };
}

/** Deep copy a usage object (so in-place `addUsage` does not mutate the source). */
export function cloneUsage(u: ClaudeUsage): ClaudeUsage {
  return {
    inputTokens: u.inputTokens,
    cacheCreationTokens: u.cacheCreationTokens,
    cacheReadTokens: u.cacheReadTokens,
    outputTokens: u.outputTokens,
    serviceTier: u.serviceTier,
    speed: u.speed,
    serverToolUse: { ...u.serverToolUse },
  };
}

/** Add `b` into `a` in place and return `a`. Service tier/speed are not summed. */
export function addUsage(a: ClaudeUsage, b: ClaudeUsage): ClaudeUsage {
  a.inputTokens += b.inputTokens;
  a.cacheCreationTokens += b.cacheCreationTokens;
  a.cacheReadTokens += b.cacheReadTokens;
  a.outputTokens += b.outputTokens;
  a.serverToolUse.webSearch += b.serverToolUse.webSearch;
  a.serverToolUse.webFetch += b.serverToolUse.webFetch;
  return a;
}

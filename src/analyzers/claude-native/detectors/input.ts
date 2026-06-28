/**
 * Aggregation boundary: turn a read-only `ClaudeIngestionResult` (#36) into the
 * normalized per-session stats the pure detectors consume. All I/O and
 * cross-record joins happen here, NOT inside detectors (PRD 04 §Behaviour).
 *
 * Boundary rules (documented so detector output is deterministic):
 *  - Only assistant turns carrying `usage` become `TurnStat`s.
 *  - Only MAIN-STREAM tool calls are included; sidechain (subagent) calls are
 *    represented via subagent token rollups elsewhere and are not re-counted
 *    here, so a session's tool-frequency signals reflect the main agent.
 *  - Tokens are "attributable": input + cache-creation + output. Cache-read is
 *    whole-session overhead (epic principle / PRD 02) and excluded everywhere.
 *  - Ingestion (file) order is preserved so window/sequence detectors are stable.
 */

import type {
  ClaudeIngestionResult,
  ClaudeSessionSummary,
  ClaudeTurn,
  ClaudeUsage,
} from '../contract.js';
import type { CohortBaseline, DetectorInput, SessionStats, ToolCallStat, TurnStat } from './types.js';

/** Attributable tokens for a usage ledger: input + cache-creation + output. */
export function attributableTokens(usage: ClaudeUsage): number {
  return usage.inputTokens + usage.cacheCreationTokens + usage.outputTokens;
}

/** Model tier ordering used by model-substitution. Higher = more capable. */
export const MODEL_TIER: Record<string, number> = { haiku: 1, sonnet: 2, opus: 3 };

/**
 * Resolve a model id to a capability tier by matching a known family substring
 * (`haiku` < `sonnet` < `opus`). Unknown / absent models return `undefined` so
 * the detector skips them rather than guessing.
 */
export function modelTier(model?: string): number | undefined {
  if (!model) return undefined;
  const lower = model.toLowerCase();
  for (const family of Object.keys(MODEL_TIER)) {
    if (lower.includes(family)) return MODEL_TIER[family];
  }
  return undefined;
}

/**
 * Build the detector input from one ingestion result. Pure transform — the
 * `result` is read-only and never mutated.
 */
export function buildDetectorInput(result: ClaudeIngestionResult): DetectorInput {
  const summaryById = new Map<string, ClaudeSessionSummary>();
  for (const s of result.sessions) summaryById.set(s.sessionId, s);

  // (sessionId, uuid) -> turn, to flag sidechain calls and source timestamps.
  const turnByKey = new Map<string, ClaudeTurn>();
  for (const turn of result.turns) turnByKey.set(key(turn.sessionId, turn.uuid), turn);

  // Assistant turns carrying usage, grouped per session in ingestion order.
  const turnsBySession = new Map<string, TurnStat[]>();
  for (const turn of result.turns) {
    if (turn.isSidechain || turn.role !== 'assistant' || !turn.usage) continue;
    push(turnsBySession, turn.sessionId, {
      uuid: turn.uuid,
      model: turn.model,
      timestamp: turn.timestamp,
      tokens: attributableTokens(turn.usage),
    });
  }

  // Main-stream tool calls grouped per session in ingestion order.
  const callsBySession = new Map<string, ToolCallStat[]>();
  for (const call of result.toolCalls) {
    const issuing = turnByKey.get(key(call.sessionId, call.turnUuid));
    if (issuing?.isSidechain) continue; // main stream only
    push(callsBySession, call.sessionId, {
      toolUseId: call.toolUseId,
      turnUuid: call.turnUuid,
      name: call.name,
      target: call.target,
      resultBytes: call.resultBytes,
      isError: call.isError === true,
      timestamp: issuing?.timestamp,
    });
  }

  // Union of session ids seen across summaries, turns, and calls.
  const sessionIds = new Set<string>([
    ...summaryById.keys(),
    ...turnsBySession.keys(),
    ...callsBySession.keys(),
  ]);

  const sessions: SessionStats[] = [];
  for (const sessionId of [...sessionIds].sort()) {
    const turns = turnsBySession.get(sessionId) ?? [];
    const toolCalls = callsBySession.get(sessionId) ?? [];
    const summary = summaryById.get(sessionId);
    const totalTokens = summary
      ? attributableTokens(summary.totals)
      : turns.reduce((sum, t) => sum + t.tokens, 0);
    sessions.push({ sessionId, turns, toolCalls, totalTokens });
  }

  return { sessions, cohortBaseline: computeBaseline(sessions) };
}

/** Cohort baseline: mean + population stdev of per-session attributable tokens. */
export function computeBaseline(sessions: SessionStats[]): CohortBaseline {
  const n = sessions.length;
  if (n === 0) return { sessionCount: 0, meanTokens: 0, stdevTokens: 0 };
  const totals = sessions.map(s => s.totalTokens);
  const mean = totals.reduce((a, b) => a + b, 0) / n;
  const variance = totals.reduce((acc, t) => acc + (t - mean) ** 2, 0) / n;
  return { sessionCount: n, meanTokens: mean, stdevTokens: Math.sqrt(variance) };
}

function key(sessionId: string, id: string): string {
  return `${sessionId}::${id}`;
}

function push<T>(map: Map<string, T[]>, k: string, value: T): void {
  const list = map.get(k);
  if (list) list.push(value);
  else map.set(k, [value]);
}

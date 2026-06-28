/**
 * Waste & efficiency detection — public types (Tier 3 — Epic #44, Issue #39).
 *
 * Detectors are small, pure, rule-based functions over the normalized,
 * aggregated telemetry from #36 (ingestion) and #38 (attribution). Each emits
 * `ClaudeFinding` records whose shape mirrors `docs/specs/claude-native-telemetry.md`
 * §3 — every finding carries a resolvable evidence reference back to the
 * transcript (`sessionId` + `uuid`/`toolUseId`), never a vague claim.
 *
 * Token denomination: findings quantify waste in TOKENS (`estimatedWasteTokens`),
 * computed from the `ClaudeUsage` ledger already on `main`. Dollar-cost
 * accounting (#37) is an additive enhancement layered on top later; it is not a
 * prerequisite — the spec's finding shape is token-, not dollar-, denominated.
 */

/** The three scoring dimensions waste/efficiency findings feed (PRD 04 §Scoring). */
export type FindingDimension =
  | 'Collaboration Efficiency'
  | 'Quality & Maintainability'
  | 'Delivery Predictability';

/** Finding severity, ordered low < medium < high. */
export type FindingSeverity = 'low' | 'medium' | 'high';

/**
 * A resolvable pointer back to the transcript. `sessionId` is always present;
 * at least one of `uuid` (a turn) or `toolUseId` (a tool call) MUST be set so
 * the finding can be resolved against the `ClaudeIngestionResult` (AC#2).
 */
export interface FindingEvidence {
  sessionId: string;
  /** A turn `uuid` (assistant/user record). */
  uuid?: string;
  /** A `toolUseId` (specific tool invocation). */
  toolUseId?: string;
}

/** One waste/efficiency finding (spec §3 `ClaudeFinding`). */
export interface ClaudeFinding {
  /** Detector name (stable id, e.g. `giant-tool-output`). */
  detector: string;
  severity: FindingSeverity;
  evidence: FindingEvidence;
  /** Estimated wasted tokens, when quantifiable; omitted otherwise. */
  estimatedWasteTokens?: number;
  dimension: FindingDimension;
  /** Actionable remediation hint. */
  remediation: string;
}

/** Stable ids for the initial detector set (Issue #39). */
export const DETECTOR_NAMES = [
  'giant-tool-output',
  'repeated-file-reads',
  'tool-overuse',
  'thrash',
  'error-storm',
  'retry-storm',
  'one-shot-failure',
  'skill-over-firing',
  'model-substitution',
  'cost-outlier',
] as const;

export type DetectorName = (typeof DETECTOR_NAMES)[number];

/** A normalized assistant turn the detectors reason over (main stream only). */
export interface TurnStat {
  uuid: string;
  /** Model id reported on the turn (e.g. `claude-opus-4`), if any. */
  model?: string;
  timestamp?: string;
  /** Attributable tokens: input + cache-creation + output (cache-read excluded). */
  tokens: number;
}

/**
 * A normalized tool call the detectors reason over (main stream only — sidechain
 * calls are represented through subagent rollups, not re-counted here). Kept in
 * ingestion (file) order so window/sequence detectors are deterministic.
 */
export interface ToolCallStat {
  toolUseId: string;
  turnUuid: string;
  name: string;
  /** Tool-specific target (file_path | command | pattern | url | subagent_type). */
  target?: string;
  resultBytes?: number;
  isError: boolean;
  timestamp?: string;
}

/** Per-session aggregate the detectors consume. */
export interface SessionStats {
  sessionId: string;
  /** Assistant turns carrying usage, in ingestion order. */
  turns: TurnStat[];
  /** Main-stream tool calls, in ingestion order. */
  toolCalls: ToolCallStat[];
  /** Session-total attributable tokens (incl. subagents; cache-read excluded). */
  totalTokens: number;
}

/** Cohort baseline used by relative detectors (cost outlier). */
export interface CohortBaseline {
  /** Number of sessions in the cohort. */
  sessionCount: number;
  /** Mean session attributable tokens. */
  meanTokens: number;
  /** Population standard deviation of session attributable tokens. */
  stdevTokens: number;
}

/** The full aggregated input ("stats") detectors run over. */
export interface DetectorInput {
  sessions: SessionStats[];
  /** Cohort baseline derived from `sessions` (used when no explicit baseline is passed). */
  cohortBaseline: CohortBaseline;
}

/**
 * A detector: a pure function over aggregated stats and an optional cohort
 * baseline. Per Issue #39: `run(stats, baseline?) => Finding[]`. No I/O.
 */
export interface Detector {
  name: DetectorName;
  dimension: FindingDimension;
  run(stats: DetectorInput, baseline?: CohortBaseline): ClaudeFinding[];
}

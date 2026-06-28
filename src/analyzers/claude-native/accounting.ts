/**
 * Token & cost accounting (Tier 2 — Epic #44, Issue #37).
 *
 * Turns the normalized, sprint-window-scoped dataset from #36
 * (`ClaudeIngestionResult`) into a correct token ledger and computed cost,
 * aggregated over the window and secondarily by model / session / day / project
 * (PRD 02).
 *
 * Design:
 *  - Per-turn ledger (PRD 02 §1): billable input = `input + cache-creation`;
 *    cache-read tracked separately (whole-session overhead, billed ~0.1×, not a
 *    per-tool cost — PRD 02 / epic principle); output; server tool use counts.
 *    The cache-creation TTL split (`ephemeral_5m/1h`) is NOT surfaced by the
 *    frozen #36 contract, so it is not split here (token counts are unaffected;
 *    cost uses the 5-minute cache-write multiplier — see `pricing.ts`).
 *  - Cost (PRD 02 §2): computed from tokens × the offline price table keyed by
 *    model, with each token class billed at its own rate (input, cache-creation,
 *    cache-read, output). The local `costUSD` is never trusted. A turn on a model
 *    with no price keeps its tokens and reports `cost: null` / `costKnown:false`,
 *    never priced 0 (AC #3); its raw model id is recorded in `unknownModels`.
 *  - Aggregation (PRD 02 §4): the sprint window is the unit of a retrospective —
 *    windowing is applied upstream by the ingester's scope filter, so this layer
 *    rolls up exactly the in-window, de-duplicated turns the ingester emitted.
 *    Cost is bucketed by canonical model (a bucket is single-model, so its cost
 *    is all-known or all-unknown); session/day/project buckets sum the priced
 *    turns and flag whether any unpriced tokens were present.
 *
 * Reconciliation invariant (the anti-slop / AC #4 guard): subagent turns are
 * already part of `result.turns` (the ingester emits `[...main, ...subagent]`),
 * each carrying its own usage, so iterating `result.turns` ONCE reconciles to
 * `result.totals`:
 *   sum(ledger over turns) === sum(byModel) === result.totals  (field-exact).
 * Subagent `usageTotals` is therefore NOT added again here (it would double-count).
 */

import {
  type ClaudeIngestionResult,
  type ClaudeTurn,
  type ClaudeUsage,
} from './contract.js';
import { type ModelPricing, PRICES_AS_OF, getPricing } from './pricing.js';

/** Token sums for one turn or one rollup bucket. */
export interface LedgerUsage {
  inputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  outputTokens: number;
  /** PRD 02 §1 billable input = `inputTokens + cacheCreationTokens`. */
  billableInputTokens: number;
  serverWebSearch: number;
  serverWebFetch: number;
}

/** One assistant turn's ledger entry plus its computed cost. */
export interface TurnLedger {
  sessionId: string;
  uuid: string;
  projectSlug?: string;
  timestamp?: string;
  /** UTC day bucket (`YYYY-MM-DD`), or `(undated)` when timestamp is absent/unparseable. */
  day: string;
  /** `true` when this turn ran inside a subagent transcript (sidechain). */
  isSidechain: boolean;
  /** Raw `message.model`, verbatim. */
  model?: string;
  /** Canonical pricing key, when the model resolved to a priced entry. */
  modelKey?: string;
  usage: LedgerUsage;
  /** Cost in USD, or `null` when the model is unpriced (AC #3 — never 0). */
  costUSD: number | null;
}

/** A rollup bucket: token totals + cost, with an unknown-price flag. */
export interface CostBucket {
  usage: LedgerUsage;
  /**
   * Total cost in USD, or `null` when the bucket contains ANY unpriced turn — a
   * partially/unknown-priced bucket is never reported as a concrete number that
   * could be misread as "free" (AC #3). `knownCostUSD` retains the priced portion.
   */
  costUSD: number | null;
  /** Summed cost of the priced turns in this bucket (USD) — the priced portion even when `costUSD` is null. */
  knownCostUSD: number;
  /** `false` when at least one contributing turn was on an unpriced model. */
  costKnown: boolean;
  /** Spend-bearing assistant turns counted into this bucket. */
  turns: number;
  /** Tokens (input+cacheCreation+cacheRead+output) from unpriced turns — uncosted but counted. */
  unpricedTokens: number;
}

/** A by-model bucket; `priced` is false for the unknown-model bucket. */
export interface ModelCost extends CostBucket {
  /** Canonical key when priced; the raw model id (or `(unknown-model)`) when not. */
  model: string;
  priced: boolean;
}

/** A keyed rollup bucket (session id, day, or project slug). */
export interface KeyedCost extends CostBucket {
  key: string;
}

/** The full token & cost view over one (already-scoped) ingestion result. */
export interface TokenCostResult {
  /** Versioned price-table date, surfaced so a stale table is visible. */
  pricesAsOf: string;
  /** Grand totals over all in-window, de-duplicated assistant turns. */
  totals: CostBucket;
  byModel: ModelCost[];
  bySession: KeyedCost[];
  byDay: KeyedCost[];
  byProject: KeyedCost[];
  /** Every assistant turn's ledger (PRD 02 §1 per-turn ledger). */
  perTurn: TurnLedger[];
  /** Distinct raw model ids with no price entry (recorded, never dropped). */
  unknownModels: string[];
  /** Non-fatal notes (e.g. unknown models priced as cost-unknown). */
  warnings: string[];
}

const UNKNOWN_PROJECT = '(unknown)';
const UNKNOWN_MODEL = '(unknown-model)';
const UNKNOWN_SESSION = '(unknown-session)';
const UNKNOWN_UUID = '(unknown-uuid)';
const UNDATED = '(undated)';

/**
 * Account token usage and cost for one ingestion result.
 *
 * Pure over its input — does not mutate `result`. Defensive at the boundary:
 * a malformed/empty result yields empty, zeroed output rather than throwing.
 */
export function accountTokenCost(result: ClaudeIngestionResult): TokenCostResult {
  const warnings: string[] = [];
  const perTurn: TurnLedger[] = [];
  const totals = emptyBucket();
  const byModel = new Map<string, ModelCost>();
  const bySession = new BucketBook();
  const byDay = new BucketBook();
  const byProject = new BucketBook();
  const unknownModels = new Set<string>();

  const turns = Array.isArray(result?.turns) ? result.turns : [];
  for (const turn of turns) {
    // Only assistant turns carry billable usage; user/attachment turns do not.
    if (turn.role !== 'assistant' || !turn.usage) continue;

    const pricing = getPricing(turn.model);
    const usage = toLedgerUsage(turn.usage);
    // Cost is computed from the coerced ledger (finite numbers), so a malformed
    // JS-supplied usage object cannot poison cost with NaN.
    const cost = pricing ? costOf(usage, pricing) : null;
    const day = utcDay(turn.timestamp);

    // Normalize identifiers used as map keys / stored fields. A malformed JS turn
    // with a non-string sessionId/projectSlug would otherwise throw in
    // BucketBook.toArray() (`key.localeCompare`); coerce to safe sentinels.
    const sessionId = asString(turn.sessionId, UNKNOWN_SESSION);
    const projectSlug = asOptString(turn.projectSlug);

    perTurn.push({
      sessionId,
      uuid: asString(turn.uuid, UNKNOWN_UUID),
      projectSlug,
      timestamp: asOptString(turn.timestamp),
      day,
      isSidechain: turn.isSidechain === true,
      model: asOptString(turn.model),
      modelKey: pricing?.key,
      usage,
      costUSD: cost,
    });

    addToBucket(totals, usage, cost);
    addModelBucket(byModel, turn, pricing, usage, cost, unknownModels);
    bySession.add(sessionId, usage, cost);
    byDay.add(day, usage, cost);
    byProject.add(projectSlug ?? UNKNOWN_PROJECT, usage, cost);
  }

  if (unknownModels.size > 0) {
    warnings.push(
      `No offline price for model(s): ${[...unknownModels].sort().join(', ')}. ` +
        `Their tokens are counted; cost is reported as unknown (not 0).`
    );
  }

  return {
    pricesAsOf: PRICES_AS_OF,
    totals: finalizeBucket(totals),
    byModel: [...byModel.values()].map(finalizeBucket).sort(byCostThenName),
    bySession: bySession.toArray(),
    byDay: byDay.toArray(),
    byProject: byProject.toArray(),
    perTurn,
    unknownModels: [...unknownModels].sort(),
    warnings,
  };
}

/**
 * Cost of a coerced ledger under one model's pricing. Each token class is billed
 * at its own rate (PRD 02 §2): input, cache-creation (write), cache-read, output.
 * Charging a flat input rate on "billable input" would misprice every cached turn.
 * Operates on `LedgerUsage` (already coerced to finite numbers) so a malformed
 * usage object cannot propagate `NaN` into the cost.
 */
function costOf(u: LedgerUsage, p: ModelPricing): number {
  return (
    (u.inputTokens * p.inputPerMTok +
      u.cacheCreationTokens * p.cacheWritePerMTok +
      u.cacheReadTokens * p.cacheReadPerMTok +
      u.outputTokens * p.outputPerMTok) /
    1_000_000
  );
}

/**
 * Token-only projection of a `ClaudeUsage` (adds billable input + server-tool
 * counts). Defensive at the boundary: every field is coerced to a finite number
 * (default 0) and `serverToolUse` is treated as optional, so a malformed or
 * minimally-shaped JS-supplied object yields a zeroed ledger instead of throwing.
 */
function toLedgerUsage(u: ClaudeUsage): LedgerUsage {
  const input = num(u?.inputTokens);
  const cacheCreation = num(u?.cacheCreationTokens);
  const server = u?.serverToolUse;
  return {
    inputTokens: input,
    cacheCreationTokens: cacheCreation,
    cacheReadTokens: num(u?.cacheReadTokens),
    outputTokens: num(u?.outputTokens),
    billableInputTokens: input + cacheCreation,
    serverWebSearch: num(server?.webSearch),
    serverWebFetch: num(server?.webFetch),
  };
}

/** Coerce a value to a finite number; non-finite/non-number defaults to 0. */
function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

/** A non-empty string, or `fallback` for any other value (defensive boundary). */
function asString(v: unknown, fallback: string): string {
  return typeof v === 'string' && v.length > 0 ? v : fallback;
}

/** A non-empty string, or `undefined` for any other value. */
function asOptString(v: unknown): string | undefined {
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

function emptyLedger(): LedgerUsage {
  return {
    inputTokens: 0,
    cacheCreationTokens: 0,
    cacheReadTokens: 0,
    outputTokens: 0,
    billableInputTokens: 0,
    serverWebSearch: 0,
    serverWebFetch: 0,
  };
}

function emptyBucket(): CostBucket {
  return { usage: emptyLedger(), costUSD: 0, knownCostUSD: 0, costKnown: true, turns: 0, unpricedTokens: 0 };
}

/** Resolve a bucket's reported `costUSD`: the priced sum, or `null` if anything was unpriced. */
function finalizeBucket<T extends CostBucket>(bucket: T): T {
  bucket.costUSD = bucket.costKnown ? bucket.knownCostUSD : null;
  return bucket;
}

function addLedger(a: LedgerUsage, b: LedgerUsage): void {
  a.inputTokens += b.inputTokens;
  a.cacheCreationTokens += b.cacheCreationTokens;
  a.cacheReadTokens += b.cacheReadTokens;
  a.outputTokens += b.outputTokens;
  a.billableInputTokens += b.billableInputTokens;
  a.serverWebSearch += b.serverWebSearch;
  a.serverWebFetch += b.serverWebFetch;
}

/** Fold one turn's usage + cost into a bucket; `null` cost marks the bucket unknown. */
function addToBucket(bucket: CostBucket, usage: LedgerUsage, cost: number | null): void {
  addLedger(bucket.usage, usage);
  bucket.turns += 1;
  if (cost === null) {
    bucket.costKnown = false;
    bucket.unpricedTokens +=
      usage.inputTokens + usage.cacheCreationTokens + usage.cacheReadTokens + usage.outputTokens;
  } else {
    bucket.knownCostUSD += cost;
  }
}

function addModelBucket(
  byModel: Map<string, ModelCost>,
  turn: ClaudeTurn,
  pricing: ModelPricing | undefined,
  usage: LedgerUsage,
  cost: number | null,
  unknownModels: Set<string>
): void {
  // Priced turns bucket by canonical key; unpriced turns bucket by their raw id
  // (so distinct unknown models stay distinct) and are recorded for reporting.
  // A blank/whitespace/missing/non-string model is unpriced too — it gets a
  // sentinel id so it is recorded, never silently dropped. Trim so a
  // whitespace-only model collapses to the sentinel (not a distinct id), and
  // guard the type so a non-string model never throws on `.trim()`.
  const raw = typeof turn.model === 'string' ? turn.model.trim() || undefined : undefined;
  const key = pricing?.key ?? raw ?? UNKNOWN_MODEL;
  if (!pricing) unknownModels.add(raw ?? UNKNOWN_MODEL);

  let bucket = byModel.get(key);
  if (!bucket) {
    bucket = { ...emptyBucket(), model: key, priced: Boolean(pricing) };
    byModel.set(key, bucket);
  }
  addToBucket(bucket, usage, cost);
}

/** Keyed accumulator (session id / day / project slug). */
class BucketBook {
  private readonly map = new Map<string, CostBucket>();

  add(key: string, usage: LedgerUsage, cost: number | null): void {
    let bucket = this.map.get(key);
    if (!bucket) {
      bucket = emptyBucket();
      this.map.set(key, bucket);
    }
    addToBucket(bucket, usage, cost);
  }

  toArray(): KeyedCost[] {
    return [...this.map.entries()]
      .map(([key, b]) => finalizeBucket({ key, ...b }))
      .sort((a, b) => a.key.localeCompare(b.key));
  }
}

/** UTC `YYYY-MM-DD` for an ISO timestamp; `(undated)` when missing/unparseable. */
function utcDay(timestamp: string | undefined): string {
  if (!timestamp) return UNDATED;
  const ms = Date.parse(timestamp);
  return Number.isNaN(ms) ? UNDATED : new Date(ms).toISOString().slice(0, 10);
}

/** Highest cost first; unknown-cost buckets (null) sort last, ties broken by model name. */
function byCostThenName(a: ModelCost, b: ModelCost): number {
  return (b.costUSD ?? -Infinity) - (a.costUSD ?? -Infinity) || a.model.localeCompare(b.model);
}

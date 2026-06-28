/**
 * Offline pricing table + model registry (Tier 2 — Epic #44, Issue #37).
 *
 * The local Claude session stream carries a `costUSD` field that is observed
 * unpopulated (0). Cost must therefore be recomputed from the token ledger
 * against a *versioned, offline* price table — never trusted from the cache
 * (PRD 02 §2). A model with no entry resolves to "unknown": its tokens are
 * still counted, but its cost is reported as `null`, never priced at 0.
 *
 * Prices are listed per **million tokens** (MTok), the unit Anthropic publishes.
 *
 * Cache pricing is derived from the base input price by fixed multipliers
 * (Anthropic prompt-caching pricing): cache-read ≈ 0.1× input; cache-creation
 * (write) ≈ 1.25× input for the 5-minute TTL (the `cache_control` default) and
 * 2× input for the 1-hour TTL. The merged #36 contract (`ClaudeUsage`) does NOT
 * surface the `cache_creation.ephemeral_5m/1h` split, so the 5-minute multiplier
 * is applied as the single, documented default; a session that is predominantly
 * 1-hour cache-creation is under-priced on that portion only (the token ledger
 * is unaffected). See `.logs/decisions/2026-06-27-token-cost-accounting.jsonl`.
 */

/**
 * The date the prices below were captured. Surfaced in reports so a stale table
 * is visible ("prices as of"), per PRD 02 risk note. Source: Anthropic public
 * model pricing.
 */
export const PRICES_AS_OF = '2026-06-04';

/** Cache-creation (write) price as a multiple of the base input price (5-minute TTL). */
export const CACHE_WRITE_MULTIPLIER = 1.25;
/** Cache-read price as a multiple of the base input price. */
export const CACHE_READ_MULTIPLIER = 0.1;

/** Resolved per-model pricing, all values in USD per million tokens. */
export interface ModelPricing {
  /** Canonical pricing key this entry is filed under. */
  key: string;
  inputPerMTok: number;
  outputPerMTok: number;
  /** Cache-creation (write) price; default = input × CACHE_WRITE_MULTIPLIER. */
  cacheWritePerMTok: number;
  /** Cache-read price; default = input × CACHE_READ_MULTIPLIER. */
  cacheReadPerMTok: number;
}

/** Base `[input, output]` $/MTok per canonical model key. Cache prices are derived. */
const BASE_PRICES: Record<string, readonly [number, number]> = {
  'claude-fable-5': [10, 50],
  'claude-mythos-5': [10, 50],
  'claude-opus-4-8': [5, 25],
  'claude-opus-4-7': [5, 25],
  'claude-opus-4-6': [5, 25],
  'claude-sonnet-4-6': [3, 15],
  'claude-haiku-4-5': [1, 5],
};

/**
 * Alias map for model ids that are not themselves table keys but bill at a known
 * model's rate. Resolution normalizes provider prefixes, date snapshots, and the
 * `-fast` speed suffix first (see `resolveModelKey`), so only genuine name
 * aliases belong here. Kept deliberately small — guesses become mispricing.
 */
const ALIASES: Record<string, string> = {
  'claude-mythos-preview': 'claude-mythos-5',
};

/** The full priced table, cache prices expanded from the base input price. */
export const PRICING_TABLE: Record<string, ModelPricing> = Object.fromEntries(
  Object.entries(BASE_PRICES).map(([key, [input, output]]) => [
    key,
    {
      key,
      inputPerMTok: input,
      outputPerMTok: output,
      cacheWritePerMTok: round(input * CACHE_WRITE_MULTIPLIER),
      cacheReadPerMTok: round(input * CACHE_READ_MULTIPLIER),
    },
  ])
);

/**
 * Resolve a raw `message.model` string to a canonical pricing key.
 *
 * Defends against the fuzzy-mismatch ways the same model is spelled in the wild
 * (PRD 02 §2 — "guard against fuzzy model-name mismatches"):
 *  - region/provider prefixes: `us.anthropic.claude-…`, `anthropic.claude-…`;
 *  - dated snapshots: `claude-opus-4-8-20260114`, `claude-opus-4-5@20251101`;
 *  - the `-fast` speed suffix: `claude-opus-4-8-fast`;
 *  - explicit aliases (`ALIASES`).
 *
 * Returns a best-effort key; whether that key is *priced* is a separate lookup
 * (`getPricing`). Pure string normalization — never throws.
 */
export function resolveModelKey(rawModel: string): string {
  let s = rawModel.trim().toLowerCase();
  s = s.replace(/^(?:us|eu|apac|global)\./, '');
  s = s.replace(/^anthropic\./, '');
  // Strip the speed suffix and the date snapshot, repeatedly, so they normalize
  // in either order (e.g. `claude-opus-4-8-20260114-fast` and
  // `claude-opus-4-8-fast` both reduce to `claude-opus-4-8`).
  let prev: string;
  do {
    prev = s;
    s = s.replace(/-fast$/, '');
    // Date snapshot suffix: `-YYYYMMDD` or `@YYYYMMDD` (e.g. `@20251101`).
    s = s.replace(/[-@]\d{8}$/, '');
  } while (s !== prev);
  return ALIASES[s] ?? s;
}

/**
 * Look up pricing for a raw model id. Returns `undefined` when the resolved key
 * has no table entry — the caller MUST treat that as "cost unknown," not 0.
 * A blank/whitespace model string is unknown, never a silent default.
 */
export function getPricing(rawModel: string | undefined): ModelPricing | undefined {
  if (!rawModel || !rawModel.trim()) return undefined;
  return PRICING_TABLE[resolveModelKey(rawModel)];
}

/** Round to 6 significant decimals to avoid float noise in derived cache prices. */
function round(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}

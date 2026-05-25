# PRD 02 — Token & Cost Accounting

**Tier:** 2. **Status:** Draft. **Depends on:** 01. **Blocks:** report's cost section.

## Problem
Token usage is the primary signal for "how heavily and how efficiently are we using Claude," but the
raw stream splits tokens across input / cache-creation / cache-read / output and per-iteration
breakdowns, and the local `costUSD` field is unpopulated. Without a correct accounting layer, cost
and efficiency claims are unreliable.

## Capability
Turn the normalized turns from PRD 01 into a correct token ledger and computed cost, aggregated over
the sprint window.

## Behaviour
1. **Per-turn ledger.** For each assistant turn record:
   - billable input = `input_tokens + cache_creation_input_tokens`
   - cache read = `cache_read_input_tokens` (billed ~0.1×; treated as whole-session overhead, not
     attributable to a single tool)
   - output = `output_tokens`
   - cache TTL split = `cache_creation.ephemeral_5m_input_tokens` vs `ephemeral_1h_input_tokens`
   - server tool use = `server_tool_use.{web_search_requests, web_fetch_requests}`
2. **Cost.** Compute from tokens × an offline pricing table keyed by model. **Do not** trust
   `costUSD` from local caches (observed as 0). Guard against fuzzy model-name mismatches and treat a
   missing price as "unknown," not 0.
3. **Model registry.** Resolve model identifiers (and aliases) to pricing keys; record unknown models
   rather than silently dropping them.
4. **Aggregation.** Roll up by the **sprint window** (git refs), and secondarily by session, by day,
   by model, by project. Sprint windowing — not fixed rolling clock windows — is the unit of a
   retrospective.

## Data inputs
`docs/research/claude-data-inventory.md` §2.1 (`message.usage`), §4 (`stats-cache.json` as an optional
fast baseline only — recompute from turns when accuracy matters).

## Acceptance criteria
- Reported billable tokens for a fixture match a hand-computed expected value.
- Cache-read tokens are reported separately and excluded from per-tool attribution.
- A turn on an unpriced/unknown model is counted in tokens and flagged as "cost unknown," never
  priced at 0.
- Sprint-window totals equal the sum of in-window deduped turns.

## Scoring dimensions
- **Delivery Predictability:** token/cost trend across the sprint; per-task cost outliers.
- **Collaboration Efficiency:** cache-read ratio and output/input ratios as efficiency proxies.

## Risks
- `speed`/`service_tier` pricing tiers (e.g. fast mode) unverified on sample — confirm before pricing.
- Offline pricing table goes stale; version it and note the "prices as of" date in the report.

## Out of scope
Attribution to tool/skill/MCP (PRD 03); detectors (PRD 04).

# PRD 07 — Durable Telemetry Ledger

**Tier:** 4. **Status:** Draft. **Depends on:** 01, 02.

## Problem
Claude prunes session JSONL on a rolling retention window. A retrospective that only reads the live
logs cannot compute trends across sprints, because older data silently disappears. Trend tracking
(Issue #18) requires durable, deduplicated history under our own control.

## Capability
Snapshot normalized, deduplicated telemetry into a local store that is the source of truth for
historical aggregates and trends, surviving Claude's log rotation.

## Behaviour
1. **Store.** Persist normalized turns / tool-calls / subagents / findings into a local store
   (SQLite recommended) with uniqueness constraints (e.g. `(sessionId, message_id)`) so re-ingesting
   the same data is idempotent.
2. **Idempotent merge.** Use insert-or-ignore semantics; recompute aggregates from stored rows, never
   additively, so re-runs and overlapping windows do not double-count.
3. **Incremental scan.** Track per-file mtime / line counts to skip unchanged files on re-ingest.
4. **History preservation.** Once stored, retain rows beyond Claude's rolling window so cross-sprint
   trends remain computable.
5. **Optional hook-driven ingestion.** Provide a Stop-hook entry (wired through this plugin's
   `hooks/hooks.json`) that ingests after each response, keeping the store current without a manual
   run. Opt-in.

## Data inputs
Normalized output of PRD 01/02; persisted under `.logs/` (gitignored).

## Acceptance criteria
- Re-ingesting the same sessions twice yields identical aggregates (idempotency test).
- A trend query spans sprints whose source JSONL is no longer present, using stored rows.
- Incremental re-scan skips unchanged files (verified by a no-op second run).
- The optional Stop-hook is opt-in and a no-op when disabled.

## Scoring dimensions
Enables **trend** views across sprints for all dimensions; no new scoring of its own.

## Risks
- **Privacy:** the store may contain prompt/response text; it must live under `.logs/` (gitignored)
  and never be committed. Document a retention/redaction option.
- Store schema versioning as the normalized model evolves.

## Out of scope
The normalized model itself (PRD 01); report rendering.

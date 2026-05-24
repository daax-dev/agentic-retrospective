# PRD 05 — Delivery Correlation

**Tier:** 3. **Status:** Draft. **Depends on:** 01; joins the existing git analyzer.

## Problem
Telemetry alone says how much was spent, not whether the spend *shipped*. The highest-value
retrospective signal ties Claude activity to delivery outcomes: was the work kept, reverted, or
abandoned, and how many edit→verify cycles did it take?

## Capability
Correlate normalized Claude telemetry with git history to classify productive vs reverted vs
abandoned work, and count verification loops.

## Behaviour
1. **Yield classification.** For commits in the sprint window, classify as:
   - *productive* — kept through to the tip,
   - *reverted* — later undone (detect via revert commits, e.g. `This reverts commit <sha>`),
   - *abandoned* — on a branch never merged.
   Attribute the telemetry spend in the window against each class to produce a "yield" ratio
   (spend that shipped vs spend that was undone).
2. **Edit → verify → edit retry counter.** Within a session, count sequences where an edit is
   followed by a verification step (test/build/lint run) and then another edit to the same target —
   a proxy for how many cycles correctness took.
3. **Rework signal.** Use repeated rewrites of the same file (from session activity and/or the
   per-session file-history snapshots) as a corroborating rework indicator.

## Data inputs
Normalized turns/tool-calls from PRD 01; the existing git analyzer (`src/analyzers/git.ts`); optional
`~/.claude/file-history/<sessionId>/` (inventory §1).

## Acceptance criteria
- A fixture repo with a revert is classified as *reverted* and its window spend counted against
  reverted yield.
- An edit→test→edit sequence on one file increments the retry counter; an edit→test (passing, no
  re-edit) does not.
- Findings cite the commit SHA and the session/turn evidence.

## Scoring dimensions
- **Delivery Predictability:** shipped-vs-reverted yield.
- **Test Loop Completeness:** edit→verify→edit retry counts; presence of verification steps.
- **Quality & Maintainability:** rework via repeated rewrites.

## Risks
- Revert detection misses non-standard revert workflows (squash, force-push); document the heuristic.
- Mapping a commit to the telemetry that produced it is approximate (time/branch correlation), not
  exact; present as correlation, not causation.

## Out of scope
Decision rationale (Decision Hygiene) — sourced from `.logs/decisions/`, not git.

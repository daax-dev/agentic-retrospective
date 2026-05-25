# PRD 08 — Transcript Evidence & Export

**Tier:** 4. **Status:** Draft. **Depends on:** 01.

## Problem
Aggregates tell you *where* cost concentrated; they do not show *why* a prompt or workflow caused it.
The "no AI slop" rule requires that any finding can be traced back to the actual transcript, and a
qualitative review pass benefits from a compact, readable rendering of prior sessions.

## Capability
Reconstruct human-readable transcripts from the normalized stream and export a compact form suitable
for qualitative review and for feeding prior sessions back into a model for meta-analysis.

## Behaviour
1. **Reconstruction.** Build the conversation order from the `parentUuid` / `uuid` linked list (a
   DAG), repairing broken parent chains where possible, and render turns (prompt, thinking, tool
   calls, results, response) in sequence.
2. **Summary prioritization.** Title a session by the model-generated `ai-title` record when present,
   falling back to the first user prompt.
3. **Evidence linkage.** Given a finding's `sessionId + uuid`, render the exact surrounding turns so a
   reviewer can read the cause in context.
4. **Compact export.** Emit a compact Markdown rendering (configurable detail level) that strips noise
   and merges adjacent low-signal turns — small enough to feed back into a model for meta-analysis of
   prompt patterns and failure loops.
5. **Filters.** Support date / session / project filters aligned with the sprint window.

## Data inputs
Normalized turns from PRD 01; `ai-title` record (inventory §2); `history.jsonl` as a lightweight
prompt index (inventory §5).

## Acceptance criteria
- A fixture session reconstructs in correct causal order, including across a broken parent link.
- Session title uses `ai-title` when present, else the first prompt.
- Given a finding reference, the tool renders the cited turn ± context.
- The compact export of a large session is materially smaller than the full transcript and remains
  coherent.

## Scoring dimensions
- **All dimensions (qualitative support):** supplies the evidence excerpts that back findings; surfaces
  reusable prompt patterns and "misunderstood X" failure loops for the retrospective narrative.

## Risks
- **Privacy:** transcripts contain full text; exports must stay under `.logs/` (gitignored) and never
  be committed.

## Out of scope
Quantitative scoring (PRDs 02–06).

# PRD 03 — Source Attribution

**Tier:** 2. **Status:** Draft. **Depends on:** 01, 02.

## Problem
Knowing total tokens is not actionable. The retrospective needs to answer *what* consumed the
context: a direct response, a built-in tool, a subagent, a skill, or an MCP server/method. Without
attribution, there is no lever to pull when spend is high.

## Capability
Attribute each unit of context spend to its source, and link every user prompt to the tools it
triggered and the results that re-entered context.

## Behaviour
1. **Attribution priority** (highest wins) for each spend-bearing event:
   `MCP method (mcp__*) > subagent (Task) > skill > built-in tool > direct response`.
   - MCP methods identified by the `mcp__<server>__<method>` tool-name convention.
   - Subagents launched via the `Agent` or `Task` tool (match both; the 2.1.150 sample uses `Agent`).
     Subagent spend resolved via the `subagents/*.meta.json` `toolUseId` link when present
     (deterministic; no fragile text heuristics); when the sidecar lacks `toolUseId`, attribute at
     session level and flag lineage unknown.
   - Skill invocation identified from the skill-execution marker; capture the skill identity
     explicitly (a known gap in naive implementations is counting skill firings without recording
     *which* skill).
   - Guard against false positives when scanning text markers (e.g. em-dash / literal `--` lines).
2. **Prompt → tool → result → token linkage.** Walk the `parentUuid` chain so each user prompt maps
   to the assistant turns, tool calls, and tool-result sizes that followed, and the tokens they cost.
   This is the "what burned the context for this prompt" map.
3. **Rollups.** Aggregate spend by source category and by specific identity (which tool, which
   subagent type, which skill, which MCP method) over the sprint window.

## Data inputs
`docs/research/claude-data-inventory.md` §2.2 (tool attribution), §3.1 (subagent lineage),
`ClaudeToolCall` / `ClaudeSubagent` from PRD 01.

## Acceptance criteria
- A fixture with an MCP call, a subagent, a skill, and a Bash call attributes each to the correct
  category with the documented priority.
- Subagent tokens attribute to the spawning prompt, not to "direct response."
- Skill attribution records the specific skill identity, not just a count.
- For a given prompt, the tool/result/token linkage reconstructs the full causal chain.

## Scoring dimensions
- **Collaboration Efficiency:** spend-by-source breakdown; identifies over-reliance on broad
  subagents, expensive MCP methods, or over-firing skills.

## Risks
- Attribution markers are schema-dependent; re-verify against the live install per inventory §7.

## Out of scope
Waste classification (PRD 04) — this PRD attributes; it does not judge.

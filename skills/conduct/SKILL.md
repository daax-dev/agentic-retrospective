---
name: conduct
description: Conduct evidence-based sprint retrospective with scoring across 6 dimensions.
invocation: /retrospective conduct
---

# Conduct Retrospective

Execute immediately. Do not ask for confirmation.

Run: `agentic-retrospective conduct`

## Options

- `--since "1 week ago"` - Analysis period
- `--verbose` - Detailed output

## After Completion

1. Report the results to the user
2. Show where the report was saved
3. Ask: "Would you like to update CLAUDE.md with improvements from this retrospective?"
   - If yes: Validate CLAUDE.md size and quality first
   - Check file isn't too large (warn if > 500 lines)
   - Check for stale or contradictory instructions
   - Summarize key learnings and add to CLAUDE.md
4. Ask: "How did this retrospective go? Run `/retrospective feedback` to share what worked and what didn't."

## What It Analyzes

- Git history (commits, contributors, churn)
- Telemetry logs (prompts, tool calls)
- Decision records
- Session feedback

## Output

Generates report in `docs/retrospectives/YYYY-MM-DD/`:
- `retro.md` - Human-readable report
- `retro.json` - Machine-readable data
- `evidence_map.json` - Supporting evidence

## Scoring Dimensions (0-5)

| Dimension | What It Measures |
|-----------|------------------|
| Delivery Predictability | Scope vs delivered |
| Test Loop Completeness | Test coverage, pass rates |
| Quality & Maintainability | Code churn patterns |
| Security Posture | Vulnerability trends |
| Collaboration Efficiency | Human-agent handoffs |
| Decision Hygiene | One-way-door escalation rate |

---
name: conduct
description: Conduct evidence-based sprint retrospective with scoring across 6 dimensions.
invocation: /retrospective
---

# Conduct Retrospective

Run a full sprint retrospective analysis.

## Usage

```
/retrospective
/retrospective --since "1 week ago"
/retrospective --verbose
```

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

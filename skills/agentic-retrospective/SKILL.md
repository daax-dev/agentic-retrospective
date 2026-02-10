---
name: agentic-retrospective
description: Generates evidence-based sprint retrospectives analyzing human-agent collaboration, decision patterns, and improvement opportunities. Requires agent-watch for telemetry. Use when user asks for a retrospective, sprint review, or development activity analysis.
---

STARTER_CHARACTER = 🔄

Evidence-based retrospectives for human-agent collaboration.

## Run Retrospective

Default (analyzes recent activity):

```bash
bash skills/agentic-retrospective/scripts/run.sh
```

Specify time range:

```bash
bash skills/agentic-retrospective/scripts/run.sh --since "2 weeks ago"
bash skills/agentic-retrospective/scripts/run.sh --since "2024-01-01" --until "2024-01-15"
```

JSON output:

```bash
bash skills/agentic-retrospective/scripts/run.sh --json
```

Verbose mode:

```bash
bash skills/agentic-retrospective/scripts/run.sh --verbose
```

## Data Sources

Reads from `.logs/` (set up via `agent-watch` skill):
- `.logs/prompts/` — user prompts with complexity signals
- `.logs/tools/` — tool invocations
- `.logs/decisions/` — decision records
- `.logs/feedback/` — post-session micro-retro feedback

Also analyzes git history for commit patterns.

## Output

Reports include:

### TL;DR Quick Summary
At-a-glance sprint health with color-coded status indicators.

### Human Partner Insights 🧑
- **Prompt Patterns That Worked Well**: File references, explicit constraints
- **Prompt Patterns That Caused Issues**: High ambiguity, missing acceptance criteria
- **CLAUDE.md Suggestions**: Auto-generated recommendations based on patterns
- **Areas for Improvement**: Aggregated from session feedback

### Fix-to-Feature Ratio 📊
Health indicator comparing fix commits to feature commits. A healthy ratio is below 10:1 (feature-to-fix).

### Standard Outputs
- Executive summary with health scores
- Dimension scores (0-5) with evidence
- Findings: good, concerning, opportunities
- Prioritized action items
- Telemetry gap identification

## Scoring

- **0**: Critical issues
- **1-2**: Below expectations
- **3**: Meets baseline
- **4**: Good
- **5**: Excellent

## Collecting Feedback

To enable Human Partner Insights, capture session feedback:

```bash
# After each session
bash .logs/scripts/micro-retro.sh
```

This 30-second survey captures alignment, rework needed, and improvement suggestions.

## Prerequisites

**Requires `agent-watch`** — Install it first to collect telemetry data:

```bash
bash skills/agent-watch/scripts/install.sh
```

Without agent-watch, agentic-retrospective can only analyze git history.

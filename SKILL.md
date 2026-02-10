---
name: agentic-retrospective
description: Evidence-based sprint retrospectives for human-agent collaboration. Captures telemetry (prompts, tools, decisions) and generates actionable insights with scoring across 6 dimensions. Use when setting up development telemetry, running retrospectives, or analyzing human-agent collaboration patterns.
license: Apache-2.0
metadata:
  author: jpoley
  version: "1.0"
---

# Agentic Retrospective

Evidence-based sprint retrospectives for human-agent collaboration. Captures development telemetry and generates actionable insights.

## Overview

This skill provides two capabilities:

1. **Telemetry Capture** - Hooks that log prompts, tool calls, and decisions
2. **Retrospective Analysis** - Analyzes captured data and generates reports

```
Session → log-prompt.sh → .logs/prompts/
        → log-tool.sh   → .logs/tools/
        → micro-retro   → .logs/feedback/
                              ↓
                    run-retrospective.sh
                              ↓
                    docs/retrospectives/
```

## Quick Start

### 1. Set Up Telemetry

Run the setup script in your project:

```bash
bash scripts/setup-project.sh
```

This creates `.logs/` directories and optionally updates `.gitignore`.

### 2. Work Normally

Continue using your AI coding assistant. The setup automatically configures Claude Code hooks that capture:
- User prompts with complexity signals (via `UserPromptSubmit` hook)
- Tool invocations (via `PostToolUse` hook)
- Architectural decisions (when manually logged)

### 3. Capture Session Feedback (Optional)

After sessions, run a quick 30-second feedback survey:

```bash
bash scripts/micro-retro.sh
```

### 4. Run Retrospective

Generate an evidence-based report:

```bash
bash scripts/run-retrospective.sh
```

## What Gets Captured

| Data Type | Location | Description |
|-----------|----------|-------------|
| Prompts | `.logs/prompts/YYYY-MM-DD.jsonl` | User prompts with complexity signals |
| Tools | `.logs/tools/YYYY-MM-DD.jsonl` | All tool invocations |
| Decisions | `.logs/decisions/YYYY-MM-DD.jsonl` | Architectural decisions |
| Feedback | `.logs/feedback/YYYY-MM-DD.jsonl` | Post-session micro-retro |

## Scoring Dimensions

Reports score across 6 dimensions (0-5 scale):

| Dimension | What It Measures |
|-----------|------------------|
| **Delivery Predictability** | Scope vs delivered |
| **Test Loop Completeness** | Test coverage, pass rates |
| **Quality/Maintainability** | Code churn patterns |
| **Security Posture** | Vulnerability trends |
| **Collaboration Efficiency** | Human-agent handoffs |
| **Decision Hygiene** | One-way-door escalation rate |

## Report Contents

- **TL;DR Summary** - At-a-glance sprint health
- **Human Partner Insights** - Prompt patterns, improvement suggestions
- **Fix-to-Feature Ratio** - Rework health indicator
- **Action Items** - Prioritized improvements with evidence

## Scripts Reference

| Script | Purpose |
|--------|---------|
| `setup-project.sh` | Initialize .logs/ directories |
| `log-prompt.sh` | Hook: capture user prompts |
| `log-tool.sh` | Hook: capture tool calls |
| `micro-retro.sh` | Capture post-session feedback |
| `run-retrospective.sh` | Generate retrospective report |

## Decision Logging

Log architectural decisions during development:

```bash
echo '{"timestamp":"'$(date -u +%Y-%m-%dT%H:%M:%SZ)'","decision":"Use Zod for validation","rationale":"Type inference and runtime validation","decision_type":"two_way_door","actor":"agent"}' >> .logs/decisions/$(date +%Y-%m-%d).jsonl
```

Decision types:
- `one_way_door`: Hard to reverse (schema changes, public API)
- `two_way_door`: Easy to reverse (refactoring, internal changes)

## Additional References

- [Agent Watch Specification](references/agent-watch.md)
- [Retrospective Specification](references/agentic-retrospective.md)
- [Fixing Telemetry Gaps](references/fixing-telemetry-gaps.md)
- [3-Agent Strategy](references/3agent-strategy.md) - Design document

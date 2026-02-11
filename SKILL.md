---
name: agentic-retrospective
description: Evidence-based sprint retrospectives for human-agent collaboration. Captures telemetry (prompts, tools, decisions) and generates actionable insights with scoring across 6 dimensions. Use when setting up development telemetry, running retrospectives, or analyzing human-agent collaboration patterns.
license: Apache-2.0
metadata:
  author: jpoley
  version: "1.0.0"
---

# Agentic Retrospective

Evidence-based sprint retrospectives for human-agent collaboration. Captures development telemetry and generates actionable insights.

## Installation

```bash
uv pip install git+https://github.com/daax-dev/agentic-retrospective
```

## Quick Start

### 1. Set Up Telemetry

```bash
agentic-retrospective setup
```

Creates `.logs/` directories and configures Claude Code hooks.

### 2. Work Normally

Continue using your AI coding assistant. Hooks capture:
- User prompts with complexity signals (via `UserPromptSubmit` hook)
- Tool invocations (via `PostToolUse` hook)
- Architectural decisions (when manually logged)

### 3. Capture Session Feedback (Optional)

```bash
agentic-retrospective micro-retrospective
```

Quick 30-second feedback survey after sessions.

### 4. Run Retrospective

```bash
agentic-retrospective run
```

## CLI Commands

| Command | Purpose |
|---------|---------|
| `agentic-retrospective setup` | Initialize .logs/ directories and hooks |
| `agentic-retrospective micro-retrospective` | Capture post-session feedback |
| `agentic-retrospective run` | Generate retrospective report |
| `agentic-retrospective decision` | Log an architectural decision |

## What Gets Captured

| Data Type | Location | Description |
|-----------|----------|-------------|
| Prompts | `.logs/prompts/YYYY-MM-DD.jsonl` | User prompts with complexity signals |
| Tools | `.logs/tools/YYYY-MM-DD.jsonl` | All tool invocations |
| Decisions | `.logs/decisions/YYYY-MM-DD.jsonl` | Architectural decisions |
| Feedback | `.logs/feedback/YYYY-MM-DD.jsonl` | Post-session micro-retrospective |

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

## Decision Logging

Log architectural decisions during development:

```bash
agentic-retrospective decision "Use Zod for validation" \
  --rationale "Type inference and runtime validation" \
  --type two_way_door \
  --actor agent
```

Decision types:
- `one_way_door`: Hard to reverse (schema changes, public API)
- `two_way_door`: Easy to reverse (refactoring, internal changes)

## Report Contents

- **TL;DR Summary** - At-a-glance sprint health
- **Human Partner Insights** - Prompt patterns, improvement suggestions
- **Fix-to-Feature Ratio** - Rework health indicator
- **Action Items** - Prioritized improvements with evidence

## Additional References

- [Agent Watch Specification](references/agent-watch.md)
- [Retrospective Specification](references/agentic-retrospective.md)
- [Fixing Telemetry Gaps](references/fixing-telemetry-gaps.md)
- [3-Agent Strategy](references/3agent-strategy.md) - Design document

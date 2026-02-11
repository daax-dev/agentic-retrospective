---
name: retrospective
description: Run evidence-based sprint retrospectives with scoring across 6 dimensions. Analyzes git history, telemetry logs, and decisions to generate actionable insights.
invocation: /retrospective
---

# Agentic Retrospective Skill

This skill provides evidence-based sprint retrospectives for human-agent collaboration.

## In-Claude Usage

Use the slash command directly in Claude Code:

```
/retrospective
```

Or with options:
```
/retrospective --since "1 week ago" --verbose
```

## CLI Commands

Also available via CLI after installing (`uv pip install agentic-retrospective`):

### Setup Telemetry
```bash
agentic-retrospective setup
```
Creates `.logs/` directories and configures Claude Code hooks.

### Capture Session Feedback
```bash
agentic-retrospective micro-retrospective
```
Quick 30-second feedback survey after sessions.

### Run Retrospective
```bash
agentic-retrospective run --since "1 week ago"
```
Generates analysis report from captured telemetry.

### Log Decisions
```bash
agentic-retrospective decision "Use Zod for validation" --rationale "Type inference" --type two_way_door
```

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

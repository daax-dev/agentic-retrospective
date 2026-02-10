---
name: retrospective
description: Run evidence-based sprint retrospectives. Use when analyzing development sessions, reviewing collaboration patterns, or generating retrospective reports.
---

# Agentic Retrospective Skill

This skill provides evidence-based sprint retrospectives for human-agent collaboration.

## Commands

Run these via the CLI after installing (`uv pip install agentic-retrospective`):

### Setup Telemetry
```bash
agentic-retro setup
```
Creates `.logs/` directories and configures Claude Code hooks.

### Capture Session Feedback
```bash
agentic-retro micro-retro
```
Quick 30-second feedback survey after sessions.

### Run Retrospective
```bash
agentic-retro run --since "1 week ago"
```
Generates analysis report from captured telemetry.

### Log Decisions
```bash
agentic-retro decision "Use Zod for validation" --rationale "Type inference" --type two_way_door
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

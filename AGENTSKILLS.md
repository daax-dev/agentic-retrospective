---
name: retrospective
description: Generates evidence-based sprint retrospectives by mining git history, GitHub PRs, and decision logs into objective metrics. Use when the user asks for a sprint retrospective, wants to analyze team or agent collaboration over a period, needs rework/testing discipline metrics, or runs the `agentic-retrospective` CLI.
license: Apache-2.0
metadata:
  author: jpoley
  version: "1.0.0"
---

<!--
NOTE: This file exists for AgentSkills.io cross-tool spec compatibility
(see https://agentskills.io). The source of truth for Claude Code is
`skills/retrospective/SKILL.md`. Keep `name` and `description` above in
sync with that file; anything else here is AgentSkills-specific metadata.
-->

# Agentic Retrospective

Evidence-based sprint retrospectives for human-agent collaboration.

## Commands

| Command | Description |
|---------|-------------|
| `/retrospective conduct` | Conduct full retrospective analysis |
| `/retrospective setup` | Initialize telemetry capture |
| `/retrospective status` | Check setup and data |
| `/retrospective repair` | Fix missing dirs/config |
| `/retrospective feedback` | Your chance to say what went well and what didn't |

## Quick Start

### 1. Setup

```
/retrospective setup
```

### 2. Work Normally

Hooks automatically capture prompts, tool calls, and timing.

### 3. Conduct Retrospective

```
/retrospective conduct
```

Output: `docs/retrospectives/YYYY-MM-DD/`

### 4. Give Feedback

```
/retrospective feedback
```

## Scoring Dimensions (0-5)

| Dimension | Measures |
|-----------|----------|
| Delivery Predictability | Scope vs delivered |
| Test Loop Completeness | Coverage, pass rates |
| Quality & Maintainability | Code churn patterns |
| Security Posture | Vulnerability trends |
| Collaboration Efficiency | Human-agent handoffs |
| Decision Hygiene | One-way-door escalation |

# Agentic Retrospective

[![AgentSkills](https://img.shields.io/badge/AgentSkills-compatible-blue)](https://agentskills.io)

Evidence-based sprint retrospectives for human-agent collaboration. An [AgentSkills](https://agentskills.io)-compatible skill that works with Claude Code, Gemini CLI, Cursor, and other agent products.

## Overview

Agentic Retrospective provides:

1. **Telemetry Capture** - Hooks that log prompts, tool calls, and decisions
2. **Retrospective Analysis** - Analyzes captured data and generates reports

## Quick Start

### 1. Set Up Telemetry

```bash
bash scripts/setup-project.sh
```

### 2. Work Normally

Continue using your AI coding assistant. Telemetry is captured automatically.

### 3. Capture Session Feedback

```bash
bash scripts/micro-retro.sh
```

### 4. Run Retrospective

```bash
bash scripts/run-retrospective.sh
```

## Skill Structure

```
agentic-retrospective/
├── SKILL.md              # Skill definition (AgentSkills format)
├── scripts/
│   ├── setup-project.sh  # Initialize .logs/ directories
│   ├── log-prompt.sh     # Hook: capture user prompts
│   ├── log-tool.sh       # Hook: capture tool calls
│   ├── micro-retro.sh    # Capture post-session feedback
│   └── run-retrospective.sh
├── references/
│   ├── agent-watch.md
│   ├── agentic-retrospective.md
│   ├── fixing-telemetry-gaps.md
│   └── schemas/
└── assets/
```

## Scoring Dimensions

Reports score across 6 dimensions (0-5 scale):

| Dimension | What It Measures |
|-----------|------------------|
| Delivery Predictability | Scope vs delivered |
| Test Loop Completeness | Test coverage, pass rates |
| Quality/Maintainability | Code churn patterns |
| Security Posture | Vulnerability trends |
| Collaboration Efficiency | Human-agent handoffs |
| Decision Hygiene | One-way-door escalation rate |

## Requirements

- **bash** - All scripts are bash-compatible (works on macOS, Linux, WSL)
- **python3** - Required for JSON processing and analytics (fallback to basic mode without)
- **git** - Required for commit analysis in retrospectives

## Compatibility

This skill follows the [AgentSkills specification](https://agentskills.io/specification) and works with:

- Claude Code
- Gemini CLI
- Cursor
- VS Code (with agent extensions)
- And other AgentSkills-compatible products

## License

Apache 2.0

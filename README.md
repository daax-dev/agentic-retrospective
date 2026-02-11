# Agentic Retrospective

[![AgentSkills](https://img.shields.io/badge/AgentSkills-compatible-blue)](https://agentskills.io)
[![PyPI](https://img.shields.io/pypi/v/agentic-retrospective)](https://pypi.org/project/agentic-retrospective/)

Evidence-based sprint retrospectives for human-agent collaboration.

![Retrospective Screenshot](assets/retro-screen.png)

## Commands

| Command | Description |
|---------|-------------|
| `/retrospective setup` | Initialize telemetry capture |
| `/retrospective` | Conduct full retrospective analysis |
| `/retrospective status` | Check telemetry setup and data |
| `/retrospective repair` | Fix missing directories/config |
| `/retrospective feedback` | Your chance to say what went well and what didn't |

## Installation

### Claude Code Plugin

```bash
claude /plugin add daax-dev/agentic-retrospective
```

### Python CLI

```bash
pip install agentic-retrospective
```

## Quick Start

### 1. Setup (once per project)

```
/retrospective setup
```

Creates:
- `.logs/` directories for telemetry
- `docs/retrospectives/` for reports
- Claude Code hooks for automatic capture

### 2. Work Normally

Hooks automatically capture:
- Every prompt you send
- Every tool call
- Session timing

### 3. Conduct Retrospective

```
/retrospective
/retrospective --since "1 week ago"
```

Output: `docs/retrospectives/YYYY-MM-DD/`

### 4. Session Feedback (Optional)

```
/retrospective feedback
```

30-second survey after sessions.

## What Gets Captured

| Data | Location |
|------|----------|
| Prompts | `.logs/prompts/YYYY-MM-DD.jsonl` |
| Tools | `.logs/tools/YYYY-MM-DD.jsonl` |
| Decisions | `.logs/decisions/YYYY-MM-DD.jsonl` |
| Feedback | `.logs/feedback/YYYY-MM-DD.jsonl` |

## Scoring Dimensions

Reports score across 6 dimensions (0-5 scale):

| Dimension | Measures |
|-----------|----------|
| Delivery Predictability | Scope vs delivered |
| Test Loop Completeness | Coverage, pass rates |
| Quality & Maintainability | Code churn patterns |
| Security Posture | Vulnerability trends |
| Collaboration Efficiency | Human-agent handoffs |
| Decision Hygiene | One-way-door escalation |

## CLI Reference

```bash
agentic-retrospective setup                    # Initialize project
agentic-retrospective status                   # Check setup and data
agentic-retrospective repair                   # Fix missing dirs/config
agentic-retrospective conduct --since "1 week" # Conduct retrospective
agentic-retrospective feedback                 # Session feedback
agentic-retrospective decision "what" -r "why" # Log decision
```

## License

Apache 2.0

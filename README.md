# Agentic Retrospective

Evidence-based sprint retrospectives for human-agent collaboration. Analyze your development sessions with AI coding assistants (Claude Code, Gemini CLI) and generate actionable insights.

## Overview

Agentic Retrospective provides a complete feedback loop for AI-assisted development:

```
┌─────────────────────────────────────────────────────────────────────┐
│                         DATA FLOW                                    │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│   Claude Code / Gemini CLI / etc.                                    │
│              │                                                       │
│              ▼                                                       │
│   ┌─────────────────────┐                                           │
│   │    agent-watch      │  ◄── PASSIVE CAPTURE (automatic)          │
│   │      (skill)        │      transcripts, prompts, tools, tokens  │
│   └──────────┬──────────┘                                           │
│              │                                                       │
│              ▼                                                       │
│   ┌─────────────────────┐                                           │
│   │      .logs/         │  ◄── STORAGE                              │
│   │   (filesystem)      │                                           │
│   └──────────┬──────────┘                                           │
│              │                                                       │
│              ▼                                                       │
│   ┌─────────────────────┐                                           │
│   │ agentic-retrospective│  ◄── ANALYZE + ACTIVE FEEDBACK           │
│   │      (skill)        │      reports, micro-retro, scoring        │
│   └──────────┬──────────┘                                           │
│              │                                                       │
│              ├───────────────┐                                       │
│              ▼               ▼                                       │
│   ┌─────────────────┐  ┌─────────────────┐                          │
│   │docs/retrospectives│  │.logs/feedback/ │                          │
│   │   (reports)     │  │(micro-retro)   │                          │
│   └─────────────────┘  └─────────────────┘                          │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

## Components

### Skills

| Skill | Purpose |
|-------|---------|
| **agent-watch** | Captures telemetry: prompts, tool calls, decisions, session transcripts |
| **agentic-retrospective** | Analyzes captured data and generates retrospective reports |

### Tools

| Tool | Purpose |
|------|---------|
| **tools/retrospective** | TypeScript CLI for running retrospectives and generating reports |

## Quick Start

### 1. Install Agent Watch

Set up telemetry capture in your project:

```bash
bash skills/agent-watch/scripts/install.sh
```

This creates the `.logs/` directory structure and installs Claude Code hooks.

### 2. Work Normally

Continue using Claude Code, Gemini CLI, or other AI coding assistants. Agent Watch captures:

- User prompts with complexity signals
- Tool invocations
- Architectural decisions
- Session feedback (when captured)

### 3. Capture Session Feedback (Optional)

After each session, run a quick 30-second feedback survey:

```bash
bash skills/agent-watch/scripts/micro-retro.sh
```

### 4. Run a Retrospective

Generate an evidence-based retrospective report:

```bash
bash skills/agentic-retrospective/scripts/run.sh
```

Or with the TypeScript CLI:

```bash
cd tools/retrospective
npm install && npm run build
npm run start
```

## What Gets Captured

| Data Type | Location | Description |
|-----------|----------|-------------|
| Prompts | `.logs/prompts/YYYY-MM-DD.jsonl` | User prompts with complexity signals |
| Tools | `.logs/tools/YYYY-MM-DD.jsonl` | All tool invocations |
| Decisions | `.logs/decisions/YYYY-MM-DD.jsonl` | Architectural decisions |
| Feedback | `.logs/feedback/YYYY-MM-DD.jsonl` | Post-session micro-retro |
| Sessions | `.logs/sessions/<id>/` | Full session transcripts |

## Report Contents

Retrospectives include:

- **TL;DR Summary** - At-a-glance sprint health
- **Human Partner Insights** - Prompt patterns, improvement suggestions
- **Fix-to-Feature Ratio** - Rework health indicator
- **Scoring Dashboard** - 6 dimension scores (0-5)
- **Action Items** - Prioritized improvements

### Scoring Dimensions

| Dimension | What It Measures |
|-----------|------------------|
| Delivery Predictability | Scope vs delivered |
| Test Loop Completeness | Test coverage, pass rates |
| Quality/Maintainability | Code churn patterns |
| Security Posture | Vulnerability trends |
| Collaboration Efficiency | Human-agent handoffs |
| Decision Hygiene | One-way-door escalation rate |

## Documentation

- [Agent Watch Specification](docs/agent-watch.md)
- [Agentic Retrospective Specification](docs/agentic-retrospective.md)
- [3-Agent Strategy](docs/3agent-strategy.md) - Multi-agent collaborative design
- [Entire.io Review](docs/entire-review.md) - Competitive analysis and roadmap

## License

Apache 2.0

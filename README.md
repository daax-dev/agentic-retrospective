# Agentic Retrospective

[![AgentSkills](https://img.shields.io/badge/AgentSkills-compatible-blue)](https://agentskills.io)
[![PyPI](https://img.shields.io/pypi/v/agentic-retrospective)](https://pypi.org/project/agentic-retrospective/)

Evidence-based sprint retrospectives for human-agent collaboration. An [AgentSkills](https://agentskills.io)-compatible skill that works with Claude Code, Gemini CLI, Cursor, and other agent products.

## Installation

### From GitHub (recommended for now)

```bash
uv pip install git+https://github.com/daax-dev/agentic-retrospective
```

### From PyPI (coming soon)

```bash
uv pip install agentic-retrospective
# or
pip install agentic-retrospective
```

### As Claude Code Plugin

```bash
claude --plugin-dir /path/to/agentic-retrospective
```

Or install from a marketplace once published.

## Quick Start

### 1. Set Up Telemetry

```bash
agentic-retro setup
```

This creates `.logs/` directories and configures Claude Code hooks.

### 2. Work Normally

Continue using your AI coding assistant. Telemetry is captured automatically via hooks.

### 3. Capture Session Feedback

```bash
agentic-retro micro-retro
```

Quick 30-second survey after sessions.

### 4. Run Retrospective

```bash
agentic-retro run
```

Or with options:

```bash
agentic-retro run --since "1 week ago" --verbose
```

### 5. Log Decisions

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
| Delivery Predictability | Scope vs delivered |
| Test Loop Completeness | Test coverage, pass rates |
| Quality/Maintainability | Code churn patterns |
| Security Posture | Vulnerability trends |
| Collaboration Efficiency | Human-agent handoffs |
| Decision Hygiene | One-way-door escalation rate |

## CLI Reference

```
Usage: agentic-retro [OPTIONS] COMMAND [ARGS]...

Commands:
  setup       Set up project for telemetry capture
  micro-retro Capture post-session feedback (30 seconds)
  run         Run retrospective analysis
  decision    Log an architectural decision
```

## Project Structure

```
agentic-retrospective/
├── .claude-plugin/           # Claude Code plugin manifest
│   └── plugin.json
├── hooks/                    # Plugin hooks configuration
│   └── hooks.json
├── skills/                   # AgentSkills definition
│   └── retrospective/
│       └── SKILL.md
├── src/
│   └── agentic_retrospective/
│       ├── cli.py            # CLI entry points
│       ├── commands/         # Command implementations
│       ├── hooks/            # Hook handlers
│       └── models.py         # Pydantic models
├── pyproject.toml            # Python package config
├── SKILL.md                  # AgentSkills.io format
└── README.md
```

## Compatibility

This skill follows the [AgentSkills specification](https://agentskills.io/specification) and works with:

- Claude Code (as plugin or via hooks)
- Gemini CLI
- Cursor
- VS Code (with agent extensions)
- And other AgentSkills-compatible products

## Development

```bash
# Clone and install in dev mode
git clone https://github.com/daax-dev/agentic-retrospective
cd agentic-retrospective
uv pip install -e ".[dev]"

# Run tests
pytest

# Format/lint
ruff check --fix .
ruff format .
```

## License

Apache 2.0

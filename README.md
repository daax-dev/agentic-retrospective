# Agentic Retrospective

[![AgentSkills](https://img.shields.io/badge/AgentSkills-compatible-blue)](https://agentskills.io)
[![PyPI](https://img.shields.io/pypi/v/agentic-retrospective)](https://pypi.org/project/agentic-retrospective/)

Evidence-based sprint retrospectives for human-agent collaboration. An [AgentSkills](https://agentskills.io)-compatible skill that works with Claude Code, Gemini CLI, Cursor, and other agent products.

## Installation

### Claude Code Marketplace (Recommended)

Add the marketplace and install the plugin:

```bash
# Add the marketplace
claude /marketplace add daax-dev/agentic-retrospective

# Install the plugin
claude /plugin add daax-dev/agentic-retrospective
```

Or from within a Claude Code session:
```
/marketplace add daax-dev/agentic-retrospective
/plugin add daax-dev/agentic-retrospective
```

### Direct Plugin Install

```bash
claude --plugin-dir /path/to/agentic-retrospective
```

### Python Package (for CLI usage)

```bash
uv pip install git+https://github.com/daax-dev/agentic-retrospective
# or
pip install agentic-retrospective
```

## Quick Start

### In Claude Code (after plugin install)

Telemetry starts automatically. Use slash commands:

```
/retrospective                     # Run full retrospective
/retrospective --since "1 week"    # Custom time range
/micro-retrospective               # Quick 30-second feedback
```

### Via CLI

```bash
# Set up telemetry directories
agentic-retrospective setup

# Run retrospective
agentic-retrospective run --since "1 week ago" --verbose

# Quick feedback
agentic-retrospective micro-retrospective

# Log decisions
agentic-retrospective decision "Use Zod for validation" --rationale "Type inference" --type two_way_door
```

### What Happens Automatically

When the plugin is installed, Claude Code hooks capture:
- Every prompt you send (with complexity analysis)
- Every tool call the agent makes
- Session timing and patterns

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
| Delivery Predictability | Scope vs delivered |
| Test Loop Completeness | Test coverage, pass rates |
| Quality/Maintainability | Code churn patterns |
| Security Posture | Vulnerability trends |
| Collaboration Efficiency | Human-agent handoffs |
| Decision Hygiene | One-way-door escalation rate |

## CLI Reference

```
Usage: agentic-retrospective [OPTIONS] COMMAND [ARGS]...

Commands:
  setup       Set up project for telemetry capture
  micro-retrospective Capture post-session feedback (30 seconds)
  run         Run retrospective analysis
  decision    Log an architectural decision
```

## Project Structure

```
agentic-retrospective/
├── .claude-plugin/           # Claude Code plugin + marketplace
│   ├── plugin.json           # Plugin manifest
│   └── marketplace.json      # Marketplace registry
├── hooks/                    # Auto-registered hooks
│   └── hooks.json            # SessionStart, UserPromptSubmit, PostToolUse
├── scripts/                  # Hook implementations (bash)
│   ├── ensure-logs-dir.sh
│   ├── log-prompt.sh
│   ├── log-tool.sh
│   ├── micro-retrospective.sh
│   └── run-retrospective.sh
├── skills/                   # Slash command definitions
│   ├── retrospective/
│   │   └── SKILL.md          # /retrospective
│   └── micro-retrospective/
│       └── SKILL.md          # /micro-retrospective
├── src/
│   └── agentic_retrospective/
│       ├── cli.py            # CLI entry points
│       ├── runner.py         # Main orchestration
│       ├── models.py         # Pydantic models (46 types)
│       ├── scoring/          # 6-dimension scoring rubrics
│       ├── analyzers/        # Git, Decision, Human Insights
│       ├── report/           # Markdown/JSON report generation
│       └── commands/         # CLI command implementations
├── tests/                    # 247 tests, 78% coverage
├── pyproject.toml            # Python package config
└── SKILL.md                  # AgentSkills.io format
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

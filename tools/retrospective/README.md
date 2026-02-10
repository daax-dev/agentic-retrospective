# Agentic Retrospective Tool

**Evidence-Based Sprint/Cycle-Level Retrospectives**

A structured, evidence-based retrospective tool that analyzes human-agent collaboration, evaluates inner loop health, and produces actionable improvement recommendations.

## Overview

The Agentic Retrospective tool ingests:
- Code + diffs + PR metadata
- Agent traces (prompt/tool-call logs)
- Decision logs (JSONL)
- Test results, CI logs, security scan outputs (optional)

And produces:
- `retro.md` - Human-readable retrospective report
- `retro.json` - Machine-readable findings and scores
- `evidence_map.json` - Traceability between artifacts
- `alerts.json` - High-risk items requiring follow-up

## Installation

### Standalone Installation

```bash
# Install globally
npm install -g @agentic/retrospective

# Or run directly
npx @agentic/retrospective --help
```

### From Source

```bash
cd tools/retrospective
npm install
npm run build
node dist/cli.js --help
```

## Usage

### Quick Start

```bash
# Run retrospective for last 2 weeks of work
agentic-retro

# Run between tags
agentic-retro --from v1.0.0 --to v1.1.0

# Run from specific commit hash to HEAD
agentic-retro --from a1b2c3d --to HEAD

# Run between two commit hashes
agentic-retro --from abc123 --to def456

# Run for specific sprint
agentic-retro --sprint sprint-42

# Run with CI data
agentic-retro --ci .github/workflows/ci.yml
```

### Command Options

| Option | Description | Default |
|--------|-------------|---------|
| `--from` | Git ref for sprint start (commit hash, tag, branch, relative ref) | `HEAD~100` or 2 weeks ago |
| `--to` | Git ref for sprint end (commit hash, tag, branch, relative ref) | `HEAD` |
| `--sprint` | Sprint identifier for report | Auto-generated |
| `--decisions` | Path to decision log JSONL | `.logs/decisions/` |
| `--logs` | Path to agent logs | `.logs/agents/` |
| `--ci` | Path to CI results | Auto-detect |
| `--output` | Output directory | `docs/retrospectives/` |

### Supported Git Refs

The `--from` and `--to` options accept any valid git ref:

- **Commit hash (full)**: `a1b2c3d4e5f6789...`
- **Commit hash (short)**: `a1b2c3d`
- **Tags**: `v1.0.0`, `release-2024-01`
- **Branches**: `main`, `feature/auth`
- **Relative refs**: `HEAD~50`, `main~10`

## Data Sources

### Required (Minimum Viable Retrospective)

| Source | Description | Location |
|--------|-------------|----------|
| Git history | Commits, diffs, authors | Repository |

### Optional (Enhanced Analysis)

| Source | Description | Location | Setup |
|--------|-------------|----------|-------|
| Decision logs | Architectural decisions | `.logs/decisions/` | agent-watch skill |
| Prompt logs | User prompts with complexity signals | `.logs/prompts/` | agent-watch skill |
| Feedback logs | Post-session micro-retro | `.logs/feedback/` | micro-retro.sh |
| Agent logs | Tool calls, session data | `.logs/` | agent-watch skill |
| Test results | JUnit XML | `test-results/` | CI config |

## Output Structure

```
docs/retrospectives/
├── sprint-42/
│   ├── retro.md          # Human-readable report
│   ├── retro.json        # Machine-readable data
│   ├── evidence_map.json # Finding → evidence links
│   └── alerts.json       # High-severity items
```

## Scoring Dimensions

| Dimension | What It Measures | Score Range |
|-----------|------------------|-------------|
| Delivery Predictability | Scope vs delivered | 0-5 |
| Test Loop Completeness | Test coverage, pass rates | 0-5 |
| Quality/Maintainability | Code churn, large commit % | 0-5 |
| Security Posture | Vulnerability trends | 0-5 |
| Collaboration Efficiency | Human-agent handoffs | 0-5 |
| Decision Hygiene | One-way-door escalation rate | 0-5 |

## Integration with Agent-Watch

For full analysis capabilities, install the agent-watch skill first:

```bash
bash skills/agent-watch/scripts/install.sh
```

This captures:
- User prompts with complexity signals
- Tool invocations
- Architectural decisions
- Session feedback

## Development

```bash
npm install       # Install dependencies
npm run build     # Build TypeScript
npm run dev       # Watch mode
npm run test      # Run tests
npm run lint      # Lint code
```

## License

Apache 2.0

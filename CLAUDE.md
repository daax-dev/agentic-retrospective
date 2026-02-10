# CLAUDE.md

This file provides guidance to Claude Code when working with this repository.

## Repository Overview

**Agentic Retrospective** provides evidence-based sprint retrospectives for human-agent collaboration. It captures telemetry from AI coding sessions and generates actionable insights.

## Architecture

The project follows a clear separation of concerns:

```
agent-watch (capture) → .logs/ (storage) → agentic-retrospective (analyze)
```

- **agent-watch**: Passive data capture via hooks - NEVER analyzes
- **agentic-retrospective**: Reads from .logs/, generates reports - NEVER captures
- **tools/retrospective**: TypeScript implementation of analysis

## Project Structure

```
agentic-retrospective/
├── skills/
│   ├── agent-watch/           # Data capture skill
│   │   ├── scripts/           # install.sh, micro-retro.sh, etc.
│   │   ├── schemas/           # JSONL schemas
│   │   └── templates/         # Hook templates
│   └── agentic-retrospective/ # Analysis skill
│       └── scripts/           # run.sh
├── tools/
│   └── retrospective/         # TypeScript CLI
│       └── src/
│           ├── analyzers/     # Git, decisions, human-insights
│           ├── report/        # Report generators
│           └── scoring/       # Rubrics
└── docs/                      # Specifications and design docs
```

## Development Commands

### TypeScript CLI

```bash
cd tools/retrospective
npm install
npm run build        # Compile TypeScript
npm run dev          # Watch mode
npm run test         # Run tests
npm run typecheck    # Type checking only
```

### Testing Skills

```bash
# Install agent-watch in a test project
bash skills/agent-watch/scripts/install.sh

# Run a retrospective
bash skills/agentic-retrospective/scripts/run.sh
```

## Key Principles

1. **Separation of capture and analysis** - agent-watch only writes, agentic-retrospective only reads
2. **Graceful degradation** - Works with partial data (git-only if no .logs/)
3. **Evidence-based** - Every finding links to source data
4. **Bidirectional learning** - Reports for both human and agent improvement

## Data Flow

```
User Session
    │
    ├── Claude Code hooks ──► .logs/prompts/
    ├── Tool invocations ───► .logs/tools/
    ├── Decision logging ───► .logs/decisions/
    └── micro-retro.sh ────► .logs/feedback/
                                  │
                                  ▼
                        agentic-retrospective
                                  │
                                  ▼
                        docs/retrospectives/
```

## Scoring Dimensions

| Dimension | Score Range | Data Source |
|-----------|-------------|-------------|
| Delivery Predictability | 0-5 | Git commits, session data |
| Test Loop Completeness | 0-5 | CI results, commit analysis |
| Quality/Maintainability | 0-5 | Git diffs |
| Security Posture | 0-5 | Security scan outputs |
| Collaboration Efficiency | 0-5 | Session logs |
| Decision Hygiene | 0-5 | Decision logs |

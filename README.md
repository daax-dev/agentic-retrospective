# Agentic Retrospective

[![AgentSkills](https://img.shields.io/badge/AgentSkills-compatible-blue)](https://agentskills.io)

Evidence-based sprint retrospectives for human-agent collaboration.

![Agentic Retrospective](assets/retro-screen.png)

## Installation

### Claude Code Plugin (Recommended)

```bash
claude /plugin add daax-dev/agentic-retrospective
```

### npm

```bash
npm install -g agentic-retrospective
```

### npx (no install)

```bash
npx agentic-retrospective
```

## Commands

| Command | Description |
|---------|-------------|
| `/retrospective setup` | Initialize telemetry capture |
| `/retrospective` | Conduct full retrospective analysis |
| `/retrospective status` | Check telemetry setup and data |
| `/retrospective repair` | Fix missing directories/config |
| `/retrospective feedback` | Provide session feedback |

## Quick Start

### 1. Setup (once per project)

```
/retrospective setup
```

Creates:
- `.logs/` directories for telemetry
- `docs/retrospectives/` for reports
- Hooks for automatic capture

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

| Dimension | What It Measures |
|-----------|------------------|
| Delivery Predictability | Planned vs actual output |
| Test Loop Completeness | Agent testing before committing |
| Quality/Maintainability | Code health indicators |
| Security Posture | Dependency and code security |
| Collaboration Efficiency | Human-agent handoff quality |
| Decision Hygiene | One-way/two-way door discipline |

## Report Structure

### Executive Summary
- Planned vs delivered
- Quality signals
- Top wins, risks, and recommendations

### Detailed Sections
1. **Delivery & Outcome** - What shipped, metrics
2. **Code Quality** - Diff analysis, complexity
3. **Security** - Dependencies, vulnerabilities
4. **Agent Collaboration** - Strengths, struggles
5. **Inner Loop Health** - Test loop completeness
6. **Decision Quality** - Escalation compliance
7. **Action Items** - Prioritized improvements

## Decision Logging

Log decisions via the decisions directory:

```bash
# Example decision entry
echo '{"ts":"2026-02-01T10:00:00Z","what":"chose React","why":"team familiarity","type":"two_way_door","actor":"human"}' >> .logs/decisions/$(date +%Y%m%d).jsonl
```

**Log when:** Choosing architectures, selecting dependencies, making trade-offs.

## Data Sources

### Required
- **Git History** - Automatically extracted

### Optional (Enhanced Analysis)
- **Decision Logs** - `.logs/decisions/*.jsonl`
- **Agent Logs** - `.logs/agents/`
- **CI Results** - GitHub Actions, etc.
- **Security Scans** - SAST/SCA outputs

## Graceful Degradation

Always produces useful output, even with missing data:

| Data Source | If Missing |
|-------------|------------|
| Git history | Cannot run |
| Decision logs | Reports "decision opacity" |
| Agent logs | Limits collaboration analysis |
| CI results | Skips inner loop metrics |
| Security scans | Skips security section |

## Principles

1. **Evidence-Driven** - Every claim links to artifacts
2. **Blameless** - Evaluates behaviors and systems, not people
3. **Balanced** - Highlights strengths AND weaknesses
4. **Actionable** - Recommendations are implementable

## License

Apache 2.0

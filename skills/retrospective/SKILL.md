---
name: retrospective
description: Evidence-based sprint retrospectives with objective metrics from git, GitHub, and decision logs.
invocation: /daax:retrospective
---

# Retrospective

Evidence-based sprint retrospectives. Produces objective metrics from git history, GitHub PRs, and decision logs. No AI slop - every finding links to specific commits, PRs, or decisions.

## What This Tool Provides

| Metric | Source | Example Output |
|--------|--------|----------------|
| Commit Type Breakdown | git log | "59.7% fixes, 10.8% features, 1.6% tests" |
| PR Supersession Rate | GitHub | "15/20 PRs superseded (75% rework)" |
| Testing Discipline | Decision logs | "2% of decisions mention testing" |
| Decision Quality Score | Decision logs | "78% have both rationale AND context" |
| Agent Commit Detection | git log | "45 commits (11.8%) by agents" |
| Rework Chains | git log | "3 fix commits following feature X" |
| Security Vulnerabilities | Scan outputs | "5 critical, 12 high severity" |

## Sub-commands

### /retrospective
Conduct full retrospective analysis.
```bash
npx agentic-retrospective
npx agentic-retrospective --from HEAD~50
npx agentic-retrospective --from "2 weeks ago"
```

### /retrospective feedback
Provide session feedback (30 seconds).
```bash
npx agentic-retrospective feedback
```

### /retrospective setup
Initialize telemetry directories.
```bash
mkdir -p .logs/decisions .logs/prompts .logs/tools .logs/feedback .logs/security
```

### /retrospective status
Check telemetry setup and data availability.
```bash
ls -la .logs/
```

## Output Sections

1. **Executive Summary** - 10+ metrics in table format
2. **Commit Type Breakdown** - feat/fix/docs/test/refactor/chore
3. **PR Analysis** - supersession rate, test coverage, reviews
4. **What Worked / What Didn't** - threshold-based assessment
5. **Testing Discipline** - % decisions mentioning tests
6. **Mistakes & Corrections** - documented learnings
7. **Recommendations** - current state, target, action

## Requirements

- **Required**: git
- **Optional**: gh CLI (for PR analysis), decision logs, security scans

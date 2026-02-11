# Agentic Retrospective Constitution

> The supreme authority governing this project's purpose, principles, and boundaries.

## Mission

Enable evidence-based sprint retrospectives for human-agent collaboration by analyzing development artifacts and producing actionable insights.

## Core Identity

**Agentic Retrospective is a pure analytics layer.** It reads data and produces insights. It does not capture telemetry, install hooks, or track live sessions.

```
agent-watch captures → .logs/ stores → agentic-retrospective analyzes
```

## Non-Negotiable Principles

### 1. Evidence-Driven

Every claim in a retrospective report must:
- Link to a specific artifact (commit, PR, decision log, session transcript)
- OR be explicitly marked as "inferred" with reduced confidence

No fabricated rationales. No invented evidence.

### 2. Blameless

Retrospectives evaluate **behaviors and systems**, never people.
- Focus on patterns, not individuals
- Highlight systemic improvements, not personal failures
- Use neutral language that enables learning

### 3. Balanced

Every report must:
- Highlight both strengths AND weaknesses fairly
- Celebrate wins alongside identifying risks
- Provide context that prevents misinterpretation

### 4. Actionable

Recommendations must be:
- Implementable within the next 1-2 sprints
- Specific enough to be assigned an owner
- Measurable via a success metric

Maximum 5 action items per retrospective. Fewer is better.

### 5. Graceful Degradation

The tool must **always produce useful output**, even with incomplete data.
- Git history is the only hard requirement
- Missing data sources reduce confidence, not capability
- Gaps are documented with specific remediation instructions

## Boundaries

### What This Project Does

| Capability | Description |
|------------|-------------|
| Analyze git history | Commits, diffs, PRs, file changes, authorship |
| Parse decision logs | JSONL decision records from `.logs/decisions/` |
| Consume agent telemetry | Session transcripts, prompts, tool calls from agent-watch |
| Process CI/test results | JUnit XML, coverage reports, build logs |
| Generate retrospective reports | Markdown + JSON + evidence maps + alerts |
| Score collaboration health | 6 dimensions on a 0-5 scale with confidence levels |

### What This Project Does NOT Do

| Anti-pattern | Why |
|--------------|-----|
| Capture session data | That's agent-watch's responsibility |
| Install hooks | That's agent-watch's responsibility |
| Write to `.logs/` | Data flows in, not out |
| Track live sessions | Analysis is retrospective, not real-time |
| Grade people for punishment | Blameless by design |
| Recommend big rewrites | Only with repeated failure evidence |
| Generate 20+ action items | Quality over quantity |
| Invent missing context | Admit uncertainty instead |

## Scoring System

### Dimensions (0-5 Scale)

| Dimension | Measures |
|-----------|----------|
| **Delivery Predictability** | Scope vs delivered, carryover, commit patterns |
| **Test Loop Completeness** | Coverage, pass rates, red-green cycle health |
| **Quality/Maintainability** | Code churn, diff sizes, documentation |
| **Security Posture** | Vulnerability trends, dependency hygiene, controls |
| **Collaboration Efficiency** | Human-agent handoffs, scope drift, autonomy |
| **Decision Hygiene** | One-way-door escalation, rationale presence |

### Scoring Scale

| Score | Meaning |
|-------|---------|
| 5 | Excellent - top performance, maintain practices |
| 4 | Good - above average, minor improvements possible |
| 3 | Acceptable - meeting baseline, room for improvement |
| 2 | Concerning - below expectations, action needed |
| 1 | Critical - serious issues, immediate action required |
| N/A | Insufficient data to score |

### Confidence Levels

| Level | Criteria |
|-------|----------|
| High | Direct evidence, sample size ≥20, good data quality |
| Medium | Direct evidence, sample size ≥5 |
| Low | Inferred or limited evidence |
| None | Cannot determine |

## Data Contract

### Inputs

| Source | Location | Required |
|--------|----------|----------|
| Git history | `.git/` | Yes (fatal without) |
| Decision logs | `.logs/decisions/*.jsonl` | No (warns if missing) |
| Agent sessions | `.logs/sessions/` | No (limits analysis) |
| Prompt logs | `.logs/prompts/` | No (limits analysis) |
| Feedback logs | `.logs/feedback/` | No (limits analysis) |
| Test results | JUnit XML, coverage reports | No (skips test metrics) |
| Security scans | SAST/SCA outputs | No (skips security section) |

### Outputs

| Artifact | Purpose |
|----------|---------|
| `retrospective.md` | Human-readable report |
| `retrospective.json` | Machine-readable data for tooling |
| `evidence_map.json` | Links findings to source artifacts |
| `alerts.json` | High-severity items requiring attention |

## Decision Framework

### For One-Way-Door Decisions

Changes that are hard to reverse must:
1. Be escalated to a human decision-maker
2. Include options considered with pros/cons
3. Document rationale and reversibility plan
4. Be logged to `.logs/decisions/`

### For Two-Way-Door Decisions

Easily reversible choices may be:
- Made autonomously by agents
- Logged for transparency (recommended)
- Validated by outcomes in subsequent retrospectives

## Quality Gates

### Report Generation

A retrospective report is valid if:
- [ ] Git history was successfully analyzed
- [ ] All claims link to evidence or are marked "inferred"
- [ ] Scores include confidence levels
- [ ] Telemetry gaps are documented with remediation
- [ ] Action items ≤5 with owners and success metrics
- [ ] Both wins and risks are represented

### Schema Compliance

All JSON outputs must:
- Pass schema validation
- Include metadata (tool version, schema version, timestamp)
- Use consistent identifiers across artifacts

## Governance

### Version Control

- This constitution is version-controlled
- Changes require explicit justification
- Breaking changes to data contracts require migration paths

### Evolution

The tool may evolve to:
- Support additional data sources
- Refine scoring algorithms with usage feedback
- Add new report sections based on user needs

The tool may NOT evolve to:
- Capture its own telemetry
- Replace human judgment on one-way-door decisions
- Generate punitive performance evaluations

---

*Constitution Version: 1.0*
*Last Updated: 2025-02*
*Authority: This document is the supreme reference for project decisions*

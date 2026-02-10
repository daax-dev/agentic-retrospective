# agentic-retrospective

> **Role**: Data Analysis | **Type**: Analytics Skill | **Status**: Active

Agentic-retrospective is the **analytics layer** for agentic development. It consumes data captured by agent-watch and produces actionable insights, scores, and retrospective reports.

## Core Principle

**agent-watch captures. agentic-retrospective analyzes.**

agentic-retrospective NEVER captures its own data. It reads from `.logs/` (populated by agent-watch) and git history, then produces analysis in `docs/retrospectives/`.

---

## What agentic-retrospective Analyzes

### From agent-watch Data (`.logs/`)

| Source | Analysis Produced |
|--------|-------------------|
| `sessions/*.jsonl` | Session duration, turn count, files per session |
| `prompts/*.jsonl` | Prompt quality scoring, complexity patterns |
| `tools/*.jsonl` | Tool usage patterns, efficiency metrics |
| `feedback/*.jsonl` | Human satisfaction trends, rework patterns |
| `checkpoints/` | Checkpoint frequency, session-to-commit linking |
| Token usage | Cost analysis, cost trends, anomaly detection |

### From Git History

| Source | Analysis Produced |
|--------|-------------------|
| Commits | Commit frequency, size distribution, authorship |
| Diffs | Lines added/removed, file churn |
| Commit messages | Rework detection (fix commits), feature vs fix ratio |
| Trailers | Session-to-commit linking (Daax-Session:) |

### From CI/Test Results (Optional)

| Source | Analysis Produced |
|--------|-------------------|
| JUnit XML | Test pass/fail rates, test coverage |
| CI logs | Build success rate, pipeline duration |

---

## Reports Generated

### Sprint Retrospective (`docs/retrospectives/<sprint>/`)

| File | Description |
|------|-------------|
| `retrospective.md` | Human-readable report with scores and findings |
| `retrospective.json` | Machine-readable analysis data |
| `evidence_map.json` | Links findings to source evidence |
| `alerts.json` | High-severity items requiring attention |

### Report Sections

1. **Executive Summary** - TL;DR with quick wins
2. **Scoring Dashboard** - 6 dimension scores (0-5)
3. **Human Partner Insights** - Prompt patterns, improvement suggestions
4. **Agent Calibration** - Agent behavior evaluation
5. **Review Bottleneck Analysis** - Time-to-commit, revision cycles
6. **Cost Analysis** - Token costs, trends, anomalies
7. **Findings & Evidence** - Detailed findings with traceability
8. **Action Items** - Prioritized next steps

---

## Scoring Dimensions

| Dimension | What It Measures | Data Source |
|-----------|------------------|-------------|
| **Delivery Predictability** | Scope vs delivered, carry-over | Git commits, session data |
| **Test Loop Completeness** | Test coverage, pass rates | CI results, commit analysis |
| **Quality/Maintainability** | Code churn, large commit % | Git diffs |
| **Security Posture** | Vulnerability trends, controls | Security scan outputs |
| **Collaboration Efficiency** | Human-agent handoffs, interrupts | agent-watch sessions |
| **Decision Hygiene** | One-way-door escalation rate | Decision logs |

### Scoring Scale

| Score | Label | Meaning |
|-------|-------|---------|
| 5 | Excellent | Top performance, maintain practices |
| 4 | Good | Above average, minor improvements possible |
| 3 | Acceptable | Meeting baseline, room for improvement |
| 2 | Concerning | Below expectations, action needed |
| 1 | Critical | Serious issues, immediate action required |
| N/A | Insufficient Data | Cannot score due to missing telemetry |

---

## Key Metrics

### Review Bottleneck Metrics

| Metric | Definition | Target |
|--------|------------|--------|
| Time-to-Commit | Duration from first agent response to commit | <30 min |
| Revision Cycles | Back-and-forth corrections before acceptance | <2 |
| Rework Percentage | % of commits fixing recent commits | <10% |
| Agent Autonomy Score | % sessions with <2 human interventions | >70% |

### Cost Metrics

| Metric | Definition | Target |
|--------|------------|--------|
| Cost per Session | Total token cost for a session | Track trend |
| Cost per Commit | Token cost divided by commits | Decreasing |
| Cache Hit Rate | cache_read / (cache_read + input) | >50% |
| Cost Anomalies | Sessions costing 3x+ normal | 0 |

### Human Feedback Metrics

| Metric | Definition | Target |
|--------|------------|--------|
| Alignment Score | Avg micro-retro alignment rating | >4.0/5 |
| Rework Distribution | % none/minor/significant | >70% none |
| Revision Cycles | Avg corrections per session | <2 |

---

## Analysis Types

### 1. Token Cost Analysis

```typescript
// Reads: .logs/sessions/*/usage.json
// Produces: Cost breakdown, trends, anomalies

interface TokenCostAnalysis {
  totalCost: number;
  costBreakdown: {
    input: number;
    cacheWrite: number;
    cacheRead: number;
    output: number;
  };
  costPerCommit: number;
  costTrend: 'increasing' | 'stable' | 'decreasing';
  anomalies: CostAnomaly[];
}
```

### 2. Prompt Quality Analysis

```typescript
// Reads: .logs/prompts/*.jsonl
// Produces: Quality scores, pattern recommendations

interface PromptQualityAnalysis {
  avgAmbiguityScore: number;
  constraintUsageRate: number;
  exampleUsageRate: number;
  effectivePatterns: PromptPattern[];
  problematicPatterns: PromptPattern[];
}
```

### 3. Review Bottleneck Analysis

```typescript
// Reads: .logs/sessions/, .logs/feedback/, git history
// Produces: Bottleneck metrics, severity rating

interface ReviewBottleneckAnalysis {
  timeToCommit: { avg: number; p50: number; p90: number };
  revisionCycles: { avg: number; distribution: number[] };
  reworkPercentage: number;
  bottleneckSeverity: 'low' | 'medium' | 'high' | 'critical';
}
```

### 4. Human Insights Analysis

```typescript
// Reads: .logs/feedback/*.jsonl, .logs/prompts/*.jsonl
// Produces: Improvement suggestions for human prompting

interface HumanInsights {
  promptPatterns: {
    effective: PromptPattern[];
    problematic: PromptPattern[];
  };
  feedbackSummary: FeedbackSummary;
  claudeMdSuggestions: string[];
}
```

---

## Commands

### Retrospective Reports

| Command | Description |
|---------|-------------|
| `/agentic-retrospective` | Run full retrospective for current sprint |
| `/agentic-retrospective --from <ref>` | Specify start commit/tag |
| `/agentic-retrospective --to <ref>` | Specify end commit/tag |
| `/agentic-retrospective --sprint <id>` | Label the sprint |

### Micro-Retro (Session Feedback)

| Command | Description |
|---------|-------------|
| `/micro-retro` | Capture post-session feedback (30 seconds) |

micro-retro prompts for:
- **Alignment** (1-5): How well did the agent match your intent?
- **Rework needed**: None, minor, or significant?
- **Revision cycles**: How many back-and-forth corrections?
- **Improvement**: One thing to improve next time
- **What worked**: Positive patterns to reinforce

Data is written to `.logs/feedback/YYYY-MM-DD.jsonl` and analyzed in sprint retrospectives.

---

## What agentic-retrospective Does NOT Do

- **Does NOT capture session data** - That's agent-watch's job
- **Does NOT install hooks** - That's agent-watch's job
- **Does NOT write to `.logs/`** - That's agent-watch's job
- **Does NOT track live sessions** - That's agent-watch's job

agentic-retrospective is a pure analysis layer. It reads data and produces insights.

---

## Data Dependencies

### Required (Minimum Viable Retrospective)

| Source | Skill | Notes |
|--------|-------|-------|
| Git history | Built-in | Always available |

### Optional (Enhanced Analysis)

| Source | Skill | Notes |
|--------|-------|-------|
| Session transcripts | agent-watch | Enables collaboration analysis |
| Prompt logs | agent-watch | Enables prompt quality scoring |
| Feedback logs | agent-watch | Enables human insights |
| Token usage | agent-watch | Enables cost analysis |
| Decision logs | agent-watch | Enables decision hygiene scoring |
| CI results | External | Enables test loop scoring |
| Entire checkpoints | Entire CLI | Additional session data |

### Graceful Degradation

When data is missing, agentic-retrospective:
1. Clearly documents the gap in the report
2. Adjusts confidence scores downward
3. Provides instructions to collect missing data
4. Still produces a partial report with available information

---

## Relationship with agent-watch

```
┌─────────────────────────────────────────────────────────────────────┐
│                         DATA FLOW                                    │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│   ┌─────────────────────┐                                           │
│   │    agent-watch      │  ◄── Captures all telemetry               │
│   └──────────┬──────────┘                                           │
│              │                                                       │
│              ▼                                                       │
│   ┌─────────────────────┐                                           │
│   │      .logs/         │  ◄── Structured storage                   │
│   │   sessions/         │      - Full transcripts                   │
│   │   prompts/          │      - Prompt logs                        │
│   │   feedback/         │      - Micro-retro data                   │
│   │   checkpoints/      │      - Checkpoint snapshots               │
│   └──────────┬──────────┘                                           │
│              │                                                       │
│              ▼                                                       │
│   ┌─────────────────────┐                                           │
│   │agentic-retrospective│  ◄── Analyzes (this skill)                │
│   │   (this skill)      │                                           │
│   └──────────┬──────────┘                                           │
│              │                                                       │
│              ▼                                                       │
│   ┌─────────────────────┐                                           │
│   │ docs/retrospectives/│  ◄── Reports & insights                   │
│   │   retrospective.md  │      - Scores                             │
│   │   retrospective.json│      - Findings                           │
│   │   evidence_map.json │      - Action items                       │
│   └─────────────────────┘                                           │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Entire.io Integration

agentic-retrospective can consume Entire checkpoint data in addition to agent-watch data:

```bash
# Analyze both agent-watch and Entire data
/agentic-retrospective --include-entire
```

When Entire data is available:
- Session transcripts enriched with Entire's full.jsonl
- Checkpoint-commit linking via Entire-Checkpoint trailers
- Subagent transcripts from Entire's task checkpoints

---

## Output Directory Structure

```
docs/retrospectives/
├── sprint-42/
│   ├── retrospective.md       # Human-readable report
│   ├── retrospective.json     # Machine-readable data
│   ├── evidence_map.json      # Finding → evidence links
│   └── alerts.json            # High-severity items
└── sprint-43/
    └── ...
```

---

*Skill: agentic-retrospective | Version: 1.0 | Role: Data Analysis*

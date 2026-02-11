---
mode: agent
description: Generate sprint/cycle-level agentic retrospective with evidence-based analysis of human-agent collaboration, inner loop health, and improvement recommendations.
loop: outer
---

# /retro - Agentic Retrospective

Generate a structured, evidence-based retrospective that analyzes human-agent collaboration, evaluates inner loop health, and produces actionable improvement recommendations.

## User Input

```text
$ARGUMENTS
```

**Expected Input**: Optional arguments like `--from <ref>`, `--to <ref>`, `--sprint <id>`, or no arguments for defaults.

---

## Overview

This command orchestrates a comprehensive retrospective workflow:

- **Phase 0: Configuration** - Parse arguments, determine sprint boundaries
- **Phase 1: Data Collection** - Gather git history, decision logs, agent traces
- **Phase 2: Evidence Indexing** - Build cross-links between artifacts
- **Phase 3: Sprint Analysis** - Evaluate scoring dimensions
- **Phase 4: Report Generation** - Produce structured outputs
- **Phase 5: Action Planning** - Generate prioritized improvements

### Extended Thinking Mode

> **🧠 Think Hard**: Retrospectives require balanced, objective analysis. Apply extended thinking to:
> - Correlating evidence across multiple data sources
> - Identifying patterns without assigning blame
> - Distinguishing root causes from symptoms
> - Prioritizing actionable improvements

---

## Phase 0: Configuration & Data Discovery

**Report progress**: Print "Phase 0: Configuring retrospective and discovering data sources..."

### Step 1: Parse Arguments

```bash
# Default values
FROM_REF=""
TO_REF="HEAD"
SPRINT_ID="$(date +%Y-%m-%d)-retro"
DECISIONS_PATH=".logs/decisions"
AGENT_LOGS_PATH=".logs/agents"
CI_PATH=""
OUTPUT_DIR="docs/retro"

# Parse user arguments
# Supported: --from <ref>, --to <ref>, --sprint <id>, --decisions <path>, --output <path>
```

### Step 2: Determine Sprint Boundaries

If `--from` not specified, determine automatically:

```bash
# Option 1: Find commits from last 2 weeks
FROM_DATE=$(date -v-14d +%Y-%m-%d 2>/dev/null || date -d "14 days ago" +%Y-%m-%d)
FROM_REF=$(git log --since="$FROM_DATE" --reverse --format="%H" | head -1)

# Option 2: If no commits in 2 weeks, use last 50 commits
if [ -z "$FROM_REF" ]; then
  FROM_REF="HEAD~50"
fi
```

### Step 3: Validate Git Repository

```bash
if ! git rev-parse --git-dir > /dev/null 2>&1; then
  echo "[X] Phase 0 Failed: Not a git repository"
  echo ""
  echo "The /retro command requires a git repository to analyze."
  echo "Initialize git or navigate to a git repository."
  exit 1
fi
```

### Step 4: Discover Available Data Sources

Check for each optional data source and report status:

```bash
echo "📊 Data Source Discovery"
echo "========================"
echo ""

# Git history (required)
COMMIT_COUNT=$(git rev-list --count $FROM_REF..$TO_REF 2>/dev/null || echo "0")
echo "✅ Git history: $COMMIT_COUNT commits ($FROM_REF..$TO_REF)"

# Decision logs (optional)
if [ -d "$DECISIONS_PATH" ]; then
  DECISION_FILES=$(find "$DECISIONS_PATH" -name "*.jsonl" 2>/dev/null | wc -l | tr -d ' ')
  if [ "$DECISION_FILES" -gt 0 ]; then
    DECISION_COUNT=$(cat "$DECISIONS_PATH"/*.jsonl 2>/dev/null | wc -l | tr -d ' ')
    echo "✅ Decision logs: $DECISION_COUNT decisions in $DECISION_FILES files"
    HAS_DECISIONS=true
  else
    echo "⚠️  Decision logs: Directory exists but no .jsonl files found"
    HAS_DECISIONS=false
  fi
else
  echo "⚠️  Decision logs: Not found at $DECISIONS_PATH"
  HAS_DECISIONS=false
fi

# Agent logs (optional)
if [ -d "$AGENT_LOGS_PATH" ]; then
  AGENT_FILES=$(find "$AGENT_LOGS_PATH" -type f 2>/dev/null | wc -l | tr -d ' ')
  if [ "$AGENT_FILES" -gt 0 ]; then
    echo "✅ Agent logs: $AGENT_FILES files found"
    HAS_AGENT_LOGS=true
  else
    echo "⚠️  Agent logs: Directory exists but empty"
    HAS_AGENT_LOGS=false
  fi
else
  echo "⚠️  Agent logs: Not found at $AGENT_LOGS_PATH"
  HAS_AGENT_LOGS=false
fi

# CI results (optional)
if [ -d ".github/workflows" ] || [ -f ".gitlab-ci.yml" ] || [ -f "circle.yml" ]; then
  echo "✅ CI configuration: Detected"
  HAS_CI=true
else
  echo "ℹ️  CI configuration: Not detected"
  HAS_CI=false
fi

# Test results (optional)
if [ -d "test-results" ] || [ -d "coverage" ] || [ -f "pytest.xml" ] || [ -f "junit.xml" ]; then
  echo "✅ Test results: Found"
  HAS_TESTS=true
else
  echo "ℹ️  Test results: Not found"
  HAS_TESTS=false
fi

echo ""
```

### Step 5: Report Data Completeness

```bash
# Calculate completeness percentage
SOURCES_FOUND=1  # Git is always found if we get here
SOURCES_TOTAL=5

[ "$HAS_DECISIONS" = true ] && SOURCES_FOUND=$((SOURCES_FOUND + 1))
[ "$HAS_AGENT_LOGS" = true ] && SOURCES_FOUND=$((SOURCES_FOUND + 1))
[ "$HAS_CI" = true ] && SOURCES_FOUND=$((SOURCES_FOUND + 1))
[ "$HAS_TESTS" = true ] && SOURCES_FOUND=$((SOURCES_FOUND + 1))

COMPLETENESS=$((SOURCES_FOUND * 100 / SOURCES_TOTAL))

echo "📈 Data Completeness: $COMPLETENESS% ($SOURCES_FOUND/$SOURCES_TOTAL sources)"
echo ""

if [ "$COMPLETENESS" -lt 40 ]; then
  echo "⚠️  Low data completeness will limit analysis depth."
  echo "   The retrospective will still run but with reduced insights."
  echo ""
fi
```

**Phase 0 Success**:
```
✅ Phase 0 Complete: Configuration ready
   Sprint: sprint-42 (2024-01-01 to 2024-01-15)
   Commits: 47
   Data completeness: 60% (3/5 sources)
```

---

## Phase 1: Data Collection

**Report progress**: Print "Phase 1: Collecting and normalizing data..."

### Step 1: Extract Git History

```bash
# Get commit data
git log $FROM_REF..$TO_REF --format='{
  "hash": "%H",
  "short_hash": "%h",
  "author": "%an",
  "email": "%ae",
  "date": "%aI",
  "subject": "%s",
  "body": "%b"
}' --no-walk=unsorted
```

Collect:
- Commit hashes, authors, dates, messages
- File changes per commit
- Lines added/removed
- PR references (from commit messages or GitHub API)

### Step 2: Analyze File Changes

```bash
# Get changed files with stats
git diff --stat $FROM_REF..$TO_REF

# Get detailed diff for pattern analysis
git diff $FROM_REF..$TO_REF --numstat
```

Categorize changes:
- New files vs modifications
- Test files vs production code
- Documentation changes
- Configuration changes

### Step 3: Load Decision Logs

If decision logs exist:

```bash
# Read all JSONL files in date range
for file in "$DECISIONS_PATH"/*.jsonl; do
  cat "$file" 2>/dev/null
done
```

Parse each decision record and validate against schema:
- Required fields: `timestamp`, `decision`
- Optional fields: `rationale`, `actor`, `category`, `risk_level`
- Flag malformed records as data quality issues

**If decision logs missing**, record telemetry gap:

```json
{
  "gap_type": "missing_decisions",
  "severity": "high",
  "impact": "Cannot evaluate decision quality or boundary discipline",
  "recommendation": "Set up decision logging. See skills/retro/README.md#setting-up-decision-logging"
}
```

### Step 4: Load Agent Logs

If agent logs exist, parse supported formats:
- Claude Code session logs
- Aider conversation logs
- Custom JSONL agent traces

Extract:
- Tool calls and results
- Timestamps
- Success/failure indicators
- Human interrupt points

**If agent logs missing**, record telemetry gap:

```json
{
  "gap_type": "missing_agent_logs",
  "severity": "medium",
  "impact": "Cannot analyze agent collaboration patterns or inner loop health",
  "recommendation": "Enable agent session logging. For Claude Code, logs are stored in ~/.claude/logs/"
}
```

### Step 5: Load Test Results (if available)

Search for common test output formats:
- JUnit XML
- pytest XML/JSON
- Jest JSON
- Coverage reports (lcov, cobertura)

**Phase 1 Success**:
```
✅ Phase 1 Complete: Data collected
   Commits: 47 analyzed
   Decisions: 12 loaded (or "⚠️ 0 - telemetry gap recorded")
   Agent traces: 156 tool calls (or "⚠️ 0 - telemetry gap recorded")
   Test results: 234 tests found (or "ℹ️ Not available")
```

---

## Phase 2: Evidence Indexing

**Report progress**: Print "Phase 2: Building evidence index and cross-references..."

### Step 1: Build Timeline

Create unified timeline of all events:

```json
{
  "timeline": [
    {"ts": "2024-01-01T10:00:00Z", "type": "commit", "ref": "abc123", "summary": "..."},
    {"ts": "2024-01-01T10:05:00Z", "type": "decision", "ref": "dec-001", "summary": "..."},
    {"ts": "2024-01-01T10:10:00Z", "type": "tool_call", "ref": "tc-001", "summary": "..."}
  ]
}
```

### Step 2: Link Commits to Decisions

For each commit, search for related decisions:
- By timestamp proximity (within 1 hour)
- By explicit references in decision `evidence_refs`
- By file path overlap

### Step 3: Link Commits to Agent Actions

For each commit, identify:
- Was this commit made by an agent or human?
- What tool calls led to this commit?
- Were there failed attempts before success?

### Step 4: Identify Orphan Artifacts

Find unlinked items that may indicate gaps:
- Commits without decision context (for significant changes)
- Decisions without implementation evidence
- Agent traces without resulting commits

**Phase 2 Success**:
```
✅ Phase 2 Complete: Evidence indexed
   Timeline events: 215
   Commit-decision links: 8
   Orphan commits (significant): 3
   Orphan decisions: 1
```

---

## Phase 3: Sprint Analysis

**Report progress**: Print "Phase 3: Analyzing sprint across scoring dimensions..."

### Scoring Framework

Apply the following rubrics (0-5 scale) with evidence and confidence:

#### 3.1 Delivery Predictability

Evaluate:
- Planned vs delivered (if sprint goals available)
- Scope drift indicators (commits outside expected areas)
- Carryover from previous sprint

Score interpretation:
- 0: Constant churn; no plan-to-ship mapping
- 5: Tight scope discipline; small, frequent, completed increments

#### 3.2 Test Loop Completeness (Inner Loop)

Evaluate:
- % of changes with tests run before human review
- Number of "ask human to run tests" events
- Red→green cycles executed autonomously
- Average time between test failure and successful rerun

Score interpretation:
- 0: No runnable tests locally; frequent human debugging
- 5: Agent can run unit+integration reliably; failures are self-served

**If no test data available**, mark as:
```json
{
  "score": null,
  "confidence": "none",
  "note": "Insufficient telemetry - no test results found",
  "recommendation": "Add test result artifacts (JUnit XML, pytest reports)"
}
```

#### 3.3 Quality / Maintainability

Evaluate:
- Diff sizes (large unreviewed diffs are risky)
- Hotspots (files changed multiple times)
- Documentation changes (or lack thereof)
- Review depth (if PR data available)

#### 3.4 Security Posture

Evaluate:
- Dependency changes (new packages, known CVEs)
- Auth/authz changes
- Secrets hygiene (any potential leaks detected)
- Security control evidence (SAST/SCA runs)

#### 3.5 Collaboration Efficiency

Evaluate:
- Human interrupt frequency
- Trivial vs meaningful escalations
- Rework loops (agent fixes same issue multiple times)
- Handoff smoothness

#### 3.6 Decision Hygiene

Evaluate:
- Decision log completeness
- One-way-door decisions properly escalated
- Two-way-door decisions not over-escalated
- Decision thrash (repeated reversals)

**If no decision logs available**:
```json
{
  "score": null,
  "confidence": "none",
  "note": "Decision opacity - no decision logs found",
  "recommendation": "Implement decision logging for architecture, security, API, data, and deps categories"
}
```

### Detect Problem Patterns

Search for:
- **Scope creep**: Agent adds unrequested work
- **Refactor fever**: Large refactors during small bug fixes
- **Over-communication**: Trivial questions to humans
- **Missed escalations**: High-stakes changes without human decisions

**Phase 3 Success**:
```
✅ Phase 3 Complete: Analysis finished

   Scores (0-5):
   ├── Delivery Predictability: 4 (High confidence)
   ├── Test Loop Completeness: 3 (Medium confidence)
   ├── Quality/Maintainability: 3 (High confidence)
   ├── Security Posture: N/A (No data)
   ├── Collaboration Efficiency: 4 (Medium confidence)
   └── Decision Hygiene: N/A (No data)

   Pattern alerts: 2
   Telemetry gaps: 2
```

---

## Phase 4: Report Generation

**Report progress**: Print "Phase 4: Generating retrospective report..."

### Step 1: Create Output Directory

```bash
OUTPUT_PATH="$OUTPUT_DIR/$SPRINT_ID"
mkdir -p "$OUTPUT_PATH"
```

### Step 2: Generate retro.md

Write the human-readable report following this structure:

```markdown
# Sprint Retrospective: [SPRINT_ID]

**Period**: [FROM_DATE] to [TO_DATE]
**Generated**: [TIMESTAMP]
**Data Completeness**: [X]% ([N]/5 sources)

---

## Executive Summary

### What Was Delivered
- [N] commits by [N] contributors
- [Key features/changes shipped]

### Quality Signals
- Test pass rate: [X]% (or "Unknown - no test data")
- Code review coverage: [X]% (or "Unknown - no PR data")

### Collaboration Health
- Agent contribution: [X]% of commits
- Human interrupts: [N] (or "Unknown - no agent logs")

### Top 3 Wins
1. [Win with evidence reference]
2. [Win with evidence reference]
3. [Win with evidence reference]

### Top 3 Risks
1. [Risk with evidence reference]
2. [Risk with evidence reference]
3. [Risk with evidence reference]

### Top 3 Recommended Changes
1. [Actionable recommendation]
2. [Actionable recommendation]
3. [Actionable recommendation]

---

## Detailed Analysis

### Delivery & Outcome
[Analysis with evidence]

### Code Quality & Maintainability
[Analysis with evidence]

### Security & Compliance
[Analysis with evidence, or telemetry gap note]

### Agent Collaboration (360°)
[Balanced analysis of strengths and struggles]

### Inner Loop Health
[Test loop analysis, or telemetry gap note]

### Decision Quality
[Decision log analysis, or telemetry gap note]

---

## Telemetry Gaps

[For each missing data source, provide:]

### [Gap Name]

**Impact**: [What analysis was limited]
**Recommendation**: [Specific steps to collect this data]

Example:
```bash
# Set up decision logging
mkdir -p .logs/decisions
# Add to CLAUDE.md or team workflow
```

---

## Scoring Summary

| Dimension | Score | Confidence | Evidence |
|-----------|-------|------------|----------|
| Delivery Predictability | X/5 | High/Medium/Low | [refs] |
| Test Loop Completeness | X/5 | High/Medium/Low | [refs] |
| Quality/Maintainability | X/5 | High/Medium/Low | [refs] |
| Security Posture | X/5 | High/Medium/Low | [refs] |
| Collaboration Efficiency | X/5 | High/Medium/Low | [refs] |
| Decision Hygiene | X/5 | High/Medium/Low | [refs] |

---

## Action Items

### Must Do (This Sprint)
| Action | Why | Owner | Success Metric |
|--------|-----|-------|----------------|
| [Action] | [Rationale] | [TBD] | [Measurable outcome] |

### Next Sprint
| Action | Why | Owner | Success Metric |
|--------|-----|-------|----------------|
| [Action] | [Rationale] | [TBD] | [Measurable outcome] |

### Backlog
| Action | Why | Priority |
|--------|-----|----------|
| [Action] | [Rationale] | Medium/Low |

---

*Generated by `/retro` - Daax Agentic Retrospective*
```

### Step 3: Generate retro.json

Machine-readable output:

```json
{
  "sprint_id": "sprint-42",
  "period": {
    "from": "2024-01-01T00:00:00Z",
    "to": "2024-01-15T00:00:00Z"
  },
  "data_completeness": {
    "percentage": 60,
    "sources": {
      "git": true,
      "decisions": false,
      "agent_logs": true,
      "ci": true,
      "tests": false
    }
  },
  "scores": {
    "delivery_predictability": {"score": 4, "confidence": "high", "evidence": ["..."]},
    "test_loop_completeness": {"score": 3, "confidence": "medium", "evidence": ["..."]},
    "quality_maintainability": {"score": 3, "confidence": "high", "evidence": ["..."]},
    "security_posture": {"score": null, "confidence": "none", "note": "No data"},
    "collaboration_efficiency": {"score": 4, "confidence": "medium", "evidence": ["..."]},
    "decision_hygiene": {"score": null, "confidence": "none", "note": "No data"}
  },
  "findings": [
    {
      "id": "finding-001",
      "severity": "medium",
      "title": "Scope drift detected",
      "summary": "Agent added 3 refactoring commits unrelated to task",
      "evidence": ["commit:abc123", "commit:def456"],
      "confidence": "high",
      "recommendation": "Add explicit scope boundaries to task descriptions"
    }
  ],
  "telemetry_gaps": [
    {
      "gap_type": "missing_decisions",
      "severity": "high",
      "impact": "Cannot evaluate decision quality",
      "recommendation": "Set up decision logging"
    }
  ],
  "action_items": [
    {
      "priority": "must_do",
      "action": "Set up decision logging",
      "rationale": "Enable decision quality analysis",
      "owner": null,
      "success_metric": "100% of architecture decisions logged",
      "impact": 5,
      "effort": 2
    }
  ],
  "generated_at": "2024-01-16T10:00:00Z"
}
```

### Step 4: Generate evidence_map.json

Traceability between artifacts:

```json
{
  "commits": {
    "abc123": {
      "decisions": ["dec-001"],
      "tool_calls": ["tc-001", "tc-002"],
      "tests": ["test-auth-login"]
    }
  },
  "decisions": {
    "dec-001": {
      "commits": ["abc123", "def456"],
      "type": "one_way_door",
      "escalated": true
    }
  },
  "orphans": {
    "commits_without_context": ["ghi789"],
    "decisions_without_implementation": []
  }
}
```

### Step 5: Generate alerts.json

High-priority items:

```json
{
  "alerts": [
    {
      "id": "alert-001",
      "severity": "high",
      "type": "missed_escalation",
      "title": "One-way-door change without decision record",
      "description": "Database schema migration committed without decision log entry",
      "evidence": ["commit:abc123"],
      "recommended_action": "Retroactively document decision rationale"
    }
  ]
}
```

**Phase 4 Success**:
```
✅ Phase 4 Complete: Reports generated

   Output files:
   ├── docs/retro/sprint-42/retro.md
   ├── docs/retro/sprint-42/retro.json
   ├── docs/retro/sprint-42/evidence_map.json
   └── docs/retro/sprint-42/alerts.json
```

---

## Phase 5: Action Planning

**Report progress**: Print "Phase 5: Prioritizing action items..."

### Prioritization Heuristic

Score each potential action by:
- **Impact** (0-5): How much will this improve?
- **Effort** (0-5): How hard to implement?
- **Risk Reduction** (0-5): Does this prevent future problems?
- **Recurrence** (0-5): How often does this issue occur?

Calculate priority score: `(impact + risk_reduction + recurrence) / effort`

### Action Categories

Group actions into:

1. **Inner Loop Improvements**
   - DevContainer parity
   - Test infrastructure
   - Faster feedback cycles

2. **Instrumentation**
   - Decision logging
   - Agent trace collection
   - Test result artifacts

3. **Process**
   - Escalation policies
   - Scope boundary templates
   - Review checklists

4. **Agent Behavior**
   - Prompt templates
   - Stop conditions
   - Scope budgets

### Output Limits

**Important**: Keep action items focused:
- Maximum 2 "must do" items
- Maximum 3 "next sprint" items
- Remaining go to backlog

This prevents retrospective fatigue and ensures follow-through.

**Phase 5 Success**:
```
✅ Phase 5 Complete: Actions prioritized

   Must Do: 2 items
   Next Sprint: 3 items
   Backlog: 4 items
```

---

## Workflow Complete

Display final summary:

```
================================================================================
AGENTIC RETROSPECTIVE COMPLETE
================================================================================

Sprint: sprint-42 (2024-01-01 to 2024-01-15)
Data Completeness: 60% (3/5 sources)

Overall Health: GOOD (with gaps)

Scores:
├── Delivery Predictability: 4/5 ⭐⭐⭐⭐
├── Test Loop Completeness: 3/5 ⭐⭐⭐
├── Quality/Maintainability: 3/5 ⭐⭐⭐
├── Security Posture: N/A (no data)
├── Collaboration Efficiency: 4/5 ⭐⭐⭐⭐
└── Decision Hygiene: N/A (no data)

Top Findings:
1. Scope drift detected in 3 commits
2. Decision logs not configured (telemetry gap)

Must-Do Actions:
1. Set up decision logging → .logs/decisions/
2. Add explicit scope boundaries to task descriptions

Reports generated:
- docs/retro/sprint-42/retro.md (full report)
- docs/retro/sprint-42/retro.json (machine-readable)

Next Steps:
1. Review retro.md with your team
2. Assign owners to action items
3. Track action completion next sprint
================================================================================
```

---

## Graceful Degradation Summary

When data is missing, the skill:

| Scenario | Behavior |
|----------|----------|
| No git history | ❌ Fatal error - cannot run |
| No decision logs | ⚠️ Skip decision analysis, recommend instrumentation |
| No agent logs | ⚠️ Skip collaboration analysis, provide general guidance |
| No CI/test data | ℹ️ Skip inner loop metrics, note limitation |
| Partial data | 📊 Adjust confidence scores, highlight gaps |

The skill **always produces output** with available data and **clearly documents** what's missing.

---

## Help Text

**Command**: `/retro [options]`

**Purpose**: Generate evidence-based sprint retrospective analyzing human-agent collaboration, code quality, and improvement opportunities.

**Options**:
- `--from <ref>` - Git ref for sprint start: commit hash, tag, branch, or relative ref (default: 2 weeks ago)
- `--to <ref>` - Git ref for sprint end: commit hash, tag, branch, or relative ref (default: HEAD)
- `--sprint <id>` - Sprint identifier for report naming
- `--decisions <path>` - Path to decision logs (default: .logs/decisions)
- `--output <dir>` - Output directory (default: docs/retro)

**Supported Git Refs**:
- Commit hash (full): `a1b2c3d4e5f6...`
- Commit hash (short): `a1b2c3d`
- Tags: `v1.0.0`, `release-2024-01`
- Branches: `main`, `feature/auth`
- Relative refs: `HEAD~50`, `main~10`

**Examples**:
```bash
# Run with defaults (last 2 weeks)
/retro

# Between tags
/retro --from v1.0.0 --to v1.1.0

# From commit hash to HEAD
/retro --from a1b2c3d --to HEAD

# Between two commit hashes
/retro --from abc123 --to def456

# Last 100 commits
/retro --from HEAD~100 --to HEAD

# Named sprint
/retro --sprint sprint-42

# Tag with named sprint
/retro --from v1.0.0 --sprint release-1.1

# Custom output directory
/retro --output reports/retro
```

**Output Files**:
- `retro.md` - Human-readable retrospective report
- `retro.json` - Machine-readable findings and scores
- `evidence_map.json` - Artifact traceability
- `alerts.json` - High-priority follow-ups

**Data Sources** (in priority order):
1. Git history (required)
2. Decision logs (`.logs/decisions/*.jsonl`)
3. Agent logs (`.logs/agents/`)
4. CI results (auto-detected)
5. Test results (auto-detected)

**See Also**:
- `skills/retro/README.md` - Full documentation
- `skills/retro/schemas/decision-schema.json` - Decision log format

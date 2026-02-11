# Rebuild Plan Gap Analysis

> Comparing `RETROSPECTIVE_PLUGIN_IMPROVEMENTS.md` requirements against `rebuild-plan.md`
>
> **Last Updated**: 2026-02-11
> **Iterations**: 9 (complete)
> **Verification**: Code checked against actual implementation

---

## TL;DR - Quick Summary

### Verified Missing Features (Confirmed via Code Inspection)

| # | Feature | Priority | File to Modify |
|---|---------|----------|----------------|
| 1 | Commit Type Breakdown (feat/fix/docs/test/refactor/chore) | P0 | git.ts |
| 2 | PR Supersession Tracking (% PRs replaced) | P0 | github.ts |
| 3 | Testing Discipline Analysis (% decisions mentioning tests) | P0 | decisions.ts or new file |
| 4 | What Worked / What Didn't Section (with thresholds) | P0 | generator.ts |
| 5 | Decision Quality Score (% with rationale AND context) | P0 | decisions.ts |
| 6 | Reactive/Proactive Work Ratio | P1 | git.ts |
| 7 | PR Test File Detection (PRs including test files) | P1 | github.ts |
| 8 | Executive Summary Extension (10+ metrics) | P1 | generator.ts |
| 9 | Checkpoint Commit Detection | P1 | git.ts |
| 10 | Recommendation Format (current→target→action) | P1 | generator.ts |
| 11 | Mistakes & Corrections Section | P2 | generator.ts |
| 12 | PRs with Negative Reviews | P2 | github.ts |
| 13 | Clarification Request Counting | P2 | human-insights.ts |
| 14 | Documentation (SKILL.md, README.md) | P2 | docs |
| 15 | CI Failure Rate | P3 | new analyzer |
| 16 | Commit Cadence Analysis | P3 | git.ts |
| 17 | PR Scope Creep (lines per PR) | P3 | github.ts |
| 18 | PRs Merged Count in Summary | P1 | generator.ts |

### Gap Count by Priority

| Priority | Count |
|----------|-------|
| P0 (Critical) | 5 |
| P1 (Important) | 6 |
| P2 (Enhancement) | 4 |
| P3 (Optional) | 3 |
| **Total** | **18** |

---

## Implementation Order & Dependencies

### Dependency Graph

```
                    ┌─────────────────────────────────────────┐
                    │          PHASE 1 EXTENSIONS             │
                    └─────────────────────────────────────────┘
                                      │
         ┌────────────────────────────┼────────────────────────────┐
         │                            │                            │
         ▼                            ▼                            ▼
┌─────────────────┐        ┌─────────────────┐        ┌─────────────────┐
│ 1.1a Commit     │        │ 1.2a Decision   │        │ 1.5 Testing     │
│ Classification  │        │ Quality Score   │        │ Discipline      │
│                 │        │                 │        │                 │
│ - Commit types  │        │ - % with both   │        │ - % mentioning  │
│ - Checkpoint    │        │   rationale +   │        │   testing       │
│ - Reactive/     │        │   context       │        │ - Patterns      │
│   Proactive     │        │                 │        │                 │
└────────┬────────┘        └────────┬────────┘        └────────┬────────┘
         │                          │                          │
         │                          │                          │
         │                          ▼                          │
         │                 ┌─────────────────┐                 │
         │                 │ PHASE 3 EXT     │                 │
         │                 └─────────────────┘                 │
         │                          │                          │
         │                          ▼                          │
         │                 ┌─────────────────┐                 │
         │                 │ 3.3a PR         │                 │
         │                 │ Supersession    │                 │
         │                 │                 │                 │
         │                 │ - Supersession  │                 │
         │                 │   chains        │                 │
         │                 │ - Test files    │                 │
         │                 │ - Neg reviews   │                 │
         │                 └────────┬────────┘                 │
         │                          │                          │
         └──────────────────────────┼──────────────────────────┘
                                    │
                                    ▼
                    ┌─────────────────────────────────────────┐
                    │          PHASE 5.0 REPORT FORMAT        │
                    │                                         │
                    │ DEPENDS ON ALL ABOVE:                   │
                    │ - Executive Summary (needs all metrics) │
                    │ - What Worked/Didn't (needs all scores) │
                    │ - Mistakes Section (needs decisions)    │
                    │ - Recommendation Format                 │
                    └─────────────────────────────────────────┘
                                    │
                                    ▼
                    ┌─────────────────────────────────────────┐
                    │          PHASE 5.1-5.3 TESTS            │
                    │                                         │
                    │ - Integration tests                     │
                    │ - Snapshot tests                        │
                    │ - Self-validation                       │
                    └─────────────────────────────────────────┘
                                    │
                                    ▼
                    ┌─────────────────────────────────────────┐
                    │          PHASE 6 DOCUMENTATION          │
                    └─────────────────────────────────────────┘
```

### Ordered Task List with Dependencies

| Order | Task | Depends On | Blocks |
|-------|------|------------|--------|
| 1 | 1.1a Commit Classification | 1.1 (done) | 5.0 |
| 2 | 1.2a Decision Quality Score | 1.2 (done) | 1.5, 5.0 |
| 3 | 1.5 Testing Discipline | 1.2a | 5.0 |
| 4 | 3.3a PR Supersession/Tests | 3.3 (done) | 5.0 |
| 5 | 5.0 Report Format | 1.1a, 1.2a, 1.5, 3.3a | 5.1 |
| 6 | 5.1 Integration Tests | 5.0 | 5.2 |
| 7 | 5.2 Snapshot Tests | 5.1 | 5.3 |
| 8 | 5.3 Self-Validation | 5.2 | 6.1 |
| 9 | 6.1 SKILL.md | 5.3 | - |
| 10 | 6.2 README.md | 5.3 | - |

### Parallelization Opportunities

These can run in parallel (no dependencies between them):

**Parallel Group A** (after Phase 1-3 done):
- 1.1a Commit Classification
- 1.2a Decision Quality Score
- 3.3a PR Supersession/Tests

**Parallel Group B** (after 1.2a):
- 1.5 Testing Discipline

**Parallel Group C** (after 5.3):
- 6.1 SKILL.md
- 6.2 README.md

### Critical Path

```
1.2a Decision Quality Score
         │
         ▼
1.5 Testing Discipline
         │
         ▼
5.0 Report Format (BOTTLENECK - waits for all Phase 1/3 extensions)
         │
         ▼
5.1 → 5.2 → 5.3 → 6.x
```

### P0 Gaps in Dependency Order

| # | Gap | Must Complete Before |
|---|-----|---------------------|
| 1 | Commit Type Breakdown | 5.0 Report Format |
| 2 | Decision Quality Score | 1.5 Testing Discipline, 5.0 Report Format |
| 3 | Testing Discipline | 5.0 Report Format |
| 4 | PR Supersession | 5.0 Report Format |
| 5 | What Worked/Didn't | 5.1 Integration Tests |

---

## Detailed Analysis

## Iteration 1: Initial Gap Identification

### CRITICAL GAPS (Must Have)

#### 1. Commit Type Breakdown Missing
**IMPROVEMENTS.md requires:**
> "Breakdown by type: feat/fix/docs/test/refactor/chore"
> Example: "59.7% are FIXES (227/380)", "Only 1.6% test commits (6/380)"

**rebuild-plan.md status:** Only mentions hotspots and file distribution. No commit type categorization.

**Action:** Add commit type categorization to Phase 1.1 (GitAnalyzer)

---

#### 2. Checkpoint Commits Not Tracked
**IMPROVEMENTS.md requires:**
> "Count checkpoint commits"
> "0 checkpoint commits" as a key finding

**rebuild-plan.md status:** Not mentioned anywhere.

**Action:** Add checkpoint commit detection (commits with "checkpoint", "wip", "save" patterns)

---

#### 3. Reactive vs Proactive Classification Missing
**IMPROVEMENTS.md requires:**
> "Identify reactive vs proactive work"
> Shows: fixes = reactive, features = proactive

**rebuild-plan.md status:** Has rework detection but no explicit reactive/proactive classification.

**Action:** Add reactive/proactive ratio to Git analysis output

---

#### 4. PR Supersession Tracking Missing
**IMPROVEMENTS.md requires:**
> "Calculate rework rate (% PRs superseded)"
> "Track which PRs superseded which (parse PR bodies)"
> "PR #433 went through 7 iterations (v1-v7)"

**rebuild-plan.md status:** Phase 3.3 focuses on review cycles, not supersession chains.

**Action:** Add PR supersession parsing to GitHubAnalyzer

---

#### 5. PRs with Test Files Not Tracked
**IMPROVEMENTS.md requires:**
> "Count PRs with test files (check `files` array for test/spec)"
> "PRs with Tests: 11/20 (55.0%)"

**rebuild-plan.md status:** Not mentioned.

**Action:** Add test file detection in PR analysis

---

#### 6. Testing Loop Discipline Section Missing
**IMPROVEMENTS.md requires:**
> "Calculate % of decisions that mention testing"
> "Identify patterns: 'test passed', 'test failed', 'ran tests'"
> "Testing Loop Adherence: 2.0%"

**rebuild-plan.md status:** No dedicated testing discipline analyzer.

**Action:** Add TestingDisciplineAnalyzer or extend DecisionAnalyzer

---

#### 7. Decision Quality Score Formula Not Explicit
**IMPROVEMENTS.md requires:**
> "Decision Quality Score: (decisions with both rationale + context / total) * 100"

**rebuild-plan.md status:** Mentions decision maps but not this specific formula.

**Action:** Add explicit quality score calculation to DecisionAnalyzer

---

#### 8. "What Worked / What Didn't" Section Missing
**IMPROVEMENTS.md requires:**
> "Use thresholds: >70% good, <50% bad"
> Concrete section with threshold-based assessments

**rebuild-plan.md status:** Sample report shows findings but no explicit "What Worked/Didn't" section.

**Action:** Add dedicated section with threshold logic to report generator

---

### MEDIUM GAPS (Should Have)

#### 9. Clarification Request Counting
**IMPROVEMENTS.md requires:**
> "Count clarification requests (indicates misunderstanding)"

**rebuild-plan.md status:** Prompt quality analysis mentions ambiguity but not clarification counting.

**Action:** Add clarification detection to prompt analysis

---

#### 10. PRs with Negative Reviews
**IMPROVEMENTS.md requires:**
> "Identify PRs with negative reviews"

**rebuild-plan.md status:** Mentions review cycles but not specifically `requested_changes` tracking.

**Action:** Add negative review detection to GitHubAnalyzer

---

#### 11. Executive Summary Table Format
**IMPROVEMENTS.md shows specific format:**
```
| Metric | Value |
|--------|-------|
| Total Commits | 380 |
| Total PRs | 20 |
| PRs Merged | 3 |
| **PRs Superseded (Rework)** | **15 (75.0%)** |
```

**rebuild-plan.md status:** Has scoring table but not this executive summary format.

**Action:** Add executive summary table generation

---

### LOW PRIORITY GAPS (Nice to Have)

#### 12. CI Failure Rate
**IMPROVEMENTS.md suggests:**
> "CI failure rate (from gh workflow data)"

**rebuild-plan.md status:** Not mentioned.

**Action:** Consider adding `gh run list` parsing

---

#### 13. Commit Cadence Analysis
**IMPROVEMENTS.md suggests:**
> "Time between commits (cadence analysis)"

**rebuild-plan.md status:** Not mentioned.

**Action:** Consider adding commit timing analysis

---

#### 14. PR Scope Creep (Lines per PR)
**IMPROVEMENTS.md suggests:**
> "Lines changed per PR (scope creep)"

**rebuild-plan.md status:** Not explicitly tracked.

**Action:** Consider adding PR size analysis

---

#### 15. Documentation Updates
**IMPROVEMENTS.md requires:**
> "Update SKILL.md"
> "Add to Plugin README"

**rebuild-plan.md status:** No documentation tasks mentioned.

**Action:** Add Phase 6 for documentation

---

## Gap Summary (Iteration 1)

| Priority | Count | Status |
|----------|-------|--------|
| CRITICAL | 8 | Missing from plan |
| MEDIUM | 3 | Partially addressed |
| LOW | 4 | Not in plan |

**Total Gaps: 15**

---

## Iteration 2: Cross-Reference Verification

Let me verify each gap against the actual rebuild-plan.md content more carefully...

### Re-checking Gap #1: Commit Type Breakdown
Looking at Phase 1.1 in rebuild-plan.md:
- Shows "Code Hotspots" section with file churn
- Shows "File Distribution" by extension
- **Does NOT show commit type (feat/fix/docs/test) breakdown**

**CONFIRMED GAP** ✗

### Re-checking Gap #2: Checkpoint Commits
Searching rebuild-plan.md for "checkpoint"...
- Not found

**CONFIRMED GAP** ✗

### Re-checking Gap #3: Reactive vs Proactive
Searching rebuild-plan.md for "reactive" or "proactive"...
- Not found

**CONFIRMED GAP** ✗

### Re-checking Gap #4: PR Supersession
Phase 3.3 says:
> "detectBottlenecks(): slowPRs, highRevisionPRs, bottleneckAuthors"

This tracks revision cycles but NOT supersession (PR A replaced by PR B).

**CONFIRMED GAP** ✗

### Re-checking Gap #5: PRs with Test Files
Phase 3.3 lists:
- reviewCount, commentCount, commits
- slowPRs, highRevisionPRs, bottleneckAuthors

No mention of test file detection in PRs.

**CONFIRMED GAP** ✗

### Re-checking Gap #6: Testing Discipline
Searching for "testing discipline" or "test adherence"...
- Phase 4.3 Prompt Quality mentions correlating with outcomes
- No dedicated testing discipline analysis

**CONFIRMED GAP** ✗

### Re-checking Gap #7: Decision Quality Score
Phase 1.2 shows:
- byCategory, byActor, byType breakdowns
- No explicit "% with rationale AND context" formula

**CONFIRMED GAP** ✗

### Re-checking Gap #8: What Worked/Didn't Section
Sample report structure shows:
- Code Hotspots, Decisions Analysis, Tool Performance, Rework Analysis, Prompt Quality
- No "What Worked / What Didn't" section with thresholds

**CONFIRMED GAP** ✗

---

## Iteration 3: Proposed Additions to rebuild-plan.md

### Addition A: Commit Type Analysis (Insert into Phase 1.1)

```markdown
#### 1.1a Commit Type Breakdown (NEW)

**Modify**: `src/analyzers/git.ts`

**Changes**:
1. Add `categorizeCommit(message: string): CommitType` method
2. Categories: feat, fix, docs, test, refactor, chore, other
3. Detection patterns:
   - feat: "feat:", "add", "implement", "new"
   - fix: "fix:", "bug", "patch", "resolve"
   - docs: "docs:", "readme", "documentation"
   - test: "test:", "spec", "coverage"
   - refactor: "refactor:", "refact", "restructure"
   - chore: "chore:", "build", "ci", "deps"
4. Add to report: "Commit Type Breakdown" table
5. Calculate: reactive_ratio = (fix + refactor) / total

**Test**: `test/unit/analyzers/git.test.ts`
- Categorizes "fix: bug in auth" as fix
- Categorizes "feat: add login" as feat
- Handles mixed patterns

**Metrics Output**:
| Type | Count | % |
|------|-------|---|
| feat | 41 | 10.8% |
| fix | 227 | 59.7% |
| test | 6 | 1.6% |
```

---

### Addition B: Checkpoint Commit Detection (Insert into Phase 1.1)

```markdown
#### 1.1b Checkpoint Commit Detection (NEW)

**Modify**: `src/analyzers/git.ts`

**Changes**:
1. Add `isCheckpointCommit(message: string): boolean`
2. Patterns: "wip", "checkpoint", "save", "tmp", "temp", "backup"
3. Track checkpoint_count in GitAnalysisResult
4. Flag in report: "Checkpoint commits: X (indicates incremental saving)"

**Test**: `test/unit/analyzers/git.test.ts`
- Detects "wip: saving progress"
- Detects "checkpoint before refactor"
- Does NOT flag "fix: save button"
```

---

### Addition C: Reactive vs Proactive Ratio (Insert into Phase 1.1)

```markdown
#### 1.1c Reactive/Proactive Classification (NEW)

**Modify**: `src/analyzers/git.ts`, `src/types.ts`

**Changes**:
1. Classify commits:
   - Proactive: feat, docs, test (adding value)
   - Reactive: fix, refactor, chore (responding to issues)
2. Add to GitAnalysisResult:
   ```typescript
   workClassification: {
     proactive: number;
     reactive: number;
     ratio: number; // proactive / total
   }
   ```
3. Add finding if reactive > 60%: "High reactive work ratio indicates quality issues"

**Metrics Output**:
- Proactive: 47 commits (12.4%)
- Reactive: 333 commits (87.6%)
- **Finding**: "87.6% reactive work - investigate root cause quality"
```

---

### Addition D: PR Supersession Analysis (Insert into Phase 3.3)

```markdown
#### 3.3a PR Supersession Tracking (NEW)

**Modify**: `src/analyzers/github.ts`

**Changes**:
1. Parse PR bodies for supersession patterns:
   - "Supersedes #X"
   - "Replaces #X"
   - "Closes #X" where #X is another PR
   - Version patterns: "v2", "v3", etc. in title
2. Build supersession chains:
   ```typescript
   interface SupersessionChain {
     finalPR: number;
     supersededPRs: number[];
     iterations: number;
   }
   ```
3. Calculate: supersession_rate = superseded_count / total_prs
4. Add CRITICAL finding if supersession_rate > 50%

**Test**: `test/unit/analyzers/github.test.ts`
- Detects "Supersedes #123" pattern
- Builds chain: #123 → #124 → #125
- Calculates 75% supersession rate from fixture

**Metrics Output**:
| Metric | Value |
|--------|-------|
| PRs Superseded | 15 (75%) |
| Longest Chain | PR #433 (7 iterations) |
```

---

### Addition E: PR Test File Detection (Insert into Phase 3.3)

```markdown
#### 3.3b PR Test File Detection (NEW)

**Modify**: `src/analyzers/github.ts`

**Changes**:
1. Check PR files for test patterns:
   - `*.test.ts`, `*.spec.ts`
   - `test/`, `__tests__/`, `spec/`
2. Track: prs_with_tests, prs_without_tests
3. Calculate: test_coverage_rate = prs_with_tests / total_prs
4. Add WARNING if test_coverage_rate < 50%

**Metrics Output**:
- PRs with Tests: 11/20 (55.0%)
```

---

### Addition F: Testing Discipline Analysis (NEW Phase 1.5)

```markdown
#### 1.5 Testing Discipline Analysis (NEW)

**Create**: `src/analyzers/testing-discipline.ts`

**Implementation**:
```typescript
interface TestingDisciplineResult {
  decisionsWithTesting: number;
  totalDecisions: number;
  adherenceRate: number;
  testingPatterns: {
    pattern: string;  // "test passed", "ran tests"
    count: number;
  }[];
  decisionsWithoutTesting: DecisionRecord[];
}

class TestingDisciplineAnalyzer {
  analyze(decisions: DecisionRecord[]): TestingDisciplineResult {
    // Scan decision text for testing mentions
    // Patterns: "test", "spec", "passed", "failed", "coverage"
  }
}
```

**Report Section**:
```markdown
## Testing Loop Discipline

| Metric | Value | Target |
|--------|-------|--------|
| Adherence Rate | 2.0% | >80% |
| Decisions Mentioning Tests | 1/50 | - |

**Finding**: Agent is NOT testing before push (2% adherence)
```

**Dependencies**: 1.2 (needs DecisionAnalyzer data)
```

---

### Addition G: Decision Quality Score (Insert into Phase 1.2)

```markdown
#### 1.2a Decision Quality Score (NEW)

**Modify**: `src/analyzers/decisions.ts`

**Changes**:
1. Calculate quality metrics:
   ```typescript
   interface DecisionQualityMetrics {
     withRationale: number;
     withContext: number;
     withBoth: number;  // Quality score denominator
     total: number;
     qualityScore: number;  // withBoth / total * 100
   }
   ```
2. Add to report: "Decision Quality Score: 78.0%"
3. Add finding if qualityScore < 50%

**Formula**: `qualityScore = (decisions with BOTH rationale AND context) / total * 100`
```

---

### Addition H: What Worked/Didn't Section (Insert into Phase 5)

```markdown
#### 5.0 "What Worked / What Didn't" Section (NEW)

**Modify**: `src/report/generator.ts`

**Implementation**:
```typescript
interface WorkedDidntSection {
  worked: Array<{
    metric: string;
    value: number;
    threshold: number;
    evidence: string[];
  }>;
  didnt: Array<{
    metric: string;
    value: number;
    threshold: number;
    evidence: string[];
    recommendation: string;
  }>;
}

function generateWorkedDidnt(data: CollectedData): WorkedDidntSection {
  // Apply thresholds:
  // >70% = WORKED
  // <50% = DIDN'T WORK
  // 50-70% = NEEDS ATTENTION
}
```

**Report Output**:
```markdown
## What Worked ✅

| Metric | Value | Why It Worked |
|--------|-------|---------------|
| Decision Quality | 78% | >70% threshold met |
| PR Test Coverage | 55% | Majority of PRs include tests |

## What Didn't Work ❌

| Metric | Value | Issue | Recommendation |
|--------|-------|-------|----------------|
| Testing Discipline | 2% | <50% threshold | Log test results in decisions |
| Supersession Rate | 75% | >50% indicates churn | Improve initial PR quality |
```
```

---

### Addition I: Executive Summary Table (Insert into Phase 5)

```markdown
#### 5.0a Executive Summary Format (NEW)

**Modify**: `src/report/generator.ts`

**Changes**:
1. Add executive summary as first section:
   ```markdown
   ## Executive Summary

   | Metric | Value |
   |--------|-------|
   | Total Commits | 380 |
   | Total PRs | 20 |
   | PRs Merged | 3 |
   | **PRs Superseded (Rework)** | **15 (75.0%)** |
   | PRs with Tests | 11/20 (55.0%) |
   | **Testing Loop Adherence** | **2.0%** |
   | Decision Quality Score | 78.0% |
   | Reactive Work Ratio | 87.6% |
   | Agent Commits | 45 (11.8%) |
   ```
2. Bold metrics that are outside acceptable range
3. Link each metric to detailed section
```

---

### Addition J: Documentation Phase (NEW Phase 6)

```markdown
### Phase 6: Documentation

#### 6.1 Update SKILL.md

**Modify**: `SKILL.md`

**Changes**:
1. Document that tool provides objective, evidence-based analysis
2. List all metrics calculated
3. Show example output sections
4. Document dependencies (git, gh CLI)

#### 6.2 Update README.md

**Modify**: `README.md`

**Changes**:
1. Explain what makes a good retrospective
2. Show before/after examples
3. Emphasize "no AI slop, objective metrics only"
4. Document all CLI commands and flags
```

---

## Iteration 4: Priority Ordering

Based on IMPROVEMENTS.md requirements, here's the priority order:

### P0 - Core Requirements (BLOCKING)
1. **Commit Type Breakdown** - Core git analysis
2. **PR Supersession Tracking** - Key rework metric
3. **Testing Discipline Analysis** - Critical quality metric
4. **Decision Quality Score** - Core formula from requirements
5. **What Worked/Didn't Section** - Required output format

### P1 - Important Metrics
6. **Reactive/Proactive Classification** - Quality indicator
7. **PR Test File Detection** - Quality indicator
8. **Executive Summary Table** - Output format
9. **Checkpoint Commits** - Process indicator

### P2 - Enhancements
10. **PRs with Negative Reviews** - Review quality
11. **Clarification Request Counting** - Prompt quality
12. **Documentation Updates** - Maintenance

### P3 - Nice to Have
13. **CI Failure Rate** - Extended metrics
14. **Commit Cadence** - Extended metrics
15. **PR Scope Creep** - Extended metrics

---

## Iteration 5: Final Recommendations

### Required Changes to rebuild-plan.md

1. **Extend Phase 1.1** with:
   - Commit type categorization (feat/fix/docs/test/refactor/chore)
   - Checkpoint commit detection
   - Reactive/proactive work ratio

2. **Extend Phase 1.2** with:
   - Decision quality score formula (% with both rationale AND context)

3. **Add Phase 1.5**: Testing Discipline Analysis
   - New analyzer for testing mentions in decisions
   - Adherence rate calculation

4. **Extend Phase 3.3** with:
   - PR supersession chain tracking
   - PR test file detection
   - Negative review tracking

5. **Add to Phase 5** (before 5.1):
   - Executive Summary table format
   - "What Worked / What Didn't" section with thresholds

6. **Add Phase 6**: Documentation
   - SKILL.md updates
   - README.md updates

### Updated Dependency Graph

```
Phase 0: Foundation (unchanged)
├── 0.1 → 0.2 → 0.3

Phase 1: Surface Data (EXTENDED)
├── 1.1 Git Hotspots + Commit Types + Checkpoint + Reactive/Proactive
├── 1.2 Decision Maps + Quality Score
├── 1.3 Wire Orphaned Methods (unchanged)
├── 1.4 Tool Metrics (unchanged)
├── 1.5 Testing Discipline Analysis (NEW) ← depends on 1.2

Phase 2: Populate Fields (unchanged)
├── 2.1 Agent Commit Detection
├── 2.2 Risk Analysis

Phase 3: Missing Analyzers (EXTENDED)
├── 3.1 Decision Thrash (unchanged)
├── 3.2 Security Scanning (unchanged)
├── 3.3 PR Review Metrics + Supersession + Test Files + Negative Reviews

Phase 4: New Features (unchanged)
├── 4.1 Micro-Retro Command
├── 4.2 Rework Detection
├── 4.3 Prompt Quality

Phase 5: Integration (EXTENDED)
├── 5.0 Executive Summary + What Worked/Didn't (NEW) ← before 5.1
├── 5.1 Integration Tests
├── 5.2 Snapshot Tests
├── 5.3 Self-Validation

Phase 6: Documentation (NEW)
├── 6.1 SKILL.md
├── 6.2 README.md
```

---

## Final Gap Count

| Category | Original Gaps | After Analysis |
|----------|---------------|----------------|
| Critical | 8 | 5 (consolidated) |
| Medium | 3 | 4 (added negative reviews) |
| Low | 4 | 3 |
| **Total** | **15** | **12 actionable items** |

---

## Action Items for Plan Update

- [ ] Add commit type categorization to Phase 1.1
- [ ] Add checkpoint commit detection to Phase 1.1
- [ ] Add reactive/proactive ratio to Phase 1.1
- [ ] Add decision quality score to Phase 1.2
- [ ] Create Phase 1.5 Testing Discipline Analysis
- [ ] Add PR supersession tracking to Phase 3.3
- [ ] Add PR test file detection to Phase 3.3
- [ ] Add negative review tracking to Phase 3.3
- [ ] Add Executive Summary format to Phase 5
- [ ] Add "What Worked/Didn't" section to Phase 5
- [ ] Create Phase 6 Documentation
- [ ] Update dependency graph

---

## Iteration 6: Deep Dive on Overlooked Items

Re-reading IMPROVEMENTS.md "Real Output After Fix" section reveals additional gaps:

### Gap 16: "Mistakes & Corrections" Section
**IMPROVEMENTS.md expected sections:**
> "Mistakes & Corrections"

**rebuild-plan.md status:** DecisionAnalyzer mentions parsing mistakes but no dedicated report section.

**Action:** Add "Mistakes & Corrections" section to report generator

```markdown
## Mistakes & Corrections

| Decision | Mistake | Correction | Time to Correct |
|----------|---------|------------|-----------------|
| dec-003 | Chose SQLite for multi-user | Migrated to Postgres | 3 days |
| dec-007 | Skipped auth checks | Added middleware | 1 day |
```

---

### Gap 17: Recommendation Format (Current → Target → Action)
**IMPROVEMENTS.md requires:**
> - Current: "2% testing discipline"
> - Target: "90% testing discipline"
> - Action: "Log test results in decision log, use checkpoint commits"

**rebuild-plan.md status:** Has recommendations but format not explicitly current→target→action.

**Action:** Standardize recommendation format

```markdown
## Recommendations

| Area | Current | Target | Action |
|------|---------|--------|--------|
| Testing Discipline | 2% | 90% | Log test results in decision log |
| Supersession Rate | 75% | <20% | Review PR scope before submission |
```

---

### Gap 18: PRs Merged Count
**IMPROVEMENTS.md shows:**
> "PRs Merged: 3"

**rebuild-plan.md status:** Tracks PRs but not explicit merged count in executive summary.

**Action:** Ensure executive summary includes merged count (already in GitHubAnalyzer, just surface it)

---

## Iteration 7: Cross-Check with Implementation Status

Per MEMORY.md, Phases 0-4 are complete with 139 tests. Verified against actual source code:

### Checking Implementation Status of Each Gap

| Gap | Plan Status | Implementation Status | Still Missing? |
|-----|-------------|----------------------|----------------|
| Commit Type Breakdown | Not in plan | **NOT in git.ts** | ✗ MISSING |
| Checkpoint Commits | Not in plan | **NOT in git.ts** | ✗ MISSING |
| Reactive/Proactive | Not in plan | **NOT in git.ts** | ✗ MISSING |
| PR Supersession | Not in plan | **NOT in github.ts** | ✗ MISSING |
| PR Test Files | Not in plan | **NOT in github.ts** | ✗ MISSING |
| Testing Discipline | Not in plan | **NOT in decisions.ts** | ✗ MISSING |
| Decision Quality Score | Not in plan | **NOT in decisions.ts** | ✗ MISSING |
| What Worked/Didn't | Not in plan | **NOT in generator.ts** | ✗ MISSING |
| Executive Summary | Not in plan | **PARTIAL - exists but incomplete** | ⚠️ NEEDS EXTENSION |
| Mistakes Section | Not in plan | **NOT in generator.ts** | ✗ MISSING |
| Recommendation Format | Implicit | Has recommendations but NOT current→target→action format | ⚠️ NEEDS UPDATE |

### Code Verification Details

**git.ts**: Grep for `categorize|commitType|checkpoint|reactive|proactive` → No matches

**github.ts**: Grep for `supersed|supersession|testFile|withTest` → No matches

**decisions.ts**: Grep for `qualityScore|withRationale|withContext|withBoth` → No matches

**generator.ts**:
- Executive Summary EXISTS (line 89) but only shows:
  - Commits, contributors, lines added/removed
  - Decisions logged
  - Delivery Predictability score
  - Quality/Maintainability score
  - Top 3 findings
  - Top recommendations
- MISSING from Executive Summary:
  - Total PRs / PRs Merged / PRs Superseded
  - Testing Loop Adherence %
  - Decision Quality Score
  - Reactive Work Ratio
  - Agent Commits %
- NO "What Worked / What Didn't" section
- NO "Mistakes & Corrections" section

**Conclusion**: All 15 core gaps are confirmed as REAL gaps in the implementation.

---

## Iteration 8: Risk Assessment

### High Risk Gaps (could cause "AI Slop" if missing)

| Gap | Risk if Missing | Mitigation Priority |
|-----|-----------------|---------------------|
| Commit Type Breakdown | Report lacks concrete git metrics | **P0** |
| PR Supersession | Key rework metric missing | **P0** |
| Testing Discipline | Critical quality metric missing | **P0** |
| What Worked/Didn't | No actionable summary | **P0** |

### Medium Risk Gaps

| Gap | Risk if Missing | Mitigation Priority |
|-----|-----------------|---------------------|
| Executive Summary | Poor first impression | **P1** |
| Decision Quality Score | Incomplete decision analysis | **P1** |
| Reactive/Proactive | Missing work classification | **P1** |

### Low Risk Gaps

| Gap | Risk if Missing | Mitigation Priority |
|-----|-----------------|---------------------|
| Checkpoint Commits | Minor process indicator | **P2** |
| Documentation | User confusion | **P2** |
| PR Test Files | Secondary quality metric | **P2** |

---

## Iteration 9: Consolidated Action Plan

### Phase 1 Extensions (REQUIRED)

```typescript
// Add to GitAnalyzer
interface CommitTypeBreakdown {
  feat: number;
  fix: number;
  docs: number;
  test: number;
  refactor: number;
  chore: number;
  other: number;
  checkpoint: number;
  reactive: number;   // fix + refactor + chore
  proactive: number;  // feat + docs + test
}

// Add to DecisionAnalyzer
interface DecisionQualityMetrics {
  withRationale: number;
  withContext: number;
  withBoth: number;
  qualityScore: number;  // withBoth / total * 100
}
```

### Phase 3 Extensions (REQUIRED)

```typescript
// Add to GitHubAnalyzer
interface PRSupersessionAnalysis {
  supersededPRs: number[];
  chains: SupersessionChain[];
  supersessionRate: number;
}

interface PRTestCoverage {
  prsWithTests: number;
  prsWithoutTests: number;
  coverageRate: number;
}
```

### Phase 5 Extensions (REQUIRED)

```typescript
// Add to ReportGenerator
interface ReportSections {
  executiveSummary: ExecutiveSummary;
  whatWorked: MetricAssessment[];
  whatDidnt: MetricAssessment[];
  mistakesAndCorrections: MistakeRecord[];
  recommendations: Recommendation[];  // current → target → action format
}
```

---

## Final Summary

### Total Gaps Identified: 18

| Priority | Count | Description |
|----------|-------|-------------|
| P0 (Critical) | 5 | Core metrics from IMPROVEMENTS.md |
| P1 (Important) | 6 | Report format and secondary metrics |
| P2 (Enhancement) | 4 | Nice-to-have metrics |
| P3 (Optional) | 3 | Extended features |

### Recommended Implementation Order

1. **Commit Type Breakdown** - Foundational metric
2. **PR Supersession** - Key rework indicator
3. **Testing Discipline** - Critical quality metric
4. **What Worked/Didn't** - Actionable output
5. **Executive Summary** - User-facing format
6. **Decision Quality Score** - Decision analysis
7. **Reactive/Proactive** - Work classification
8. **Recommendation Format** - Standardization
9. **Mistakes Section** - Decision tracking
10. Everything else

---

## Verification Checklist

After implementation, verify each gap is addressed:

- [ ] `pnpm run build` passes
- [ ] `pnpm test` passes (including new tests for gaps)
- [ ] Self-validation produces:
  - [ ] Commit type breakdown table
  - [ ] PR supersession rate
  - [ ] Testing discipline percentage
  - [ ] "What Worked" section
  - [ ] "What Didn't Work" section
  - [ ] Executive Summary table with 10+ metrics
  - [ ] Recommendations in current→target→action format
  - [ ] Mistakes & Corrections section (if any documented)

---

## Iteration 10: Addendum for rebuild-plan.md

The following sections should be added to `docs/rebuild-plan.md`:

### NEW: Phase 1.1a - Commit Classification (after 1.1)

```markdown
#### 1.1a Commit Type Classification

**Modify**: `src/analyzers/git.ts`, `src/types.ts`

**Changes**:
1. Add `CommitType` enum: feat, fix, docs, test, refactor, chore, other
2. Add `categorizeCommit(message: string): CommitType` function
3. Add `isCheckpointCommit(message: string): boolean` function
4. Add to `GitAnalysisResult`:
   ```typescript
   commitTypeBreakdown: {
     feat: number;
     fix: number;
     docs: number;
     test: number;
     refactor: number;
     chore: number;
     other: number;
   };
   checkpointCommits: number;
   workClassification: {
     proactive: number;  // feat + docs + test
     reactive: number;   // fix + refactor + chore
     ratio: number;      // proactive / total
   };
   ```
5. Add to report: "Commit Type Breakdown" table
6. Add finding if reactive > 60%

**Tests**: `test/unit/analyzers/git.test.ts`
- `categorizeCommit("feat: add login")` → feat
- `categorizeCommit("fix: auth bug")` → fix
- `isCheckpointCommit("wip: save progress")` → true
- `isCheckpointCommit("fix: save button")` → false

**Dependencies**: 1.1
```

### NEW: Phase 1.2a - Decision Quality Score (after 1.2)

```markdown
#### 1.2a Decision Quality Score

**Modify**: `src/analyzers/decisions.ts`

**Changes**:
1. Add `DecisionQualityMetrics` interface:
   ```typescript
   interface DecisionQualityMetrics {
     withRationale: number;
     withContext: number;
     withBoth: number;
     total: number;
     qualityScore: number;  // (withBoth / total) * 100
   }
   ```
2. Add `calculateQualityScore()` method
3. Add to report: "Decision Quality Score: X%"
4. Add WARNING if qualityScore < 50%

**Tests**: `test/unit/analyzers/decisions.test.ts`
- Score = 100% when all have rationale AND context
- Score = 0% when none have both
- Score = 50% when half have both

**Dependencies**: 1.2
```

### NEW: Phase 1.5 - Testing Discipline Analysis

```markdown
#### 1.5 Testing Discipline Analysis

**Create**: `src/analyzers/testing-discipline.ts`

**Implementation**:
```typescript
interface TestingDisciplineResult {
  decisionsWithTesting: number;
  totalDecisions: number;
  adherenceRate: number;  // (decisionsWithTesting / total) * 100
  testingPatterns: Array<{ pattern: string; count: number }>;
  decisionsWithoutTesting: DecisionRecord[];
}

export function analyzeTestingDiscipline(decisions: DecisionRecord[]): TestingDisciplineResult {
  const patterns = ['test', 'spec', 'passed', 'failed', 'coverage', 'assert', 'expect'];
  // Count decisions mentioning any testing pattern
}
```

**Report Section**:
```markdown
## Testing Loop Discipline

| Metric | Value | Target |
|--------|-------|--------|
| Adherence Rate | X% | >80% |
| Decisions Mentioning Tests | X/Y | - |

Patterns detected: "test passed" (5), "ran tests" (3)
```

**Tests**: `test/unit/analyzers/testing-discipline.test.ts`
- Returns 100% when all decisions mention testing
- Returns 0% when none mention testing
- Detects multiple patterns

**Dependencies**: 1.2
```

### NEW: Phase 3.3a - PR Supersession & Test Files (extend 3.3)

```markdown
#### 3.3a PR Supersession & Test File Detection

**Modify**: `src/analyzers/github.ts`

**Changes**:
1. Add supersession detection:
   ```typescript
   interface SupersessionAnalysis {
     supersededPRs: number[];
     chains: Array<{ finalPR: number; superseded: number[]; iterations: number }>;
     supersessionRate: number;  // superseded.length / total * 100
   }
   ```
2. Parse PR bodies for patterns: "Supersedes #X", "Replaces #X", "v2", "v3"
3. Add test file detection:
   ```typescript
   interface PRTestCoverage {
     prsWithTests: PRInfo[];
     prsWithoutTests: PRInfo[];
     coverageRate: number;  // withTests.length / total * 100
   }
   ```
4. Check PR files for: `*.test.ts`, `*.spec.ts`, `test/`, `__tests__/`
5. Add negative review tracking (state === 'CHANGES_REQUESTED')

**Report Output**:
```markdown
## PR Analysis

| Metric | Value |
|--------|-------|
| Total PRs | 20 |
| PRs Merged | 3 |
| PRs Superseded | 15 (75%) |
| PRs with Tests | 11/20 (55%) |
| PRs with Negative Reviews | 5 |
```

**Tests**: `test/unit/analyzers/github.test.ts`
- Detects "Supersedes #123" in PR body
- Detects test files in PR
- Calculates supersession rate

**Dependencies**: 3.3
```

### NEW: Phase 5.0 - Report Format Improvements (before 5.1)

```markdown
#### 5.0 Report Format Improvements

**Modify**: `src/report/generator.ts`

**Changes**:

1. **Executive Summary Extension**
   Add to executive summary table:
   - Total PRs / PRs Merged
   - PRs Superseded (Rework Rate)
   - PRs with Tests
   - Testing Loop Adherence
   - Decision Quality Score
   - Reactive Work Ratio
   - Agent Commits %

2. **What Worked / What Didn't Section**
   ```typescript
   interface WorkedDidntSection {
     worked: MetricAssessment[];   // metrics > 70%
     didnt: MetricAssessment[];    // metrics < 50%
     needsAttention: MetricAssessment[];  // 50-70%
   }
   ```
   Thresholds: >70% = WORKED, <50% = DIDN'T WORK

3. **Mistakes & Corrections Section**
   Extract from decisions where `mistake` or `correction` fields exist

4. **Recommendation Format**
   Change format to:
   ```markdown
   | Area | Current | Target | Action |
   |------|---------|--------|--------|
   | Testing | 2% | 90% | Log test results |
   ```

**Tests**: `test/unit/report/generator.test.ts`
- Executive summary has 10+ metrics
- What Worked section appears when metrics > 70%
- What Didn't section appears when metrics < 50%
- Recommendations use current→target→action format

**Dependencies**: All Phase 1-4
```

### NEW: Phase 6 - Documentation

```markdown
### Phase 6: Documentation

#### 6.1 SKILL.md

**Modify**: `SKILL.md`

Content:
- Tool purpose: evidence-based retrospectives
- All metrics calculated (list)
- Example output
- Dependencies: git, gh CLI

#### 6.2 README.md

**Modify**: `README.md`

Content:
- What makes a good retrospective
- Before/after examples
- "No AI slop, objective metrics only"
- All CLI commands and flags

**Dependencies**: All Phase 1-5
```

### Updated Dependency Graph (Final)

```
Phase 0: Foundation
├── 0.1 → 0.2 → 0.3

Phase 1: Surface Data (EXTENDED)
├── 1.1 Git Hotspots
│   └── 1.1a Commit Types + Checkpoint + Reactive/Proactive (NEW)
├── 1.2 Decision Maps
│   └── 1.2a Decision Quality Score (NEW)
├── 1.3 Wire Orphaned Methods
├── 1.4 Tool Metrics
└── 1.5 Testing Discipline Analysis (NEW)

Phase 2: Populate Fields (unchanged)
├── 2.1 Agent Commit Detection
├── 2.2 Risk Analysis

Phase 3: Missing Analyzers (EXTENDED)
├── 3.1 Decision Thrash
├── 3.2 Security Scanning
└── 3.3 PR Review Metrics
    └── 3.3a Supersession + Test Files + Negative Reviews (NEW)

Phase 4: New Features (unchanged)
├── 4.1 Micro-Retro Command
├── 4.2 Rework Detection
├── 4.3 Prompt Quality

Phase 5: Integration (EXTENDED)
├── 5.0 Report Format Improvements (NEW)
│   ├── Executive Summary Extension
│   ├── What Worked / What Didn't
│   ├── Mistakes & Corrections
│   └── Recommendation Format
├── 5.1 Integration Tests
├── 5.2 Snapshot Tests
└── 5.3 Self-Validation

Phase 6: Documentation (NEW)
├── 6.1 SKILL.md
└── 6.2 README.md
```

---

## Decision: Implement Now vs. Defer

Given Phases 0-4 are complete per MEMORY.md, recommend:

### Implement Now (Phase 5)
- P0 gaps are BLOCKING for "no AI slop" requirement
- Should be done before integration tests

### Defer to Future Sprint
- P2/P3 gaps (CI failure rate, cadence, scope creep)
- Documentation (Phase 6) - can follow after core features

### Implementation Sequence

**Must complete first (parallel)**:
1. 1.1a Commit Classification
2. 1.2a Decision Quality Score
3. 3.3a PR Supersession/Tests

**Then (sequential)**:
4. 1.5 Testing Discipline (needs 1.2a)
5. 5.0 Report Format (needs all above)

**Then (sequential)**:
6. 5.1 Integration Tests
7. 5.2 Snapshot Tests
8. 5.3 Self-Validation

**Finally (parallel)**:
9. 6.1 SKILL.md
10. 6.2 README.md

**Defer**:
- P2/P3 enhancements (CI failure rate, cadence, scope creep)

# Agentic Retrospective: Complete Rebuild Plan

> **Goal**: Transform AI slop into a genuinely useful, evidence-driven retrospective tool with closed testing loops.

---

## What Makes This NOT AI Slop

| AI Slop Pattern | This Plan's Fix |
|-----------------|-----------------|
| Generic findings without evidence | NOTHING CAN BE FAKE OR GENERIC, Every finding links to specific commit hash, file path, or decision ID |
| Hardcoded zeros and nulls | Detect agent commits, parse security scans, fetch real PR metrics |
| Data collected but hidden | Surface ALL computed data: hotspots, decision maps, tool metrics |
| No tests = no accountability | 60%+ coverage before any feature work; self-validation as final gate |
| Vague recommendations | Specific file paths, line numbers, exact changes needed |
| Claimed features that don't work | Wire orphaned methods, implement stubbed analyzers |

---

## Closed Testing Loop Strategy

**Principle**: No code is written without a test that validates it.

```
For each task:
1. Write failing test FIRST (defines expected behavior)
2. Implement minimum code to pass test
3. Run test to confirm pass
4. Run full suite to confirm no regressions
5. Manual validation with real data
```

**Validation Commands Per Phase**:
- Phase 0: `pnpm test` → tests run, coverage reported
- Phase 1-4: `pnpm run test:unit` → new tests pass
- Phase 5: `pnpm run validate` → lint + typecheck + all tests
- Final: `pnpm run test:e2e` → self-validation passes

---

## Current State Assessment

### What Exists But Is Broken

| Component | Status | Issue |
|-----------|--------|-------|
| GitAnalyzer | Collects data, doesn't surface | `hotspots`, `filesByExtension`, `files[]` computed but never reach report |
| DecisionAnalyzer | Has orphaned methods | `byCategory`, `byActor`, `byType` Maps unused; `getMissedEscalations()`, `getTrivialEscalations()`, `getDecisionThrash()` never called |
| ToolsAnalyzer | Computes but hides | `avgDuration`, `successRate`, `errors[]` computed but only `findings` strings passed to report |
| GitHubAnalyzer | Partially implemented | `reviewCount`, `commentCount`, `commits` hardcoded to 0; `labels[]` fetched but unused |
| Type fields | Defined but empty | `agent_contributors`, `agent_commits` hardcoded 0; `risk_level`, `risk_notes`, `reversibility_plan` never analyzed |
| Tests | Zero coverage | vitest configured, 3,603 lines of code, 0 tests |
| Security scoring | Stubbed | Always returns null |

### What's Completely Missing

- Micro-retro feedback collection command
- Token cost analysis
- Review bottleneck metrics (time-to-commit, revision cycles)
- Agent commit detection
- Decision thrash detection (TODO in code)
- Real PR review metrics from GitHub
- Closed testing loop

---

## Implementation Phases

### Phase 0: Test Infrastructure Foundation

**Objective**: Establish closed testing loop before any code changes.

#### 0.1 Vitest Configuration

**Create**: `vitest.config.ts`

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json'],
      exclude: ['test/**', 'dist/**'],
      thresholds: { lines: 60, branches: 50, functions: 60 }
    },
    testTimeout: 30000,
  },
});
```

**Validation**: `pnpm test` runs without error

**Dependencies**: None

---

#### 0.2 Test Fixtures Structure

**Create**: `test/fixtures/` directory

```
test/
├── fixtures/
│   ├── git/
│   │   ├── commits.ts          # MockCommit[] for various scenarios
│   │   └── scenarios.ts        # empty, single-author, multi-author, large-commits, scope-drift
│   ├── decisions/
│   │   ├── minimal.jsonl       # Single valid decision
│   │   ├── full.jsonl          # All fields populated
│   │   ├── one-way-doors.jsonl # All one-way-door decisions
│   │   ├── mixed-actors.jsonl  # Human, agent, system
│   │   └── malformed.jsonl     # Invalid JSON lines
│   ├── feedback/
│   │   ├── high-alignment.jsonl
│   │   └── low-alignment.jsonl
│   ├── tools/
│   │   ├── healthy.jsonl       # Low error rate
│   │   └── high-errors.jsonl   # >10% error rate
│   └── index.ts                # Fixture exports
├── helpers/
│   ├── git-mock.ts             # Mock git operations
│   ├── temp-dir.ts             # Temporary directory management
│   └── fixture-loader.ts       # JSONL loading utilities
└── setup.ts                    # Global test setup
```

**Fixture Data Specifications**:

| Fixture File | Records | Purpose |
|--------------|---------|---------|
| `decisions/minimal.jsonl` | 1 | Minimum valid: `{"ts":"...","decision":"..."}` |
| `decisions/full.jsonl` | 3 | All 20 fields populated, different categories |
| `decisions/one-way-doors.jsonl` | 5 | All one_way_door, mixed actors (3 human, 2 agent) |
| `decisions/mixed-actors.jsonl` | 6 | 2 human, 2 agent, 2 system |
| `decisions/malformed.jsonl` | 4 | 2 valid, 1 invalid JSON, 1 missing ts |
| `git/scenarios.ts` | 5 scenarios | empty(0), single(5), multi(15), large(8), drift(12) |
| `feedback/high-alignment.jsonl` | 5 | All alignment >= 4, rework=none |
| `feedback/low-alignment.jsonl` | 5 | All alignment <= 2, rework=significant |
| `tools/healthy.jsonl` | 20 | 95% success rate, avg 50ms |
| `tools/high-errors.jsonl` | 20 | 20% error rate, specific error messages |

**Validation**: Fixtures load without error in test setup

**Dependencies**: 0.1

---

#### 0.3 Unit Tests for Existing Analyzers

**Create**: Unit tests for each analyzer

| Test File | Tests | Validates |
|-----------|-------|-----------|
| `test/unit/analyzers/git.test.ts` | `analyze()` returns hotspots, filesByExtension, correct totals | GitAnalyzer data collection works |
| `test/unit/analyzers/decisions.test.ts` | `byCategory`, `byActor`, `byType` Maps populated; orphaned methods return correct data | DecisionAnalyzer methods work |
| `test/unit/analyzers/tools.test.ts` | `avgDuration`, `successRate`, `errors` computed correctly | ToolsAnalyzer calculations work |
| `test/unit/analyzers/human-insights.test.ts` | Pattern detection, feedback summary, fix-to-feature ratio | HumanInsightsAnalyzer works |
| `test/unit/scoring/rubrics.test.ts` | All 6 scoring functions return correct scores for edge cases | Scoring logic is correct |

**Specific Test Cases**:

```typescript
// test/unit/analyzers/git.test.ts
describe('GitAnalyzer', () => {
  test('analyze() returns hotspots for files changed 3+ times', async () => {
    // Fixture: multi-contributor scenario with file changed 5 times
    // Assert: hotspots array includes that file with changes: 5
  });

  test('analyze() groups files by extension correctly', async () => {
    // Fixture: commits touching .ts, .md, .json files
    // Assert: filesByExtension.get('.ts') === expected count
  });

  test('analyze() returns empty hotspots when no file changed 3+ times', async () => {
    // Fixture: single-contributor scenario (each file touched once)
    // Assert: hotspots.length === 0
  });

  test('analyze() handles empty commit range', async () => {
    // Fixture: empty-repo scenario
    // Assert: commits.length === 0, totals === 0
  });
});

// test/unit/analyzers/decisions.test.ts
describe('DecisionAnalyzer', () => {
  test('analyze() populates byCategory Map correctly', () => {
    // Fixture: full.jsonl with 3 categories
    // Assert: byCategory.get('architecture').length === expected
  });

  test('getMissedEscalations() returns agent one-way-doors', () => {
    // Fixture: one-way-doors.jsonl with 2 agent-made
    // Assert: result.length === 2, all have actor === 'agent'
  });

  test('getTrivialEscalations() returns human two-way-doors', () => {
    // Fixture: mixed-actors.jsonl
    // Assert: result includes two-way-doors by humans
  });

  test('handles malformed JSONL gracefully', () => {
    // Fixture: malformed.jsonl
    // Assert: valid records parsed, invalid skipped, no throw
  });
});

// test/unit/scoring/rubrics.test.ts
describe('Scoring Rubrics', () => {
  test('scoreDeliveryPredictability returns 5 for small commits', () => {
    // Input: avgCommitSize: 30, commitCount: 20
    // Assert: score === 5, confidence === 'high'
  });

  test('scoreDeliveryPredictability returns 1 for huge commits', () => {
    // Input: avgCommitSize: 600, commitCount: 5
    // Assert: score === 1
  });

  test('scoreDecisionHygiene returns 5 for 100% escalation', () => {
    // Input: oneWayDoorCount: 3, escalatedCount: 3
    // Assert: score === 5
  });

  test('scoreDecisionHygiene returns null when no decisions', () => {
    // Input: totalDecisions: 0
    // Assert: score === null, confidence === 'none'
  });
});
```

**Validation**: `pnpm run test:unit` passes with >60% coverage on tested files

**Dependencies**: 0.2

---

### Phase 1: Surface Collected Data (Quick Wins)

**Objective**: Data already collected must reach reports.

#### 1.1 Surface Git Hotspots and File Distribution

**Modify**:
- `src/runner.ts` lines 147-149, 716-725
- `src/types.ts`
- `src/report/generator.ts`

**Changes**:
1. Add `hotspots` and `filesByExtension` to `CollectedData` interface
2. Store `data.git.hotspots` and `data.git.filesByExtension` after GitAnalyzer call
3. Add `GitMetrics` to `RetroReport` type
4. Generate "Code Hotspots" section in report showing:
   - Top 10 files by change frequency
   - File extension distribution
   - Files with >3 changes flagged as potential concerns

**Test**: `test/unit/report/hotspots.test.ts`
- Hotspots appear in markdown output
- File extension breakdown is accurate

**Validation**: Run retro, verify hotspots section exists with real file paths

**Dependencies**: 0.3

---

#### 1.2 Surface Decision Maps

**Modify**:
- `src/runner.ts`
- `src/report/generator.ts`

**Changes**:
1. Pass `byCategory`, `byActor`, `byType` Maps through to report
2. Generate "Decisions by Category" breakdown:
   - architecture, security, api, data, deps, ux, delivery, process, other
3. Generate "Decisions by Actor" breakdown:
   - Count and % by human vs agent vs system
4. Generate "Decisions by Type" breakdown:
   - one_way_door vs two_way_door vs reversible

**Test**: `test/unit/report/decisions.test.ts`
- Category breakdown matches input data
- Actor percentages calculated correctly

**Validation**: Run retro, verify decision breakdown tables exist

**Dependencies**: 0.3

---

#### 1.3 Wire Orphaned Decision Methods

**Modify**:
- `src/runner.ts` (add calls to orphaned methods)
- `src/report/generator.ts` (render findings)

**Changes**:
1. Call `getMissedEscalations()` in collectData phase
2. Call `getTrivialEscalations()` in collectData phase
3. Add CRITICAL finding for each missed escalation (one-way-door by agent)
4. Add INFO finding for trivial escalations (two-way-door by human)
5. Display in "Decision Hygiene" section with specific decision IDs

**Test**: `test/unit/analyzers/decisions.test.ts`
- `getMissedEscalations()` returns correct records
- `getTrivialEscalations()` returns correct records

**Validation**: Create test decision with agent making one-way-door, verify CRITICAL finding appears

**Dependencies**: 1.2

---

#### 1.4 Surface Tool Performance Metrics

**Modify**:
- `src/runner.ts` lines 206-224
- `src/types.ts`
- `src/report/generator.ts`

**Changes**:
1. Add `ToolsSummary` interface to types.ts:
   ```typescript
   interface ToolsSummary {
     totalCalls: number;
     uniqueTools: number;
     byTool: Array<{
       tool: string;
       calls: number;
       avgDuration: number;
       successRate: number;
       errors: string[];
     }>;
     overallErrorRate: number;
   }
   ```
2. Store full `ToolsAnalysisResult` in CollectedData (not just findings)
3. Generate "Tool Usage" section showing:
   - Top 5 tools by usage with call counts
   - Average duration per tool
   - Success rate per tool
   - Top 3 error messages if error rate > 5%

**Test**: `test/unit/report/tools.test.ts`
- Tool table renders correctly
- Error rate calculation is accurate

**Validation**: Run retro, verify tool performance table exists

**Dependencies**: 0.3

---

### Phase 2: Populate Empty Type Fields

**Objective**: Stop hardcoding zeros and nulls.

#### 2.1 Implement Agent Commit Detection

**Modify**:
- `src/analyzers/git.ts` (add detection method)
- `src/runner.ts` lines 583-588 (use detection)

**Changes**:
1. Add `detectAgentCommits(commits: CommitInfo[]): CommitInfo[]` to GitAnalyzer
2. Detection patterns:
   - Email: `*@bot.*`, `*-bot@*`, `noreply@anthropic.com`, `github-actions*`
   - Author name: `*[bot]`, `Claude*`, `Copilot*`, `dependabot*`
   - Commit message: `Co-authored-by: Claude`, `Co-authored-by: GitHub Copilot`
   - Commit trailer: `Daax-Session:`, `Agent-Session:`
3. Update SprintSummary:
   ```typescript
   agent_contributors: new Set(agentCommits.map(c => c.author)).size,
   agent_commits: agentCommits.length,
   agent_commit_percentage: (agentCommits.length / totalCommits) * 100,
   ```

**Test**: `test/unit/analyzers/git.test.ts`
- Detects Claude co-authored commits
- Detects bot email patterns
- Detects trailer patterns

**Validation**: Make a test commit with Claude co-author trailer, run retro, verify agent_commits > 0

**Dependencies**: 1.1

---

#### 2.2 Analyze Risk Fields in Decisions

**Modify**:
- `src/analyzers/decisions.ts`
- `src/runner.ts`
- `src/report/generator.ts`

**Changes**:
1. Add `analyzeRiskProfile()` method to DecisionAnalyzer:
   ```typescript
   analyzeRiskProfile(): {
     byRiskLevel: Map<'high' | 'medium' | 'low', DecisionRecord[]>;
     missingReversibilityPlan: DecisionRecord[];  // one_way_door without plan
     missingRiskAssessment: DecisionRecord[];     // one_way_door without risk_level
   }
   ```
2. Generate "Risk Analysis" section:
   - Count of high/medium/low risk decisions
   - WARNING for one-way-doors missing reversibility_plan
   - List decisions needing risk assessment
3. Add finding for each high-risk decision without reversibility plan

**Test**: `test/unit/analyzers/decisions.test.ts`
- Risk profile correctly categorizes decisions
- Missing plans are detected

**Validation**: Create high-risk decision without reversibility_plan, verify WARNING appears

**Dependencies**: 1.2

---

### Phase 3: Implement Missing Analyzers

**Objective**: Features that exist only as stubs must work.

#### 3.1 Implement Decision Thrash Detection

**Modify**: `src/analyzers/decisions.ts` lines 229-236

**Changes**:
1. Implement `getDecisionThrash()` method:
   ```typescript
   getDecisionThrash(): Array<{
     topic: string;
     decisions: DecisionRecord[];
     severity: 'high' | 'medium' | 'low';
   }>
   ```
2. Detection algorithm:
   - Group decisions by category
   - Within category, find decisions on similar topics (keyword matching in decision/summary)
   - Flag as thrash if 2+ decisions on same topic within 7 days
   - Severity: high if 3+, medium if 2, low if related but different choices
3. Add MEDIUM finding for detected thrash patterns

**Test**: `test/unit/analyzers/decisions.test.ts`
- Detects thrash in fixture with reversing decisions
- Returns empty for stable decisions

**Validation**: Create two conflicting decisions on same topic, verify thrash detected

**Dependencies**: 1.3

---

#### 3.2 Implement Security Scan Parsing

**Create**: `src/analyzers/security.ts`

**Changes**:
1. Create SecurityAnalyzer class:
   ```typescript
   class SecurityAnalyzer {
     analyze(): SecurityAnalysisResult {
       // Parse common scan formats
     }
   }

   interface SecurityAnalysisResult {
     hasScans: boolean;
     scanTypes: string[];
     vulnerabilities: {
       critical: number;
       high: number;
       medium: number;
       low: number;
     };
     newVulnerabilities: VulnerabilityInfo[];  // Added since last scan
     resolvedVulnerabilities: number;
   }
   ```
2. Support formats:
   - Trivy JSON: `.logs/security/trivy.json`
   - npm audit JSON: `.logs/security/npm-audit.json`
   - Snyk JSON: `.logs/security/snyk.json`
3. Update `scoreSecurity()` in runner.ts to use real data
4. Add to report: "Security Posture" section with vulnerability counts

**Test**: `test/unit/analyzers/security.test.ts`
- Parses Trivy JSON correctly
- Parses npm audit correctly
- Calculates vulnerability counts

**Validation**: Add sample Trivy output to .logs/security/, verify security score is no longer null

**Dependencies**: 0.3

---

#### 3.3 Implement PR Review Metrics

**Modify**: `src/analyzers/github.ts`

**Changes**:
1. Fetch actual review data from GitHub API:
   ```typescript
   // Use gh api to get:
   // - Review comments count
   // - Review request to approval time
   // - Number of review cycles (requested_changes followed by approval)
   ```
2. Populate currently-stubbed fields:
   - `reviewCount`: actual reviews
   - `commentCount`: review comments + general comments
   - `commits`: commits in PR
3. Add `detectBottlenecks()` method:
   ```typescript
   detectBottlenecks(): {
     slowPRs: PRInfo[];           // >48h to merge
     highRevisionPRs: PRInfo[];   // >3 review cycles
     bottleneckAuthors: string[]; // Authors with slowest avg review time
   }
   ```
4. Add to report: "PR Review Metrics" section

**Test**: `test/unit/analyzers/github.test.ts`
- Mock gh API responses
- Bottleneck detection works

**Validation**: Run against repo with PRs, verify reviewCount > 0

**Dependencies**: 0.3

---

### Phase 4: New Features

**Objective**: Features users actually need.

#### 4.1 Micro-Retro Feedback Command

**Create**:
- `src/commands/feedback.ts`
- Update `src/cli.ts`

**Changes**:
1. Add `feedback` subcommand to CLI:
   ```bash
   agentic-retrospective feedback
   ```
2. Prompt for:
   - Alignment (1-5): "How well did the agent match your intent?"
   - Rework needed: none | minor | significant
   - Revision cycles: number
   - What worked well: free text
   - What to improve: free text
3. Write to `.logs/feedback/YYYY-MM-DD.jsonl`
4. Confirm save with summary

**Test**: `test/integration/cli.test.ts`
- Feedback command accepts input
- Writes valid JSONL

**Validation**: Run `agentic-retrospective feedback`, verify file created

**Dependencies**: 0.3

---

#### 4.2 Rework Chain Detection

**Create**: `src/analyzers/rework.ts`

**Changes**:
1. Create ReworkAnalyzer:
   ```typescript
   class ReworkAnalyzer {
     detectReworkChains(commits: CommitInfo[]): ReworkChain[] {
       // Find "fix" commits that reference earlier commits
       // Match by file overlap and timing
     }
   }

   interface ReworkChain {
     originalCommit: CommitInfo;
     fixCommits: CommitInfo[];
     filesAffected: string[];
     totalReworkLines: number;
   }
   ```
2. Detection patterns:
   - Commit messages: "fix", "revert", "fixup", "amend"
   - File overlap: >50% same files changed within 48h
   - Explicit references: "fixes abc123", "reverts def456"
3. Add to report: "Rework Analysis" section
   - Rework chains with commit links
   - Total rework percentage
   - Files with most rework

**Test**: `test/unit/analyzers/rework.test.ts`
- Detects fix commit following feature commit
- Calculates rework percentage

**Validation**: Create fix commit, run retro, verify rework chain appears

**Dependencies**: 2.1

---

#### 4.3 Prompt Quality Analysis

**Modify**: `src/analyzers/human-insights.ts`

**Changes**:
1. Enhance `analyzePromptPatterns()` to calculate:
   ```typescript
   interface PromptQualityMetrics {
     avgAmbiguityScore: number;      // 0-1, lower is better
     constraintUsageRate: number;    // % prompts with constraints
     exampleUsageRate: number;       // % prompts with examples
     acceptanceCriteriaRate: number; // % prompts with AC
     avgFileReferences: number;      // avg files referenced per prompt
   }
   ```
2. Correlate prompt quality with outcomes:
   - Match prompts to feedback by session_id
   - Calculate avg alignment by prompt quality tier
   - Identify prompts that led to rework
3. Add to report: "Prompt Quality" section
   - Quality metrics breakdown
   - "Effective prompt patterns" with examples
   - "Prompts that led to rework" with examples

**Test**: `test/unit/analyzers/human-insights.test.ts`
- Metrics calculated correctly from fixture data
- Correlation with outcomes works

**Validation**: Add prompts with varying quality, verify metrics appear

**Dependencies**: 0.3

---

### Phase 5: Integration and Validation

**Objective**: Ensure everything works together.

#### 5.1 Integration Tests

**Create**: `test/integration/`

| Test File | Tests |
|-----------|-------|
| `runner.test.ts` | Full pipeline with all data sources |
| `graceful-degradation.test.ts` | Pipeline with missing sources |
| `cli.test.ts` | CLI commands work end-to-end |

**Key integration scenarios**:

```typescript
// test/integration/runner.test.ts
describe('RetroRunner Integration', () => {
  test('git-only: produces report with git scores, others null', async () => {
    // Setup: temp git repo, no .logs/
    const result = await runRetro(config);

    expect(result.success).toBe(true);
    expect(result.report.scores.delivery_predictability.score).not.toBeNull();
    expect(result.report.scores.decision_hygiene.score).toBeNull();
    expect(result.report.data_completeness.gaps).toContainEqual(
      expect.objectContaining({ gap_type: 'missing_decisions' })
    );
  });

  test('git + decisions: decision hygiene scored', async () => {
    // Setup: temp git repo + .logs/decisions/ with fixtures
    const result = await runRetro(config);

    expect(result.report.scores.decision_hygiene.score).not.toBeNull();
    expect(result.report.summary.decisions_logged).toBeGreaterThan(0);
  });

  test('all sources: complete report with all sections', async () => {
    // Setup: git + decisions + feedback + tools + security
    const result = await runRetro(config);

    // All scores should be populated
    Object.values(result.report.scores).forEach(score => {
      expect(score.score).not.toBeNull();
    });

    // All new sections should exist
    expect(result.report.git_metrics.hotspots.length).toBeGreaterThan(0);
    expect(result.report.human_insights).toBeDefined();
    expect(result.report.tools_summary).toBeDefined();
  });
});

// test/integration/graceful-degradation.test.ts
describe('Graceful Degradation', () => {
  test('missing decisions: records gap, continues', async () => {
    // Assert: gap recorded, decision score null, report still generated
  });

  test('malformed decision file: skips bad lines, continues', async () => {
    // Assert: valid decisions parsed, warning logged, no crash
  });

  test('github unavailable: skips PR metrics, continues', async () => {
    // Assert: gap recorded, report still generated without PR section
  });

  test('all optional sources missing: git-only report', async () => {
    // Assert: only git-based scores, all gaps recorded
  });
});

// test/integration/cli.test.ts
describe('CLI Integration', () => {
  test('default run produces output files', async () => {
    // Run: pnpm dlx agentic-retrospective --quiet
    // Assert: retrospective.md, retrospective.json, evidence_map.json exist
  });

  test('feedback command writes to .logs/feedback/', async () => {
    // Run: echo input | pnpm dlx agentic-retrospective feedback
    // Assert: .logs/feedback/YYYY-MM-DD.jsonl updated
  });

  test('--json flag skips markdown output', async () => {
    // Run: pnpm dlx agentic-retrospective --json
    // Assert: retrospective.json exists, retrospective.md does NOT exist
  });
});
```

**Validation**: `pnpm run test:integration` passes

**Dependencies**: All Phase 1-4 tasks

---

#### 5.2 Snapshot Tests

**Create**: `test/snapshot/`

| Test File | Snapshots |
|-----------|-----------|
| `report-structure.test.ts` | Markdown section structure |
| `json-schema.test.ts` | JSON output structure |

**Strategy**:
- Sanitize dynamic values (timestamps, hashes)
- Snapshot section headers and structure
- Update snapshots only on intentional format changes

**Validation**: `pnpm run test:snapshot` passes

**Dependencies**: 5.1

---

#### 5.3 Self-Validation (Meta-Test)

**Create**: `test/e2e/self-validation.test.ts`

**Test**: Run agentic-retrospective against its own repository

```typescript
test('generates valid report for this repository', async () => {
  const result = await runRetro({
    fromRef: 'HEAD~20',
    toRef: 'HEAD',
    sprintId: 'self-test',
    // ... use real .logs/ data
  });

  expect(result.success).toBe(true);
  expect(result.report.scores.delivery_predictability.score).not.toBeNull();
  expect(result.report.scores.decision_hygiene.score).not.toBeNull();
  // ... validate all expected sections exist
});
```

**Validation**: Self-test produces useful report with real insights

**Dependencies**: 5.2

---

## Dependency Graph

```
Phase 0: Foundation
├── 0.1 vitest.config.ts
│   └── 0.2 Test Fixtures
│       └── 0.3 Unit Tests
│
Phase 1: Surface Data (parallel after 0.3)
├── 1.1 Git Hotspots ─────┐
├── 1.2 Decision Maps ────┼── 1.3 Wire Orphaned Methods
├── 1.4 Tool Metrics ─────┘
│
Phase 2: Populate Fields (parallel after Phase 1)
├── 2.1 Agent Commit Detection (after 1.1)
├── 2.2 Risk Analysis (after 1.2)
│
Phase 3: Missing Analyzers (parallel after Phase 1)
├── 3.1 Decision Thrash (after 1.3)
├── 3.2 Security Scanning (after 0.3)
├── 3.3 PR Review Metrics (after 0.3)
│
Phase 4: New Features (parallel after Phase 2)
├── 4.1 Micro-Retro Command (after 0.3)
├── 4.2 Rework Detection (after 2.1)
├── 4.3 Prompt Quality (after 0.3)
│
Phase 5: Integration
├── 5.1 Integration Tests (after Phase 4)
│   └── 5.2 Snapshot Tests
│       └── 5.3 Self-Validation
```

---

## Critical Files

| File | Lines | Changes Needed |
|------|-------|----------------|
| `src/runner.ts` | 742 | Data flow fixes, new analyzer calls |
| `src/types.ts` | 324 | New interfaces for surfaced data |
| `src/report/generator.ts` | 303 | New sections for all surfaced data |
| `src/analyzers/decisions.ts` | 238 | Wire orphaned methods, thrash detection, risk analysis |
| `src/analyzers/git.ts` | 214 | Agent commit detection |
| `src/analyzers/human-insights.ts` | 444 | Prompt quality metrics |
| `src/cli.ts` | 204 | Feedback command |

---

## Validation Checkpoints

After each phase, verify:

| Phase | Validation |
|-------|------------|
| 0 | `pnpm test` runs, coverage reported |
| 1 | Run retro → hotspots, decision breakdown, tool metrics visible in report |
| 2 | Run retro → agent_commits > 0 for agent-authored commits, risk warnings appear |
| 3 | Run retro → security score populated (with scan), thrash detected |
| 4 | `agentic-retrospective feedback` works, rework chains detected |
| 5 | `pnpm run validate` passes (lint + typecheck + all tests) |

---

## Success Criteria

The tool is complete when:

1. **Every claim has evidence**: No finding appears without linked artifact
2. **All collected data surfaces**: No computed data is hidden from reports
3. **Tests validate everything**: >60% coverage, all features tested
4. **Self-validation passes**: Tool produces useful insights on its own repo
5. **User value is clear**: Report contains actionable, specific recommendations

---

## Evidence Linking Specification

Every finding MUST include evidence. Evidence format:

| Evidence Type | Format | Example |
|---------------|--------|---------|
| Commit | `commit:<short-hash>` | `commit:abc1234` |
| File | `file:<path>:<line>` | `file:src/runner.ts:147` |
| Decision | `decision:<id>` | `decision:dec-001` |
| PR | `pr:<number>` | `pr:45` |
| Session | `session:<id>` | `session:sess-001` |
| Inferred | `inferred:<source>` | `inferred:commit-message-pattern` |

**Implementation**:
1. `Finding.evidence: string[]` already exists in types.ts
2. Each analyzer must populate evidence array
3. Report generator must render evidence as clickable links (where possible)
4. `EvidenceMap` must be updated to track all evidence types (not just commits/decisions)

**Example Finding with Evidence**:
```typescript
{
  id: 'scope-drift-001',
  severity: 'medium',
  category: 'agent_behavior',
  title: 'Agent scope drift in authentication task',
  summary: 'Agent added 340 lines of unrelated refactoring while implementing JWT auth',
  evidence: [
    'commit:abc1234',        // The offending commit
    'file:src/lib/utils.ts', // File outside task scope
    'decision:dec-003'       // Original task definition
  ],
  confidence: 'high',
  recommendation: 'Add explicit scope boundaries: "Work ONLY on files: [list]"'
}
```

---

## Constitution Alignment

This plan implements the principles in `memory/constitution.md`:

| Principle | How This Plan Addresses It |
|-----------|---------------------------|
| Evidence-Driven | Phase 1-2 surfaces all collected data with artifact links |
| Blameless | Findings focus on patterns, not individuals |
| Balanced | Report shows wins AND risks (already works) |
| Actionable | Max 5 action items with owners and metrics (already works) |
| Graceful Degradation | Phase 5 tests all missing-data scenarios |

---

## Existing Code to Reuse

| Function | Location | Reuse For |
|----------|----------|-----------|
| `normalizeRecord()` | decisions.ts:148-182 | Any JSONL parsing needing field aliases |
| `getExtension()` | git.ts:209-212 | File type detection in rework analyzer |
| `determineChangeType()` | git.ts:196-204 | Categorizing file changes |
| `calculateScore()` | rubrics.ts:12-24 | Creating Score objects with confidence |
| `determineConfidence()` | rubrics.ts:321-341 | Setting confidence levels |
| `formatGapType()` | generator.ts:199-203 | Human-readable gap names |

---

## Edge Cases and Error Handling

### Git Edge Cases

| Scenario | Expected Behavior | Test |
|----------|-------------------|------|
| Empty repo (0 commits) | Return `null` scores, gap recorded | `git.test.ts` |
| Single commit (HEAD~1 fails) | Fallback to first commit | `git.test.ts` |
| Binary files (lines = '-') | Count as 0 lines | `git.test.ts` |
| Merge commits | Include but flag as merge | `git.test.ts` |
| Detached HEAD | Use commit hash | `git.test.ts` |

### Decision Edge Cases

| Scenario | Expected Behavior | Test |
|----------|-------------------|------|
| Empty directory | Return empty analysis, gap recorded | `decisions.test.ts` |
| Malformed JSON lines | Skip line, log warning, continue | `decisions.test.ts` |
| Missing required `ts` field | Record marked invalid, excluded from analysis | `decisions.test.ts` |
| All decisions by agent | 0% escalation rate, CRITICAL finding | `decisions.test.ts` |
| No one-way-doors | 100% escalation rate (vacuously true) | `decisions.test.ts` |

### Report Edge Cases

| Scenario | Expected Behavior | Test |
|----------|-------------------|------|
| All scores null | Report generates, "UNKNOWN" health | `generator.test.ts` |
| 0 findings | "No findings" message (not empty section) | `generator.test.ts` |
| 0 action items | "No actions needed" message | `generator.test.ts` |
| Very long decision text | Truncate to 200 chars with "..." | `generator.test.ts` |

---

## Sample Report Structure (Target Output)

After all phases complete, report should contain these sections:

### Code Hotspots Section (NEW - Phase 1.1)

```markdown
## Code Hotspots

Files changed 3+ times this sprint (high churn may indicate architectural issues):

| File | Changes | Lines Churned | Concern Level |
|------|---------|---------------|---------------|
| src/runner.ts | 8 | +450/-320 | **High** - Core orchestration under heavy modification |
| src/analyzers/git.ts | 5 | +120/-45 | Medium - Active development |
| src/types.ts | 4 | +80/-10 | Low - Type additions (expected) |

### File Distribution
| Extension | Files Changed | % of Total |
|-----------|---------------|------------|
| .ts | 23 | 74% |
| .md | 5 | 16% |
| .json | 3 | 10% |
```

### Decisions Analysis Section (NEW - Phase 1.2)

```markdown
## Decisions Analysis

### By Category
| Category | Count | % | Key Decisions |
|----------|-------|---|---------------|
| architecture | 3 | 33% | Database choice, API design |
| security | 2 | 22% | Auth flow, token storage |
| deps | 2 | 22% | React upgrade, shadcn adoption |
| other | 2 | 22% | - |

### By Actor
| Actor | Decisions | % | One-Way-Doors |
|-------|-----------|---|---------------|
| human | 7 | 78% | 3 |
| agent | 2 | 22% | 0 |

### Escalation Compliance
✅ **100% escalation rate** - All 3 one-way-door decisions were made by humans

### Risk Profile
| Risk Level | Count | Missing Reversibility Plan |
|------------|-------|---------------------------|
| High | 2 | 1 ⚠️ [decision:dec-003] |
| Medium | 4 | 0 |
| Low | 3 | 0 |

**Warning**: 1 high-risk decision lacks reversibility plan
```

### Tool Performance Section (NEW - Phase 1.4)

```markdown
## Tool Performance

| Tool | Calls | % | Avg Duration | Success Rate | Top Error |
|------|-------|---|--------------|--------------|-----------|
| Bash | 42 | 67% | 1.2s | 95% | Exit code 1 |
| Glob | 15 | 24% | 0.05s | 100% | - |
| Read | 8 | 13% | 0.02s | 100% | - |
| Edit | 6 | 10% | 0.03s | 83% | No match found |

**Overall**: 62 tool calls, 94% success rate, 0.8s avg duration

⚠️ **Edit tool** has 17% error rate - consider more specific matches
```

### Rework Analysis Section (NEW - Phase 4.2)

```markdown
## Rework Analysis

### Rework Chains Detected

| Original Commit | Fix Commits | Time to Fix | Files | Rework Lines |
|-----------------|-------------|-------------|-------|--------------|
| `abc1234` "Add auth" | `def5678` "Fix auth" | 2h | 3 | +45/-30 |
| `111aaaa` "Add form" | `222bbbb`, `333cccc` | 4h | 2 | +80/-60 |

### Summary
- **Total rework**: 3 fix commits out of 15 total (20%)
- **Rework lines**: 175 lines (8% of total changes)
- **Avg time to fix**: 3h

### Files with Most Rework
1. `src/components/auth/Login.tsx` - 3 fix commits
2. `src/lib/validation.ts` - 2 fix commits
```

### Prompt Quality Section (NEW - Phase 4.3)

```markdown
## Prompt Quality Analysis

### Metrics
| Metric | Value | Benchmark | Status |
|--------|-------|-----------|--------|
| Avg Ambiguity Score | 0.35 | < 0.3 | ⚠️ Slightly high |
| Constraint Usage | 45% | > 60% | ⚠️ Below target |
| Example Usage | 20% | > 30% | ⚠️ Below target |
| Acceptance Criteria | 30% | > 50% | ⚠️ Below target |
| Avg File References | 1.2 | > 2 | ⚠️ Could be more specific |

### Effective Prompt Patterns
1. **File references** (avg alignment: 4.5/5)
   - "Fix the bug in `src/auth/login.ts:45`"
2. **Explicit constraints** (avg alignment: 4.2/5)
   - "Only modify the validation logic, don't change the UI"

### Problematic Prompt Patterns
1. **High ambiguity** (avg alignment: 2.1/5)
   - "Make it better" → led to significant rework
2. **Missing acceptance criteria** (avg alignment: 2.8/5)
   - "Add validation" → unclear what to validate

### Prompts That Led to Rework
| Session | Prompt Snippet | Rework Level | Issue |
|---------|----------------|--------------|-------|
| sess-001 | "Fix the auth..." | significant | No file specified |
| sess-003 | "Improve perf..." | minor | Vague goal |
```

---

## NPM Scripts to Add

```json
{
  "scripts": {
    "test": "vitest",
    "test:unit": "vitest run test/unit",
    "test:integration": "vitest run test/integration",
    "test:snapshot": "vitest run test/snapshot",
    "test:e2e": "vitest run test/e2e",
    "test:coverage": "vitest run --coverage",
    "test:watch": "vitest watch",
    "validate": "pnpm run lint && pnpm run typecheck && pnpm run test",
    "validate:quick": "pnpm run typecheck && pnpm run test:unit"
  }
}
```

---

## Files to Create

| File | Purpose |
|------|---------|
| `vitest.config.ts` | Test configuration |
| `test/fixtures/**` | Test data |
| `test/helpers/**` | Test utilities |
| `test/unit/**/*.test.ts` | Unit tests |
| `test/integration/**/*.test.ts` | Integration tests |
| `test/snapshot/**/*.test.ts` | Snapshot tests |
| `src/analyzers/security.ts` | Security scan parsing |
| `src/analyzers/rework.ts` | Rework chain detection |
| `src/commands/feedback.ts` | Micro-retro feedback |

## Files to Modify

| File | Changes |
|------|---------|
| `src/runner.ts` | Surface all collected data, call orphaned methods |
| `src/types.ts` | Add new interfaces |
| `src/report/generator.ts` | Add new sections |
| `src/analyzers/decisions.ts` | Implement thrash, risk analysis |
| `src/analyzers/git.ts` | Agent commit detection |
| `src/analyzers/github.ts` | Real review metrics |
| `src/analyzers/human-insights.ts` | Prompt quality metrics |
| `src/cli.ts` | Feedback command |
| `package.json` | Test scripts |

---

## Manual Verification Steps

After implementation, perform these manual checks:

### 1. Fresh Clone Test
```bash
git clone <repo> /tmp/test-retro
cd /tmp/test-retro
pnpm install
pnpm run build
pnpm test
# Expected: All tests pass
```

### 2. Self-Analysis Test
```bash
cd /path/to/agentic-retrospective
./dist/cli.js --from HEAD~20 --sprint self-test

# Verify report contains:
# - [ ] Code Hotspots section with real file paths
# - [ ] Decisions Analysis with category breakdown
# - [ ] Tool Performance metrics
# - [ ] Rework Analysis (if fix commits exist)
# - [ ] Scoring table with non-null git-based scores
# - [ ] Evidence links that reference real commits
```

### 3. Missing Data Test
```bash
# Create temp dir with just git
mkdir /tmp/minimal-test && cd /tmp/minimal-test
git init && echo "test" > file.txt && git add . && git commit -m "init"

# Run retro
pnpm dlx agentic-retrospective

# Verify:
# - [ ] Report generates (not crash)
# - [ ] Telemetry Gaps section lists all missing sources
# - [ ] Delivery Predictability score is NOT null
# - [ ] Decision Hygiene score IS null (no decisions)
```

### 4. Feedback Loop Test
```bash
pnpm dlx agentic-retrospective feedback

# Enter test data, verify:
# - [ ] .logs/feedback/YYYY-MM-DD.jsonl created
# - [ ] Entry contains alignment, rework_needed, worked_well
```

---

## Completion Checklist

The project is DONE when ALL of these are true:

### Tests
- [ ] `pnpm test` runs without error
- [ ] Coverage > 60% on all src/ files
- [ ] All unit tests pass
- [ ] All integration tests pass
- [ ] Self-validation test passes

### Data Surfacing
- [ ] Git hotspots appear in report with real file paths
- [ ] Decision category/actor/type breakdowns appear
- [ ] Tool performance metrics appear
- [ ] `getMissedEscalations()` called and findings generated
- [ ] `getTrivialEscalations()` called and findings generated
- [ ] `agent_commits` > 0 for repos with agent commits

### New Features
- [ ] Decision thrash detection works (not empty array)
- [ ] Security scan parsing works (when scan files exist)
- [ ] PR review metrics populated (when gh available)
- [ ] `feedback` command works
- [ ] Rework chains detected
- [ ] Prompt quality metrics calculated

### Report Quality
- [ ] Every finding has evidence array populated
- [ ] No hardcoded zeros in summary
- [ ] All new sections render correctly
- [ ] Graceful degradation works (missing sources don't crash)

### Constitution Compliance
- [ ] All claims link to artifacts
- [ ] Findings are blameless (evaluate systems, not people)
- [ ] Max 5 action items per report
- [ ] Confidence levels set appropriately

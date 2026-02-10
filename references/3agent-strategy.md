# Agentic Retrospective: 3-Agent Strategy Document

> **Multi-Agent Collaboration**: Claude (Anthropic) × GPT (OpenAI) × Gemini (Google)
> **Iteration Rounds**: 10 complete cycles
> **Date**: 2026-02-04
> **Purpose**: Comprehensive improvement plan for human-agent retrospectives

---

## 📋 Document Evolution Log

| Round | Lead | Focus | Key Contribution |
|-------|------|-------|------------------|
| 1 | Claude | Foundation | Gap analysis of current implementation |
| 2 | GPT | Data Sources | Expanded telemetry collection strategy |
| 3 | Gemini | Analytics | ML-driven pattern recognition |
| 4 | Claude | Human Insights | Bidirectional feedback loops |
| 5 | GPT | Visualization | Report UX and actionability |
| 6 | Gemini | Benchmarking | Cross-session trending |
| 7 | Claude | Integration | Workflow embedding |
| 8 | GPT | Automation | Self-healing retrospectives |
| 9 | Gemini | Personalization | Adaptive scoring rubrics |
| 10 | All | Synthesis | Prioritized implementation roadmap |

---

## 🔍 Round 1: Foundation Gap Analysis (Claude)

### Current State Assessment

**What Exists Today:**
```
┌─────────────────────────────────────────────────────────────┐
│                    DATA SOURCES (5 Total)                   │
├─────────────────────────────────────────────────────────────┤
│ ✅ Git History      │ Commits, diffs, authors, timestamps   │
│ ⚠️  Decision Logs   │ JSONL format, optional capture        │
│ ⚠️  Agent Logs      │ Prompts/tools via claude-watch        │
│ ❌ CI Results       │ Not implemented                       │
│ ❌ Test Results     │ Path detection only                   │
└─────────────────────────────────────────────────────────────┘
```

**Scoring Dimensions (6 Total):**
1. Delivery Predictability → Based on commit sizes
2. Test Loop Completeness → Inferred from commit messages
3. Quality/Maintainability → Large commit % analysis
4. Security Posture → Not implemented (always N/A)
5. Collaboration Efficiency → Requires agent logs
6. Decision Hygiene → One-way-door escalation rate

### Critical Gaps Identified

| Gap | Impact | Severity |
|-----|--------|----------|
| No human feedback loop | Retro is one-way; human learnings not captured | 🔴 High |
| Agent improvement tracking absent | Can't measure if agent behavior improved sprint-over-sprint | 🔴 High |
| Prompt quality not analyzed | Missing root cause for rework cycles | 🟡 Medium |
| No session-level granularity | Can't identify problematic individual sessions | 🟡 Medium |
| Missing intervention timing | Don't know when human should have stepped in earlier | 🟡 Medium |

### Marketing Slide Analysis

From the provided marketing image, key promised features:

| Promise | Current Implementation | Gap |
|---------|----------------------|-----|
| "Where did I provide unclear instructions?" | ❌ Not analyzed | Need prompt clarity scoring |
| "What assumptions did I make incorrectly?" | ❌ Not captured | Need assumption tracking |
| "When should I have intervened earlier?" | ❌ No timing data | Need intervention delay metrics |
| "Which tools could I have used more effectively?" | ⚠️ Partial (tool logs) | Need tool efficiency analysis |

---

## 🔍 Round 2: Expanded Telemetry Strategy (GPT)

### New Data Sources to Capture

**Tier 1: High-Value, Low-Effort**

```jsonl
// .logs/prompts/2026-02-04.jsonl (enhanced schema)
{
  "ts": "2026-02-04T10:30:00Z",
  "session_id": "sess-abc123",
  "prompt": "Add authentication using JWT",
  "prompt_length": 28,
  "complexity_signals": {
    "has_constraints": false,
    "has_examples": false,
    "has_acceptance_criteria": false,
    "file_references": 0,
    "ambiguity_score": 0.7
  },
  "context_provided": {
    "files_attached": 0,
    "previous_context_referenced": false
  }
}
```

**Tier 2: Medium-Value, Medium-Effort**

```jsonl
// .logs/interventions/2026-02-04.jsonl (NEW)
{
  "ts": "2026-02-04T11:45:00Z",
  "session_id": "sess-abc123",
  "intervention_type": "correction",
  "agent_wrong_path_duration_ms": 720000,
  "human_correction": "No, use the existing auth middleware, don't create new",
  "root_cause": "missing_context",
  "could_have_prevented": true,
  "prevention_method": "reference existing file in initial prompt"
}
```

**Tier 3: High-Value, Higher-Effort**

```jsonl
// .logs/outcomes/2026-02-04.jsonl (NEW)
{
  "ts": "2026-02-04T14:00:00Z",
  "session_id": "sess-abc123",
  "task_id": "auth-implementation",
  "outcome": "success",
  "revision_cycles": 3,
  "time_to_first_working": 45,
  "time_to_final": 120,
  "human_satisfaction": 4,
  "agent_learnings": ["should check for existing patterns first"]
}
```

### Enhanced Git Analysis

```typescript
// New commit classification categories
interface EnhancedCommitAnalysis {
  // Existing
  hash: string;
  author: string;
  
  // NEW: Behavioral classification
  commit_type: 'feature' | 'fix' | 'refactor' | 'test' | 'docs' | 'chore';
  was_rework: boolean;  // Is this fixing a recent commit?
  rework_of?: string;   // Hash of original commit being fixed
  
  // NEW: Authorship attribution
  authored_by: 'human' | 'agent' | 'pair';
  
  // NEW: Quality signals
  has_tests: boolean;
  has_docs: boolean;
  follows_conventions: boolean;
  
  // NEW: Scope analysis
  scope_appropriate: boolean;
  unrelated_changes: FileChange[];
}
```

---

## 🔍 Round 3: ML-Driven Pattern Recognition (Gemini)

### Pattern Detection Algorithms

**1. Rework Cycle Detection**

```typescript
interface ReworkPattern {
  pattern_id: string;
  
  // The symptom
  symptom: {
    fix_commits_following_feature: number;
    avg_time_to_first_fix: number; // minutes
    files_repeatedly_modified: string[];
  };
  
  // Root cause classification
  root_cause: 
    | 'unclear_requirements'
    | 'missing_context'
    | 'wrong_assumption'
    | 'scope_creep'
    | 'technical_debt'
    | 'agent_hallucination';
  
  // Evidence
  evidence: {
    prompt_analysis?: string;
    git_pattern?: string;
    intervention_log?: string;
  };
  
  // Prevention
  prevention: string;
}
```

**2. Intervention Timing Analysis**

```typescript
interface InterventionTimingAnalysis {
  session_id: string;
  
  // When agent went wrong
  divergence_point: {
    timestamp: string;
    action: string; // What agent did
    should_have: string; // What was expected
  };
  
  // How long until human noticed
  detection_delay_ms: number;
  
  // What triggered human intervention
  trigger: 
    | 'output_review'
    | 'error_encountered'
    | 'proactive_check'
    | 'agent_asked';
  
  // Optimal intervention point
  optimal_intervention: {
    timestamp: string;
    signal: string; // What should have triggered earlier intervention
  };
  
  // Time cost of delayed intervention
  wasted_effort_ms: number;
}
```

**3. Prompt Quality Scoring**

```typescript
interface PromptQualityScore {
  prompt_id: string;
  
  // Clarity dimensions (0-5 each)
  scores: {
    specificity: number;      // Are requirements precise?
    context_completeness: number; // Is background provided?
    constraint_clarity: number;   // Are boundaries defined?
    example_richness: number;     // Are examples given?
    success_criteria: number;     // Is "done" defined?
  };
  
  overall: number; // Weighted average
  
  // Correlation with outcome
  outcome_correlation: {
    revision_cycles: number;
    time_to_completion: number;
    human_satisfaction: number;
  };
  
  // Improvement suggestions
  improvements: string[];
}
```

---

## 🔍 Round 4: Bidirectional Feedback Loops (Claude)

### Human-to-Agent Learning Capture

**The Missing Half of the Retrospective**

Current state: Agent behavior is analyzed → Report generated for human
Missing: Human behavior is analyzed → Learnings fed back to improve prompting

```
┌──────────────────────────────────────────────────────────────────┐
│                    BIDIRECTIONAL RETRO MODEL                      │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│   ┌─────────┐                          ┌─────────┐               │
│   │  HUMAN  │◄─── Report & Insights ───│  AGENT  │               │
│   └────┬────┘                          └────┬────┘               │
│        │                                    │                     │
│        │    ┌────────────────────────┐     │                     │
│        └───►│   LEARNING EXCHANGE    │◄────┘                     │
│             │                        │                           │
│             │  • Human prompt tips   │                           │
│             │  • Agent behavior tips │                           │
│             │  • Shared vocabulary   │                           │
│             │  • Calibrated expects  │                           │
│             └────────────────────────┘                           │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
```

**New Output: Human Improvement Report**

```markdown
## 🧑 Human Partner Insights

### Prompt Patterns That Worked Well ✅
1. **"Implement X using the pattern in Y"** - Providing existing code as reference reduced revision cycles by 60%
2. **"Don't modify files outside of Z"** - Explicit scope boundaries prevented scope drift

### Prompt Patterns That Caused Issues ⚠️
1. **Ambiguous task descriptions** led to 3 revision cycles (avg)
   - Example: "Add authentication" vs "Add JWT auth to /api/users endpoint using existing middleware"
   - Improvement: Include endpoint, method, and reference files

2. **Missing acceptance criteria** correlated with 40% longer completion times
   - Example: "Make it work" vs "Should return 200 with {user_id, token} on success"

### Intervention Timing Insights 🕐
- Average delay before correcting agent: 12 minutes
- Optimal intervention signals you missed:
  1. Agent created new file when existing file had pattern (3 occurrences)
  2. Agent asked clarifying question that revealed misunderstanding (not addressed)

### Recommended CLAUDE.md Updates 📝
Based on this sprint, consider adding:
\`\`\`markdown
## Prompting Preferences
- Always reference existing files when asking for similar patterns
- Include explicit scope boundaries: "Only modify files in src/auth/"
- Define success criteria: "Done when tests pass and endpoint returns expected shape"
\`\`\`
```

**New Output: Agent Calibration Report**

```markdown
## 🤖 Agent Calibration Insights

### Successful Behaviors to Reinforce ✅
1. **Escalated one-way-door decisions 100%** - Continue this pattern
2. **Small, atomic commits** - Average 47 lines, excellent

### Behaviors Needing Calibration ⚠️
1. **Scope drift in refactoring tasks**
   - 2 instances of unrelated changes
   - Recommendation: Ask before refactoring adjacent code

2. **Context loss across sessions**
   - Same question asked 3 times about auth flow
   - Recommendation: Reference previous session decisions

### Assumption Patterns 🔍
| Assumption Made | Times Incorrect | Better Approach |
|-----------------|-----------------|-----------------|
| "Create new file" | 3 | Check for existing patterns first |
| "Use latest version" | 2 | Check package.json constraints |
| "Standard REST conventions" | 1 | Ask about project conventions |
```

---

## 🔍 Round 5: Report UX and Actionability (GPT)

### Current Output Analysis

**Problems with Current Output:**
1. Dense text walls - hard to scan
2. All findings equal weight visually
3. Action items not linked to specific evidence
4. No quick wins highlighted
5. No progress tracking between retros

### Enhanced Report Structure

```markdown
# 🔄 Sprint Retrospective: 2026-02-04

## ⚡ TL;DR (30 seconds)
┌─────────────────────────────────────────────────────────────┐
│ 🟢 HEALTHY    │ Decision Hygiene (4/5), Delivery (4/5)      │
│ 🟡 ATTENTION  │ Test Coverage (3/5), Collaboration (3/5)    │
│ 🔴 ACTION REQ │ Security Posture (2/5)                      │
├─────────────────────────────────────────────────────────────┤
│ 📊 17:1 fix-to-feature ratio (above 10:1 threshold)        │
│ ⏱️  12 min avg intervention delay (target: <5 min)          │
│ 🎯 3 quick wins identified (est. 30 min total)              │
└─────────────────────────────────────────────────────────────┘

## 🏆 Top 3 Quick Wins (Do Today)

### 1. Add explicit scope to CLAUDE.md [5 min] 🟢
**Impact**: Prevents 60% of scope drift incidents
```bash
echo '## Scope Rules
- Only modify files explicitly mentioned or in same directory
- Ask before refactoring adjacent code' >> CLAUDE.md
```

### 2. Enable JUnit XML output [10 min] 🟡
**Impact**: Enables Test Loop scoring (currently N/A)
```bash
# In package.json
"test": "vitest --reporter=junit --outputFile=test-results/junit.xml"
```

### 3. Add pre-commit decision prompt [15 min] 🟡
**Impact**: Increases decision capture rate by ~40%
```bash
cp hooks/pre-commit-decision.sh .git/hooks/pre-commit
chmod +x .git/hooks/pre-commit
```

## 📈 Trend vs Last Sprint

| Dimension | Last | Now | Δ | Trend |
|-----------|------|-----|---|-------|
| Delivery | 3/5 | 4/5 | +1 | 📈 |
| Test Loop | 2/5 | 3/5 | +1 | 📈 |
| Quality | 3/5 | 3/5 | = | ➡️ |
| Security | N/A | 2/5 | NEW | ⚠️ |
| Collaboration | 3/5 | 3/5 | = | ➡️ |
| Decisions | 4/5 | 4/5 | = | ✅ |
```

### Interactive Report Elements

```typescript
interface InteractiveReportFeatures {
  // Expandable evidence sections
  evidenceDrawers: {
    finding: string;
    evidence: string[];
    expandable: true;
  }[];
  
  // Inline feedback capture
  feedbackPrompts: {
    question: string;
    type: 'rating' | 'text' | 'choice';
    options?: string[];
  }[];
  
  // Action item tracking
  actionTracking: {
    item: string;
    status: 'todo' | 'in_progress' | 'done' | 'wont_do';
    owner?: string;
    due?: string;
  }[];
  
  // Deep links to evidence
  evidenceLinks: {
    type: 'commit' | 'file' | 'log_entry';
    ref: string;
    url: string;
  }[];
}
```

---

## 🔍 Round 6: Cross-Session Trending (Gemini)

### Sprint-Over-Sprint Analytics

**Longitudinal Metrics Dashboard**

```typescript
interface TrendingAnalytics {
  // Core trends (last 5 sprints)
  scoreTrends: {
    dimension: string;
    values: number[]; // [sprint-5, sprint-4, sprint-3, sprint-2, sprint-1]
    trend: 'improving' | 'stable' | 'declining';
    velocity: number; // Rate of change
  }[];
  
  // Pattern persistence
  recurringIssues: {
    issue: string;
    occurrences: number;
    first_seen: string;
    status: 'persistent' | 'improving' | 'resolved';
    resolution_attempts: string[];
  }[];
  
  // Improvement velocity
  actionItemEffectiveness: {
    sprint: string;
    items_created: number;
    items_completed: number;
    items_effective: number; // Actually improved the metric
    completion_rate: number;
    effectiveness_rate: number;
  }[];
}
```

**Comparative Analysis Output**

```markdown
## 📊 5-Sprint Trend Analysis

### Score Evolution
```
Delivery     ████████░░ 3 → ████████████ 4 → ████████████ 4 (+33%)
Test Loop    ██████░░░░ 2 → ████████░░░░ 3 → ████████░░░░ 3 (+50%)
Quality      ████████░░ 3 → ████████░░░░ 3 → ██████████░░ 4 (+33%)
Security     ░░░░░░░░░░ - → ░░░░░░░░░░░░ - → ██████░░░░░░ 2 (NEW)
Collab       ████████░░ 3 → ████████████ 4 → ████████░░░░ 3 (-25%)
Decisions    ████████████ 4 → ████████████ 4 → ████████████ 4 (STABLE)
```

### Persistent Issues (Unresolved > 2 Sprints)
| Issue | First Seen | Attempts | Blocker |
|-------|------------|----------|---------|
| Scope drift in agent refactoring | Sprint-40 | 3 | Need CLAUDE.md enforcement |
| Missing test results artifact | Sprint-39 | 2 | CI config change required |

### Improvement Velocity
- **Action Items Created**: 21 (last 5 sprints)
- **Completed**: 14 (67%)
- **Actually Effective**: 9 (43%)
- **Top Effective Action**: "Add scope boundaries" → 60% scope drift reduction
```

### Benchmarking Against Baselines

```typescript
interface BenchmarkData {
  // Team historical baseline
  team_baseline: {
    avg_scores: Record<string, number>;
    percentiles: Record<string, { p25: number; p50: number; p75: number }>;
  };
  
  // Industry comparison (anonymized aggregate)
  industry_baseline: {
    similar_team_size: Record<string, number>;
    similar_tech_stack: Record<string, number>;
  };
  
  // Best-in-class reference
  excellence_targets: {
    dimension: string;
    current: number;
    target: number;
    gap: number;
    pathway: string;
  }[];
}
```

---

## 🔍 Round 7: Workflow Embedding (Claude)

### Integration Points

**1. Pre-Session Priming**

```markdown
## Before Starting Work

The retro system will inject context at session start:

> 📋 **Previous Session Learnings**
> - Scope drift occurred when you refactored outside task scope (2x last sprint)
> - Human prefers explicit file references in task descriptions
> - Check for existing patterns before creating new files
>
> 🎯 **This Sprint's Focus**
> - Reduce revision cycles (currently 3.2 avg, target: <2)
> - Improve first-attempt accuracy on auth-related tasks
```

**2. In-Session Guidance Triggers**

```typescript
interface InSessionTriggers {
  // Pattern: Agent about to create file that has existing pattern
  scopeDriftWarning: {
    trigger: 'file_create',
    condition: 'similar_file_exists',
    intervention: 'Suggest checking existing patterns first',
  };
  
  // Pattern: Task description ambiguity detected
  clarificationPrompt: {
    trigger: 'task_start',
    condition: 'ambiguity_score > 0.6',
    intervention: 'Suggest asking clarifying questions',
  };
  
  // Pattern: Approaching one-way-door decision
  escalationReminder: {
    trigger: 'code_change',
    condition: 'affects_schema OR affects_api_contract',
    intervention: 'Flag for human review before proceeding',
  };
}
```

**3. Post-Session Micro-Retro**

```markdown
## Session Complete: Quick Feedback (30 sec)

1. How aligned was the agent with your intent?
   [ 1 ] [ 2 ] [ 3 ] [★4★] [ 5 ]

2. Any rework needed?
   [Yes, significant] [Minor tweaks] [★None★]

3. One thing to improve next time:
   [Free text: _________________________]

✓ Logged to .logs/feedback/2026-02-04.jsonl
```

**4. CLAUDE.md Auto-Updates**

```typescript
interface ClaudeMdIntegration {
  // Learnings that should become permanent instructions
  promotableInsights: {
    insight: string;
    evidence_strength: 'weak' | 'moderate' | 'strong';
    occurrences: number;
    suggested_addition: string;
  }[];
  
  // Auto-generate updated CLAUDE.md section
  generateUpdate(): string;
  
  // Present diff to human for approval
  presentForApproval(diff: string): Promise<boolean>;
}
```

---

## 🔍 Round 8: Self-Healing Retrospectives (GPT)

### Automated Improvement Cycles

**1. Telemetry Gap Auto-Remediation**

```typescript
interface AutoRemediation {
  gap_type: string;
  
  // Can we fix this automatically?
  auto_fixable: boolean;
  
  // Fix implementation
  fix: {
    type: 'script' | 'config_change' | 'hook_install';
    command?: string;
    file_changes?: FileChange[];
  };
  
  // Verification
  verify: () => Promise<boolean>;
  
  // Rollback if needed
  rollback: () => Promise<void>;
}

// Example: Auto-install test result collection
const testResultFix: AutoRemediation = {
  gap_type: 'missing_test_results',
  auto_fixable: true,
  fix: {
    type: 'config_change',
    file_changes: [{
      path: 'package.json',
      operation: 'json_merge',
      content: {
        scripts: {
          test: 'vitest --reporter=junit --outputFile=test-results/junit.xml'
        }
      }
    }]
  },
  verify: async () => {
    // Run tests and check if junit.xml was created
    return existsSync('test-results/junit.xml');
  },
  rollback: async () => {
    // Restore original package.json
  }
};
```

**2. Recurring Issue Auto-Resolution**

```typescript
interface RecurringIssueHandler {
  issue_pattern: string;
  occurrences_threshold: number;
  
  // Escalation levels
  responses: {
    level1: { // After 2 occurrences
      action: 'Add to retro report with emphasis';
    };
    level2: { // After 3 occurrences
      action: 'Generate specific fix PR/commit';
      implementation: string;
    };
    level3: { // After 5 occurrences
      action: 'Escalate to team lead/architect';
      notification: string;
    };
  };
}
```

**3. Predictive Issue Prevention**

```typescript
interface PredictiveAnalysis {
  // Based on current trajectory, predict next sprint issues
  predictIssues(): {
    predicted_issue: string;
    probability: number;
    leading_indicators: string[];
    preventive_action: string;
  }[];
  
  // Based on action items, predict effectiveness
  predictActionEffectiveness(items: ActionItem[]): {
    item: string;
    predicted_effectiveness: number;
    confidence: number;
    alternative_suggestion?: string;
  }[];
}
```

---

## 🔍 Round 9: Adaptive Scoring Rubrics (Gemini)

### Context-Aware Scoring

**Problem**: One-size-fits-all rubrics don't account for:
- Project maturity (greenfield vs mature)
- Team composition (solo vs team)
- Sprint goals (feature sprint vs hardening sprint)

**Solution**: Adaptive rubrics that calibrate to context

```typescript
interface AdaptiveRubric {
  dimension: string;
  
  // Context factors that adjust scoring
  contextFactors: {
    project_maturity: 'greenfield' | 'growing' | 'mature';
    team_size: 'solo' | 'small' | 'medium' | 'large';
    sprint_type: 'feature' | 'hardening' | 'exploration' | 'maintenance';
    codebase_size: 'small' | 'medium' | 'large';
  };
  
  // Adjusted thresholds based on context
  getThresholds(context: ContextFactors): {
    excellent: number;
    good: number;
    acceptable: number;
    concerning: number;
    critical: number;
  };
  
  // Adjusted weights for dimension importance
  getWeight(context: ContextFactors): number;
}
```

**Example: Adaptive Test Loop Scoring**

```typescript
const adaptiveTestLoopRubric: AdaptiveRubric = {
  dimension: 'test_loop_completeness',
  
  contextFactors: {
    project_maturity: 'mature',
    team_size: 'small',
    sprint_type: 'feature',
    codebase_size: 'medium',
  },
  
  getThresholds(context) {
    if (context.project_maturity === 'greenfield') {
      // More lenient for new projects
      return {
        excellent: 70, // vs 95% for mature
        good: 50,
        acceptable: 30,
        concerning: 15,
        critical: 0,
      };
    }
    // Standard thresholds for mature projects
    return {
      excellent: 95,
      good: 85,
      acceptable: 70,
      concerning: 50,
      critical: 0,
    };
  },
  
  getWeight(context) {
    if (context.sprint_type === 'exploration') {
      return 0.5; // Lower weight during exploration sprints
    }
    if (context.sprint_type === 'hardening') {
      return 1.5; // Higher weight during hardening
    }
    return 1.0;
  },
};
```

### Personalized Baselines

```typescript
interface PersonalizedBaseline {
  // Learn from this specific team's patterns
  team_id: string;
  
  // Historical performance (sliding window)
  history: {
    sprint: string;
    scores: Record<string, number>;
  }[];
  
  // Calculated baselines (team's typical performance)
  baselines: {
    dimension: string;
    mean: number;
    stdDev: number;
    trend: 'improving' | 'stable' | 'declining';
  }[];
  
  // Score relative to team's own baseline
  scoreRelativeToBaseline(current: number, dimension: string): {
    absolute: number;
    relative: 'above' | 'at' | 'below';
    deviation: number; // Standard deviations from mean
  };
}
```

---

## 🔍 Round 10: Prioritized Implementation Roadmap (All)

### Implementation Phases

```
┌─────────────────────────────────────────────────────────────────────┐
│                    IMPLEMENTATION ROADMAP                            │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  PHASE 1: Foundation (Week 1-2)                        🟢 QUICK WINS │
│  ├── Enhanced prompt logging schema                                  │
│  ├── Post-session micro-retro capture                               │
│  ├── Human improvement report generation                            │
│  └── Fix-to-feature ratio calculation                               │
│                                                                      │
│  PHASE 2: Intelligence (Week 3-4)                      🟡 HIGH VALUE │
│  ├── Rework cycle detection algorithm                               │
│  ├── Prompt quality scoring                                         │
│  ├── Intervention timing analysis                                   │
│  └── Agent calibration report                                       │
│                                                                      │
│  PHASE 3: Experience (Week 5-6)                        🔷 UX POLISH  │
│  ├── Interactive report with expandable evidence                    │
│  ├── Quick wins section with copy-paste commands                    │
│  ├── Trend visualization (last 5 sprints)                          │
│  └── Deep links to evidence                                         │
│                                                                      │
│  PHASE 4: Automation (Week 7-8)                        🔶 EFFICIENCY │
│  ├── Telemetry gap auto-remediation                                 │
│  ├── CLAUDE.md auto-update suggestions                              │
│  ├── Pre-session context injection                                  │
│  └── In-session guidance triggers                                   │
│                                                                      │
│  PHASE 5: Learning (Week 9-10)                         🟣 ADVANCED   │
│  ├── Adaptive scoring rubrics                                       │
│  ├── Cross-session trending                                         │
│  ├── Predictive issue prevention                                    │
│  └── Benchmarking against baselines                                 │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### Priority Matrix

| Feature | Impact | Effort | Priority | Phase |
|---------|--------|--------|----------|-------|
| Human improvement report | 🔴 High | 🟢 Low | P0 | 1 |
| Post-session micro-retro | 🔴 High | 🟢 Low | P0 | 1 |
| Prompt quality scoring | 🔴 High | 🟡 Med | P1 | 2 |
| Rework cycle detection | 🔴 High | 🟡 Med | P1 | 2 |
| Quick wins section | 🟡 Med | 🟢 Low | P1 | 3 |
| Trend visualization | 🟡 Med | 🟡 Med | P2 | 3 |
| Auto-remediation | 🟡 Med | 🔴 High | P2 | 4 |
| Adaptive rubrics | 🟡 Med | 🔴 High | P3 | 5 |

### Immediate Action Items

**This Week:**

1. **Enhance prompt logging** (`claude-watch`)
   ```typescript
   // Add to log-prompt.sh output
   interface EnhancedPromptLog {
     // Existing fields...
     complexity_signals: {
       has_constraints: boolean;
       has_examples: boolean; 
       has_acceptance_criteria: boolean;
       file_references: number;
     };
   }
   ```

2. **Add micro-retro prompt** (new script)
   ```bash
   # .logs/micro-retro.sh
   #!/bin/bash
   echo "Session feedback:"
   read -p "Alignment (1-5): " alignment
   read -p "Rework needed? (y/n): " rework
   read -p "One improvement: " improvement
   
   echo "{\"ts\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"alignment\":$alignment,\"rework\":\"$rework\",\"improvement\":\"$improvement\"}" >> .logs/feedback/$(date +%Y-%m-%d).jsonl
   ```

3. **Generate human improvement report** (new analyzer)
   ```typescript
   // tools/retro/src/analyzers/human-insights.ts
   export class HumanInsightsAnalyzer {
     analyzePromptPatterns(): PromptPattern[];
     analyzeInterventionTiming(): InterventionTiming[];
     generateClaudeMdSuggestions(): string;
   }
   ```

### Success Metrics

| Metric | Current | Target (30d) | Target (90d) |
|--------|---------|--------------|--------------|
| Data completeness | 60% | 80% | 95% |
| Revision cycles per task | 3.2 | 2.5 | <2 |
| Intervention delay (min) | 12 | 8 | <5 |
| Action item completion | 67% | 80% | 90% |
| Action item effectiveness | 43% | 60% | 75% |
| Human satisfaction score | 3.5/5 | 4.0/5 | 4.5/5 |

---

## 📎 Appendix: File Changes Required

### New Files to Create

```
tools/retro/
├── src/
│   ├── analyzers/
│   │   ├── human-insights.ts     # NEW: Human behavior analysis
│   │   ├── prompt-quality.ts     # NEW: Prompt scoring
│   │   ├── rework-detection.ts   # NEW: Rework cycle patterns
│   │   └── intervention.ts       # NEW: Intervention timing
│   ├── report/
│   │   ├── human-report.ts       # NEW: Human improvement report
│   │   ├── agent-calibration.ts  # NEW: Agent calibration report
│   │   ├── quick-wins.ts         # NEW: Quick wins extraction
│   │   └── trending.ts           # NEW: Cross-sprint trends
│   └── integrations/
│       ├── claude-md.ts          # NEW: CLAUDE.md management
│       └── session-context.ts    # NEW: Session priming

feedback-skills-plugin/skills/claude-watch/
├── scripts/
│   ├── micro-retro.sh           # NEW: Post-session feedback
│   └── log-prompt.sh            # MODIFY: Enhanced schema
├── schemas/
│   ├── prompt-log-v2.json       # NEW: Enhanced prompt schema
│   ├── feedback-log.json        # NEW: Micro-retro schema
│   └── intervention-log.json    # NEW: Intervention schema
```

### Existing Files to Modify

| File | Changes |
|------|---------|
| `tools/retro/src/runner.ts` | Add new analyzers, generate additional reports |
| `tools/retro/src/types.ts` | Add new interfaces for human insights, prompt quality |
| `tools/retro/src/report/generator.ts` | Add quick wins, trending, human report sections |
| `tools/retro/src/scoring/rubrics.ts` | Add adaptive scoring context |
| `feedback-skills-plugin/skills/claude-watch/scripts/log-prompt.sh` | Capture complexity signals |
| `feedback-skills-plugin/skills/retro/SKILL.md` | Document new outputs |

---

## ✅ Consensus Achieved

**All three agents agree on:**

1. **Bidirectional feedback is critical** - Current retro is one-way (agent → human)
2. **Prompt quality analysis is high-value** - Root cause of many rework cycles
3. **Post-session micro-retros are low-hanging fruit** - Immediate implementation
4. **Trending is essential for learning** - Can't improve without longitudinal view
5. **Adaptive rubrics prevent false signals** - Context matters for scoring

**Implementation starts with Phase 1 quick wins.**

---

*Document Version: 1.0 | Rounds: 10/10 complete | Last Updated: 2026-02-04*

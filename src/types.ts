/**
 * Core types for the Agentic Retrospective skill
 */

// Decision Log Types
export interface DecisionRecord {
  id?: string;
  ts: string;
  timestamp?: string; // Alias for ts
  sprint_id?: string;
  actor?: 'human' | 'agent' | 'system';
  category?: 'architecture' | 'security' | 'api' | 'data' | 'deps' | 'ux' | 'delivery' | 'process' | 'other';
  decision_type?: 'one_way_door' | 'two_way_door' | 'reversible' | 'unknown';
  decision?: string;
  summary?: string; // Alias
  title?: string; // Alias
  context?: string | Record<string, unknown>;
  options_considered?: Array<{
    option: string;
    pros?: string[];
    cons?: string[];
  }>;
  chosen_option?: string;
  chosen?: string; // Alias
  rationale?: string;
  reasoning?: string; // Alias
  risk_level?: 'low' | 'medium' | 'high';
  risk_notes?: string;
  reversibility_plan?: string;
  owner?: string | null;
  followups?: string[];
  evidence_refs?: string[];
  [key: string]: unknown; // Allow additional properties
}

// Commit Type Classification (GAP-01)
export type CommitType = 'feat' | 'fix' | 'docs' | 'test' | 'refactor' | 'chore' | 'other';

export interface CommitTypeBreakdown {
  feat: number;
  fix: number;
  docs: number;
  test: number;
  refactor: number;
  chore: number;
  other: number;
}

export interface WorkClassification {
  proactive: number; // feat + docs + test
  reactive: number;  // fix + refactor + chore
  ratio: number;     // proactive / (proactive + reactive), 0-1
}

// Git Types
export interface CommitInfo {
  hash: string;
  shortHash: string;
  author: string;
  email: string;
  date: string;
  subject: string;
  body: string;
  files: FileChange[];
  linesAdded: number;
  linesRemoved: number;
}

export interface FileChange {
  path: string;
  additions: number;
  deletions: number;
  changeType: 'add' | 'modify' | 'delete' | 'rename';
}

// Agent Log Types
export interface AgentEvent {
  ts: string;
  type: 'prompt' | 'tool_call' | 'response' | 'error';
  content?: string;
  tool?: string;
  args?: Record<string, unknown>;
  result?: unknown;
  sessionId?: string;
}

// Test Result Types
export interface TestResult {
  suite: string;
  test: string;
  status: 'pass' | 'fail' | 'skip' | 'error';
  duration_ms?: number;
  error?: string;
  reason?: string;
}

export interface TestSummary {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  duration_ms: number;
}

// Scoring Types
export type ConfidenceLevel = 'high' | 'medium' | 'low' | 'none';

export interface Score {
  score: number | null;
  confidence: ConfidenceLevel;
  evidence: string[];
  details?: string;
}

export interface Scores {
  delivery_predictability: Score;
  test_loop_completeness: Score;
  quality_maintainability: Score;
  security_posture: Score;
  collaboration_efficiency: Score;
  decision_hygiene: Score;
}

// Findings Types
export type FindingSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';
export type FindingCategory =
  | 'scope_drift'
  | 'decision_gap'
  | 'agent_behavior'
  | 'quality'
  | 'security'
  | 'inner_loop'
  | 'collaboration'
  | 'telemetry_gap';

export interface Finding {
  id: string;
  severity: FindingSeverity;
  category: FindingCategory;
  title: string;
  summary: string;
  evidence: string[];
  confidence: ConfidenceLevel;
  impact?: string;
  recommendation?: string;
}

// Telemetry Gap Types
export interface TelemetryGap {
  gap_type: string;
  severity: 'high' | 'medium' | 'low';
  impact: string;
  recommendation: string;
}

// Action Item Types
export type ActionPriority = 'must_do' | 'next_sprint' | 'backlog';

export interface ActionItem {
  id: string;
  priority: ActionPriority;
  action: string;
  rationale: string;
  owner: string | null;
  success_metric: string;
  effort: number; // 1-5
  impact: number; // 1-5
  risk_reduction: number; // 1-5
}

// Human Insights Types (Phase 1)
export interface PromptLogEntry {
  timestamp: string;
  session_id: string;
  prompt: string;
  prompt_length?: number;
  complexity_signals?: {
    has_constraints: boolean;
    has_examples: boolean;
    has_acceptance_criteria: boolean;
    file_references: number;
    ambiguity_score: number;
  };
}

export interface FeedbackLogEntry {
  timestamp: string;
  session_id: string;
  alignment: number;
  rework_needed: 'none' | 'minor' | 'significant' | 'unknown';
  revision_cycles?: number | null;
  improvement_suggestion?: string;
  worked_well?: string;
}

export interface PromptPattern {
  pattern: string;
  description: string;
  frequency: number;
  avgAlignmentScore: number;
  avgReworkLevel: number;
  examples: string[];
  recommendation?: string;
}

export interface HumanInsights {
  promptPatterns: {
    effective: PromptPattern[];
    problematic: PromptPattern[];
  };
  feedbackSummary: {
    avgAlignment: number;
    totalSessions: number;
    reworkDistribution: {
      none: number;
      minor: number;
      significant: number;
    };
    avgRevisionCycles: number;
  };
  claudeMdSuggestions: string[];
  topImprovements: string[];
  topSuccesses: string[];
}

export interface FixToFeatureRatio {
  ratio: number;
  fixCommits: number;
  featureCommits: number;
  isHealthy: boolean;
  threshold: number;
}

// Git Metrics Types (Phase 1 - surfaced from GitAnalyzer)
export interface GitMetrics {
  hotspots: Array<{
    path: string;
    changes: number;
    linesChurned?: number;
    concernLevel: 'high' | 'medium' | 'low';
  }>;
  filesByExtension: Array<{
    extension: string;
    count: number;
    percentage: number;
  }>;
  totalFilesChanged: number;
  // GAP-01, GAP-02, GAP-03 additions
  commitTypeBreakdown?: CommitTypeBreakdown;
  checkpointCommits?: number;
  workClassification?: WorkClassification;
}

// Tools Summary Types (Phase 1 - surfaced from ToolsAnalyzer)
export interface ToolsSummary {
  totalCalls: number;
  uniqueTools: number;
  byTool: Array<{
    tool: string;
    calls: number;
    percentage: number;
    avgDuration: number | null;
    successRate: number;
    errors: string[];
  }>;
  overallErrorRate: number;
  avgCallsPerSession: number;
}

// Decision Analysis Types (Phase 1 - surfaced from DecisionAnalyzer)
export interface DecisionQualityMetrics {
  qualityScore: number; // 0-100, % with both rationale AND context
  totalDecisions: number;
  decisionsWithBoth: number;
  status: 'good' | 'warning' | 'critical'; // >70% good, 50-70% warning, <50% critical
}

export interface TestingDisciplineMetrics {
  adherenceRate: number; // 0-100
  totalDecisions: number;
  decisionsWithTesting: number;
  patternsDetected: Array<{ pattern: string; count: number }>;
  status: 'good' | 'warning' | 'critical'; // >70% good, 20-70% warning, <20% critical
}

export interface DecisionAnalysis {
  byCategory: Array<{
    category: string;
    count: number;
    percentage: number;
    decisions: string[];
  }>;
  byActor: Array<{
    actor: string;
    count: number;
    percentage: number;
    oneWayDoors: number;
  }>;
  byType: Array<{
    type: string;
    count: number;
    percentage: number;
  }>;
  escalationCompliance: {
    rate: number;
    total: number;
    escalated: number;
    status: 'compliant' | 'warning' | 'critical';
  };
  riskProfile?: {
    high: number;
    medium: number;
    low: number;
    missingReversibilityPlan: string[];
  };
  qualityMetrics?: DecisionQualityMetrics;
  testingDiscipline?: TestingDisciplineMetrics;
}

// PR Analysis Types (GAP-05, GAP-06, GAP-07)
export interface PRSupersessionAnalysis {
  supersededPRs: Array<{
    prNumber: number;
    supersededBy: number;
    pattern: string; // e.g., "Supersedes #X", "v2"
  }>;
  supersessionRate: number; // % of PRs that were superseded
  chains: Array<number[]>; // chains of superseding PRs
}

export interface PRTestCoverage {
  prsWithTests: number;
  totalPRs: number;
  coverageRate: number; // 0-100
  testFilePatterns: string[]; // e.g., "*.test.ts", "test/"
}

export interface PRReviewAnalysis {
  prsWithNegativeReviews: number;
  totalReviewedPRs: number;
  negativeReviewRate: number; // 0-100
  prsRequestingChanges: Array<{
    prNumber: number;
    title: string;
    reviewCount: number;
  }>;
}

// Evidence Map Types
export interface EvidenceMap {
  commits: Record<string, {
    decisions: string[];
    findings: string[];
    tool_calls?: string[];
    category?: string;
  }>;
  decisions: Record<string, {
    commits: string[];
    type: string;
    escalated: boolean;
    category: string;
  }>;
  orphans: {
    commits_without_context: string[];
    decisions_without_implementation: string[];
  };
}

// Report Types
export interface DataCompleteness {
  percentage: number;
  sources: {
    git: boolean;
    decisions: boolean;
    agent_logs: boolean;
    ci: boolean;
    tests: boolean;
  };
  gaps: TelemetryGap[];
}

export interface SprintSummary {
  commits: number;
  contributors: number;
  human_contributors: number;
  agent_contributors: number;
  lines_added: number;
  lines_removed: number;
  decisions_logged: number;
  agent_commits: number;
  agent_commit_percentage: number;
}

export interface Win {
  title: string;
  description: string;
  evidence: string[];
}

export interface Risk {
  title: string;
  description: string;
  evidence: string[];
  mitigation: string;
}

export interface RetroReport {
  sprint_id: string;
  period: {
    from: string;
    to: string;
  };
  generated_at: string;
  data_completeness: DataCompleteness;
  summary: SprintSummary;
  scores: Scores;
  findings: Finding[];
  wins: Win[];
  risks: Risk[];
  action_items: ActionItem[];
  evidence_map: EvidenceMap;
  // Phase 1 additions - surfaced data
  git_metrics?: GitMetrics;
  tools_summary?: ToolsSummary;
  decision_analysis?: DecisionAnalysis;
  human_insights?: HumanInsights;
  fix_to_feature_ratio?: FixToFeatureRatio;
  // Gap implementation additions
  pr_supersession?: PRSupersessionAnalysis;
  pr_test_coverage?: PRTestCoverage;
  pr_review_analysis?: PRReviewAnalysis;
  metadata: {
    tool_version: string;
    schema_version: string;
    generated_by: string;
  };
}

// Configuration Types
export interface RetroConfig {
  fromRef: string;
  toRef: string;
  sprintId: string;
  decisionsPath: string;
  agentLogsPath: string;
  ciPath?: string;
  outputDir: string;
}

// Alert Types
export interface Alert {
  id: string;
  severity: 'critical' | 'high';
  type: string;
  title: string;
  description: string;
  evidence: string[];
  recommended_action: string;
}

export interface AlertsOutput {
  alerts: Alert[];
  generated_at: string;
}

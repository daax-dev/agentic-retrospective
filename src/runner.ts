/**
 * Main runner for the Agentic Retrospective
 *
 * Orchestrates data collection, analysis, and report generation
 * with graceful degradation when data sources are missing.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import type {
  RetroConfig,
  RetroReport,
  DataCompleteness,
  TelemetryGap,
  Finding,
  ActionItem,
  Scores,
  Score,
  Alert,
  AlertsOutput,
  EvidenceMap,
  HumanInsights,
  FixToFeatureRatio,
} from './types.js';
import { GitAnalyzer } from './analyzers/git.js';
import { DecisionAnalyzer } from './analyzers/decisions.js';
import { HumanInsightsAnalyzer } from './analyzers/human-insights.js';
import { GitHubAnalyzer } from './analyzers/github.js';
import { ArtifactsAnalyzer } from './analyzers/artifacts.js';
import { ToolsAnalyzer } from './analyzers/tools.js';
import { ReportGenerator } from './report/generator.js';
// calculateScore used in individual rubric functions

export interface RunOptions {
  verbose?: boolean;
  jsonOnly?: boolean;
}

export interface RunResult {
  success: boolean;
  outputPath?: string;
  report?: RetroReport;
  alerts?: Alert[];
  error?: string;
}

export async function runRetro(
  config: RetroConfig,
  options: RunOptions = {}
): Promise<RunResult> {
  const runner = new RetroRunner(config, options);
  return runner.run();
}

export class RetroRunner {
  private config: RetroConfig;
  private options: RunOptions;
  private gaps: TelemetryGap[] = [];
  private findings: Finding[] = [];

  constructor(config: RetroConfig, options: RunOptions = {}) {
    this.config = config;
    this.options = options;
  }

  async run(): Promise<RunResult> {
    try {
      // Phase 0: Validate environment
      this.log('Phase 0: Validating environment...');
      const validation = await this.validateEnvironment();
      if (!validation.valid) {
        return { success: false, error: validation.error };
      }

      // Phase 1: Collect data
      this.log('Phase 1: Collecting data...');
      const data = await this.collectData();

      // Phase 2: Build evidence index
      this.log('Phase 2: Building evidence index...');
      const evidenceMap = this.buildEvidenceMap(data);

      // Phase 3: Analyze sprint
      this.log('Phase 3: Analyzing sprint...');
      const scores = await this.analyzeSprit(data);

      // Phase 4: Generate report
      this.log('Phase 4: Generating report...');
      const report = this.generateReport(data, scores, evidenceMap);

      // Phase 5: Write outputs
      this.log('Phase 5: Writing outputs...');
      const outputPath = await this.writeOutputs(report, evidenceMap);

      return {
        success: true,
        outputPath,
        report,
        alerts: this.generateAlerts(report),
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private log(message: string): void {
    if (this.options.verbose) {
      console.log(message);
    }
  }

  private async validateEnvironment(): Promise<{ valid: boolean; error?: string }> {
    // Check if we're in a git repository
    try {
      const gitAnalyzer = new GitAnalyzer();
      const isGit = await gitAnalyzer.isGitRepository();
      if (!isGit) {
        return {
          valid: false,
          error: 'Not a git repository. agentic-retrospective requires git history to analyze.',
        };
      }
      return { valid: true };
    } catch {
      return {
        valid: false,
        error: 'Failed to validate git repository',
      };
    }
  }

  private async collectData(): Promise<CollectedData> {
    const data: CollectedData = {
      git: null,
      decisions: null,
      agentLogs: null,
      testResults: null,
      ciResults: null,
      humanInsights: null,
      fixToFeatureRatio: null,
    };

    // Collect git data (required)
    const gitAnalyzer = new GitAnalyzer();
    data.git = await gitAnalyzer.analyze(this.config.fromRef, this.config.toRef);

    // Collect decision logs (optional)
    if (existsSync(this.config.decisionsPath)) {
      const decisionAnalyzer = new DecisionAnalyzer(this.config.decisionsPath);
      data.decisions = decisionAnalyzer.analyze();
    } else {
      this.addTelemetryGap({
        gap_type: 'missing_decisions',
        severity: 'high',
        impact: 'Cannot evaluate decision quality or boundary discipline',
        recommendation: `Create decision log directory: mkdir -p ${this.config.decisionsPath}\nSee docs/fixing-telemetry-gaps.md`,
      });
    }

    // Collect agent logs (optional)
    if (existsSync(this.config.agentLogsPath)) {
      data.agentLogs = this.loadAgentLogs();
    } else {
      this.addTelemetryGap({
        gap_type: 'missing_agent_logs',
        severity: 'medium',
        impact: 'Cannot analyze agent collaboration patterns or inner loop health',
        recommendation: `Agent logs not found at ${this.config.agentLogsPath}\nSee docs/fixing-telemetry-gaps.md`,
      });
    }

    // Collect test results (optional)
    data.testResults = this.loadTestResults();
    if (!data.testResults) {
      this.addTelemetryGap({
        gap_type: 'missing_test_results',
        severity: 'medium',
        impact: 'Cannot analyze test pass rates, flakiness, or inner loop cycle times',
        recommendation: 'Add JUnit XML output: pytest --junitxml=test-results/pytest.xml',
      });
    }

    // Phase 1: Collect human insights from prompt and feedback logs
    const logsBasePath = join(process.cwd(), '.logs');
    const humanInsightsAnalyzer = new HumanInsightsAnalyzer(logsBasePath);
    // Load logs first so hasData() can check, analyze() will skip re-loading
    humanInsightsAnalyzer.loadLogs();

    if (humanInsightsAnalyzer.hasData()) {
      data.humanInsights = humanInsightsAnalyzer.analyze();
      const dataStatus = humanInsightsAnalyzer.getDataStatus();
      this.log(`  Human insights: ${dataStatus.prompts} prompts, ${dataStatus.feedback} feedback entries`);
    } else {
      this.addTelemetryGap({
        gap_type: 'missing_human_feedback',
        severity: 'medium',
        impact: 'Cannot analyze prompt patterns or generate human improvement insights',
        recommendation: 'Run micro-retrospective.sh after sessions: bash scripts/micro-retrospective.sh',
      });
    }

    // Collect tool usage data
    const toolsAnalyzer = new ToolsAnalyzer(logsBasePath);
    const toolsAnalysis = toolsAnalyzer.analyze();
    if (toolsAnalysis.totalCalls > 0) {
      this.log(`  Tool calls: ${toolsAnalysis.totalCalls} calls, ${toolsAnalysis.uniqueTools} unique tools`);
      // Add findings from tools analysis
      for (const finding of toolsAnalysis.findings) {
        this.findings.push({
          id: `tools-${this.findings.length}`,
          category: 'collaboration',
          severity: toolsAnalysis.errorRate > 0.1 ? 'medium' : 'low',
          title: 'Tool Usage Pattern',
          summary: finding,
          evidence: [],
          recommendation: undefined,
          confidence: 'medium',
          impact: undefined,
        });
      }
    }

    // Collect GitHub PR data
    const githubAnalyzer = new GitHubAnalyzer();
    if (githubAnalyzer.isAvailable()) {
      const githubAnalysis = await githubAnalyzer.analyze();
      if (githubAnalysis.totalPRs > 0) {
        this.log(`  GitHub: ${githubAnalysis.totalPRs} PRs, ${githubAnalysis.mergedPRs} merged`);
        if (githubAnalysis.avgReviewTime) {
          this.log(`  Avg PR review time: ${githubAnalysis.avgReviewTime.toFixed(1)} hours`);
        }
      }
    } else {
      this.addTelemetryGap({
        gap_type: 'missing_github',
        severity: 'low',
        impact: 'Cannot analyze PR review patterns and collaboration metrics',
        recommendation: 'Install and authenticate gh CLI: gh auth login',
      });
    }

    // Collect artifacts (specs, ADRs, API schemas)
    const artifactsAnalyzer = new ArtifactsAnalyzer();
    const artifactsAnalysis = artifactsAnalyzer.analyze();
    this.log(`  Spec-driven score: ${artifactsAnalysis.specDrivenScore}/5`);
    for (const finding of artifactsAnalysis.findings) {
      this.findings.push({
        id: `artifacts-${this.findings.length}`,
        category: 'quality',
        severity: artifactsAnalysis.specDrivenScore < 2 ? 'medium' : 'low',
        title: 'Spec-Driven Development',
        summary: finding,
        evidence: [],
        recommendation: undefined,
        confidence: 'high',
        impact: undefined,
      });
    }

    // Phase 1: Calculate fix-to-feature ratio from git commits
    if (data.git?.commits && data.git.commits.length > 0) {
      // Convert to CommitInfo format for the analyzer
      const commits = data.git.commits.map(c => ({
        hash: c.hash,
        shortHash: c.hash.substring(0, 7),
        author: c.author,
        email: '',
        date: '',
        subject: c.subject,
        body: '',
        files: [],
        linesAdded: c.linesAdded,
        linesRemoved: c.linesRemoved,
      }));
      data.fixToFeatureRatio = HumanInsightsAnalyzer.calculateFixToFeatureRatio(commits);
      this.log(`  Fix-to-feature ratio: ${data.fixToFeatureRatio.fixCommits}:${data.fixToFeatureRatio.featureCommits}`);
    }

    return data;
  }

  private loadAgentLogs(): unknown[] | null {
    try {
      const files = readdirSync(this.config.agentLogsPath);
      const logs: unknown[] = [];

      for (const file of files) {
        if (file.endsWith('.jsonl') || file.endsWith('.json')) {
          const content = readFileSync(join(this.config.agentLogsPath, file), 'utf-8');
          if (file.endsWith('.jsonl')) {
            content.split('\n').filter(Boolean).forEach(line => {
              try {
                logs.push(JSON.parse(line));
              } catch {
                // Skip malformed lines
              }
            });
          } else {
            try {
              logs.push(JSON.parse(content));
            } catch {
              // Skip malformed files
            }
          }
        }
      }

      return logs.length > 0 ? logs : null;
    } catch {
      return null;
    }
  }

  private loadTestResults(): unknown | null {
    // Look for common test result formats
    const locations = [
      'test-results/pytest.xml',
      'test-results/junit.xml',
      'test-results/results.json',
      'coverage/coverage-summary.json',
      'pytest.xml',
      'junit.xml',
    ];

    for (const loc of locations) {
      if (existsSync(loc)) {
        try {
          const content = readFileSync(loc, 'utf-8');
          // Return raw content for now - parsing depends on format
          return { path: loc, content };
        } catch {
          continue;
        }
      }
    }

    return null;
  }

  private buildEvidenceMap(data: CollectedData): EvidenceMap {
    const map: EvidenceMap = {
      commits: {},
      decisions: {},
      orphans: {
        commits_without_context: [],
        decisions_without_implementation: [],
      },
    };

    // Index commits
    if (data.git?.commits) {
      for (const commit of data.git.commits) {
        map.commits[commit.hash] = {
          decisions: [],
          findings: [],
        };
      }
    }

    // Index decisions and link to commits
    if (data.decisions?.records) {
      for (const decision of data.decisions.records) {
        const id = decision.id || `dec-${Date.now()}`;
        map.decisions[id] = {
          commits: [],
          type: decision.decision_type || 'unknown',
          escalated: decision.actor === 'human',
          category: decision.category || 'other',
        };

        // Link by evidence_refs
        if (decision.evidence_refs) {
          for (const ref of decision.evidence_refs) {
            const match = ref.match(/commit:(\w+)/);
            if (match && map.commits[match[1]]) {
              map.commits[match[1]].decisions.push(id);
              map.decisions[id].commits.push(match[1]);
            }
          }
        }
      }
    }

    // Find orphans
    for (const [hash, data] of Object.entries(map.commits)) {
      if (data.decisions.length === 0) {
        // Check if this is a significant commit (>50 lines changed)
        // For now, just track all orphans
        map.orphans.commits_without_context.push(hash);
      }
    }

    for (const [id, data] of Object.entries(map.decisions)) {
      if (data.commits.length === 0) {
        map.orphans.decisions_without_implementation.push(id);
      }
    }

    return map;
  }

  private async analyzeSprit(data: CollectedData): Promise<Scores> {
    return {
      delivery_predictability: this.scoreDelivery(data),
      test_loop_completeness: this.scoreTestLoop(data),
      quality_maintainability: this.scoreQuality(data),
      security_posture: this.scoreSecurity(data),
      collaboration_efficiency: this.scoreCollaboration(data),
      decision_hygiene: this.scoreDecisions(data),
    };
  }

  private scoreDelivery(data: CollectedData): Score {
    if (!data.git?.commits) {
      return { score: null, confidence: 'none', evidence: [] };
    }

    const commitCount = data.git.commits.length;
    // Simple heuristic: more small commits = better
    const avgSize = data.git.commits.reduce(
      (sum, c) => sum + c.linesAdded + c.linesRemoved,
      0
    ) / commitCount;

    let score = 3; // Default
    if (avgSize < 50) score = 5;
    else if (avgSize < 100) score = 4;
    else if (avgSize < 200) score = 3;
    else if (avgSize < 500) score = 2;
    else score = 1;

    return {
      score,
      confidence: 'high',
      evidence: [
        `${commitCount} commits`,
        `Average ${Math.round(avgSize)} lines per commit`,
      ],
    };
  }

  private scoreTestLoop(data: CollectedData): Score {
    if (!data.testResults) {
      // Try to infer from commit messages
      const testCommits = data.git?.commits?.filter(c =>
        c.subject.toLowerCase().includes('test') ||
        c.subject.toLowerCase().includes('fix test')
      ).length || 0;

      if (testCommits > 0) {
        return {
          score: 3,
          confidence: 'low',
          evidence: [`Inferred ${testCommits} test-related commits`],
          details: 'No test result artifacts found - score based on commit messages',
        };
      }

      return { score: null, confidence: 'none', evidence: [], details: 'No test data' };
    }

    // If we have test results, score based on pass rate
    return {
      score: 4,
      confidence: 'medium',
      evidence: ['Test results found'],
    };
  }

  private scoreQuality(data: CollectedData): Score {
    if (!data.git?.commits) {
      return { score: null, confidence: 'none', evidence: [] };
    }

    // Analyze commit sizes and patterns
    const largeCommits = data.git.commits.filter(c =>
      c.linesAdded + c.linesRemoved > 200
    ).length;
    const pct = (largeCommits / data.git.commits.length) * 100;

    let score = 3;
    if (pct < 5) score = 5;
    else if (pct < 15) score = 4;
    else if (pct < 30) score = 3;
    else if (pct < 50) score = 2;
    else score = 1;

    return {
      score,
      confidence: 'medium',
      evidence: [
        `${largeCommits} large commits (${Math.round(pct)}%)`,
      ],
    };
  }

  private scoreSecurity(_data: CollectedData): Score {
    // Would need security scan results
    return {
      score: null,
      confidence: 'none',
      evidence: [],
      details: 'No security scan data available',
    };
  }

  private scoreCollaboration(data: CollectedData): Score {
    if (!data.agentLogs) {
      return {
        score: null,
        confidence: 'none',
        evidence: [],
        details: 'No agent logs available',
      };
    }

    // Basic analysis if we have logs
    return {
      score: 4,
      confidence: 'medium',
      evidence: ['Agent logs analyzed'],
    };
  }

  private scoreDecisions(data: CollectedData): Score {
    if (!data.decisions?.records || data.decisions.records.length === 0) {
      return {
        score: null,
        confidence: 'none',
        evidence: [],
        details: 'No decision logs found',
      };
    }

    const records = data.decisions.records;
    const oneWayDoors = records.filter(d => d.decision_type === 'one_way_door');
    const escalated = oneWayDoors.filter(d => d.actor === 'human');

    const escalationRate = oneWayDoors.length > 0
      ? (escalated.length / oneWayDoors.length) * 100
      : 100;

    let score = 3;
    if (escalationRate === 100) score = 5;
    else if (escalationRate >= 80) score = 4;
    else if (escalationRate >= 60) score = 3;
    else if (escalationRate >= 40) score = 2;
    else score = 1;

    return {
      score,
      confidence: 'high',
      evidence: [
        `${records.length} decisions logged`,
        `${oneWayDoors.length} one-way-door decisions`,
        `${Math.round(escalationRate)}% escalation rate`,
      ],
    };
  }

  private generateReport(
    data: CollectedData,
    scores: Scores,
    evidenceMap: EvidenceMap
  ): RetroReport {
    const completeness = this.calculateCompleteness(data);

    return {
      sprint_id: this.config.sprintId,
      period: {
        from: this.config.fromRef || 'HEAD~100',
        to: this.config.toRef,
      },
      generated_at: new Date().toISOString(),
      data_completeness: completeness,
      summary: {
        commits: data.git?.commits?.length || 0,
        contributors: new Set(data.git?.commits?.map(c => c.author) || []).size,
        human_contributors: new Set(data.git?.commits?.map(c => c.author) || []).size,
        agent_contributors: 0, // Would need to identify agent commits
        lines_added: data.git?.commits?.reduce((s, c) => s + c.linesAdded, 0) || 0,
        lines_removed: data.git?.commits?.reduce((s, c) => s + c.linesRemoved, 0) || 0,
        decisions_logged: data.decisions?.records?.length || 0,
        agent_commits: 0,
        agent_commit_percentage: 0,
      },
      scores,
      findings: this.findings,
      wins: [],
      risks: [],
      action_items: this.generateActionItems(),
      evidence_map: evidenceMap,
      // Phase 1 additions
      human_insights: data.humanInsights || undefined,
      fix_to_feature_ratio: data.fixToFeatureRatio || undefined,
      metadata: {
        // NOTE: `tool_version` represents the Agentic Retrospective/report tooling version
        // and may intentionally differ from the npm/package.json version (currently 0.1.0).
        // It is bumped when the retrospective behavior or report format changes (e.g. "Phase 1"),
        // regardless of whether a new package version has been published yet.
        tool_version: '0.2.0',
        // `schema_version` tracks the JSON schema for RetroReport and is versioned independently
        // from both the package version and `tool_version`.
        schema_version: '1.1',
        generated_by: 'agentic-retrospective',
      },
    };
  }

  private calculateCompleteness(data: CollectedData): DataCompleteness {
    const sources = {
      git: !!data.git,
      decisions: !!data.decisions,
      agent_logs: !!data.agentLogs,
      ci: false, // Not implemented yet
      tests: !!data.testResults,
    };

    const found = Object.values(sources).filter(Boolean).length;
    const total = Object.keys(sources).length;

    return {
      percentage: Math.round((found / total) * 100),
      sources,
      gaps: this.gaps,
    };
  }

  private generateActionItems(): ActionItem[] {
    const items: ActionItem[] = [];

    // Add action items based on gaps
    for (const gap of this.gaps) {
      items.push({
        id: `action-${items.length + 1}`,
        priority: gap.severity === 'high' ? 'must_do' : 'next_sprint',
        action: `Fix telemetry gap: ${gap.gap_type}`,
        rationale: gap.impact,
        owner: null,
        success_metric: 'Data source available in next retrospective',
        effort: 2,
        impact: 3,
        risk_reduction: 3,
      });
    }

    // Limit to reasonable number
    return items.slice(0, 7);
  }

  private generateAlerts(report: RetroReport): Alert[] {
    const alerts: Alert[] = [];

    // Check for critical findings
    for (const finding of report.findings) {
      if (finding.severity === 'critical' || finding.severity === 'high') {
        alerts.push({
          id: `alert-${alerts.length + 1}`,
          severity: finding.severity === 'critical' ? 'critical' : 'high',
          type: finding.category,
          title: finding.title,
          description: finding.summary,
          evidence: finding.evidence,
          recommended_action: finding.recommendation || 'Review and address',
        });
      }
    }

    return alerts;
  }

  private async writeOutputs(report: RetroReport, evidenceMap: EvidenceMap): Promise<string> {
    const outputPath = join(this.config.outputDir, this.config.sprintId);
    mkdirSync(outputPath, { recursive: true });

    // Write JSON report
    writeFileSync(
      join(outputPath, 'retrospective.json'),
      JSON.stringify(report, null, 2)
    );

    // Write evidence map
    writeFileSync(
      join(outputPath, 'evidence_map.json'),
      JSON.stringify(evidenceMap, null, 2)
    );

    // Write alerts
    const alertsOutput: AlertsOutput = {
      alerts: this.generateAlerts(report),
      generated_at: new Date().toISOString(),
    };
    writeFileSync(
      join(outputPath, 'alerts.json'),
      JSON.stringify(alertsOutput, null, 2)
    );

    // Write markdown report (unless JSON only)
    if (!this.options.jsonOnly) {
      const generator = new ReportGenerator();
      const markdown = generator.generateMarkdown(report);
      writeFileSync(join(outputPath, 'retrospective.md'), markdown);
    }

    return outputPath;
  }

  private addTelemetryGap(gap: TelemetryGap): void {
    this.gaps.push(gap);
  }
}

interface CollectedData {
  git: {
    commits: Array<{
      hash: string;
      author: string;
      subject: string;
      linesAdded: number;
      linesRemoved: number;
    }>;
  } | null;
  decisions: {
    records: Array<{
      id?: string;
      decision_type?: string;
      actor?: string;
      category?: string;
      evidence_refs?: string[];
    }>;
  } | null;
  agentLogs: unknown[] | null;
  testResults: unknown | null;
  ciResults: unknown | null;
  // Phase 1 additions
  humanInsights: HumanInsights | null;
  fixToFeatureRatio: FixToFeatureRatio | null;
}

/**
 * Main runner for the Agentic Retrospective
 *
 * Orchestrates data collection, analysis, and report generation
 * with graceful degradation when data sources are missing.
 */

import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'fs';
import { join, resolve } from 'path';
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
  GitMetrics,
  ToolsSummary,
  DecisionAnalysis,
  DecisionRecord,
  SprintHistoryEntry,
} from './types.js';
import { GitAnalyzer } from './analyzers/git.js';
import { DecisionAnalyzer } from './analyzers/decisions.js';
import { HumanInsightsAnalyzer } from './analyzers/human-insights.js';
import { GitHubAnalyzer } from './analyzers/github.js';
import { SecurityAnalyzer } from './analyzers/security.js';
import { ReworkAnalyzer } from './analyzers/rework.js';
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
      riskProfile: null,
      toolsAnalysis: null,
      agentLogs: null,
      testResults: null,
      ciResults: null,
      humanInsights: null,
      fixToFeatureRatio: null,
      securityAnalysis: null,
      reworkAnalysis: null,
    };

    // Collect git data (required)
    const gitAnalyzer = new GitAnalyzer();
    const gitResult = await gitAnalyzer.analyze(this.config.fromRef, this.config.toRef);

    // Phase 2.1: Detect agent commits
    const agentCommits = gitAnalyzer.detectAgentCommits(gitResult.commits);
    const agentAuthors = new Set(agentCommits.map(c => c.author));

    data.git = {
      commits: gitResult.commits,
      hotspots: gitResult.hotspots,
      filesByExtension: gitResult.filesByExtension,
      totalLinesAdded: gitResult.totalLinesAdded,
      totalLinesRemoved: gitResult.totalLinesRemoved,
      agentCommits: agentCommits.length,
      agentCommitHashes: agentCommits.map(c => c.hash),
      agentContributors: agentAuthors.size,
    };

    // Phase 4.2: Analyze rework chains
    const reworkAnalyzer = new ReworkAnalyzer();
    const reworkResult = reworkAnalyzer.detectReworkChains(gitResult.commits);

    if (reworkResult.totalReworkCommits > 0) {
      this.log(`  Rework: ${reworkResult.totalReworkCommits} fix commits (${Math.round(reworkResult.reworkPercentage)}%)`);

      // Store rework data for report
      data.reworkAnalysis = {
        totalReworkCommits: reworkResult.totalReworkCommits,
        reworkPercentage: reworkResult.reworkPercentage,
        totalReworkLines: reworkResult.totalReworkLines,
        avgTimeToFix: reworkResult.avgTimeToFix,
        filesWithMostRework: reworkResult.filesWithMostRework,
        chains: reworkResult.chains.map(c => ({
          original: c.originalCommit.shortHash,
          fixes: c.fixCommits.map(f => f.shortHash),
          files: c.filesAffected,
        })),
      };

      // Generate findings for high rework
      if (reworkResult.reworkPercentage > 20) {
        this.findings.push({
          id: `rework-high-${this.findings.length}`,
          category: 'quality',
          severity: 'medium',
          title: 'High rework detected',
          summary: `${Math.round(reworkResult.reworkPercentage)}% of commits are fixes/rework. Consider more upfront planning.`,
          evidence: reworkResult.chains.slice(0, 3).map(c => `commit:${c.originalCommit.shortHash}`),
          recommendation: 'Review development process - high rework suggests missed requirements or insufficient testing',
          confidence: 'high',
        });
      }

      // Flag files with excessive rework
      const problemFiles = reworkResult.filesWithMostRework.filter(f => f.reworkCount >= 3);
      if (problemFiles.length > 0) {
        this.findings.push({
          id: `rework-files-${this.findings.length}`,
          category: 'quality',
          severity: 'low',
          title: 'Files requiring frequent fixes',
          summary: `${problemFiles.length} files needed 3+ fix commits - may indicate complexity issues`,
          evidence: problemFiles.map(f => `file:${f.path}`),
          recommendation: 'Consider refactoring or adding tests for these frequently-fixed files',
          confidence: 'medium',
        });
      }
    }

    // Collect decision logs (optional)
    if (existsSync(this.config.decisionsPath)) {
      const decisionAnalyzer = new DecisionAnalyzer(this.config.decisionsPath);
      const decisionResult = decisionAnalyzer.analyze();
      data.decisions = {
        records: decisionResult.records,
        byCategory: decisionResult.byCategory,
        byActor: decisionResult.byActor,
        byType: decisionResult.byType,
        escalationStats: decisionResult.escalationStats,
      };

      // Phase 1: Generate findings from orphaned decision methods
      const missedEscalations = decisionAnalyzer.getMissedEscalations();
      for (const decision of missedEscalations) {
        this.findings.push({
          id: `missed-escalation-${decision.id || this.findings.length}`,
          category: 'decision_gap',
          severity: 'critical',
          title: 'One-way-door decision made by agent',
          summary: `Agent made irreversible decision without human approval: ${(decision.decision || '').slice(0, 100)}`,
          evidence: [`decision:${decision.id || 'unknown'}`],
          recommendation: 'Ensure one-way-door decisions are escalated to humans',
          confidence: 'high',
        });
      }

      const trivialEscalations = decisionAnalyzer.getTrivialEscalations();
      if (trivialEscalations.length > 2) {
        this.findings.push({
          id: `trivial-escalations-${this.findings.length}`,
          category: 'collaboration',
          severity: 'info',
          title: 'Trivial decisions escalated to human',
          summary: `${trivialEscalations.length} two-way-door decisions were made by human (could have been delegated to agent)`,
          evidence: trivialEscalations.slice(0, 3).map(d => `decision:${d.id || 'unknown'}`),
          recommendation: 'Consider delegating reversible decisions to agent for efficiency',
          confidence: 'medium',
        });
      }

      // Phase 2.2: Risk profile analysis
      const riskProfile = decisionAnalyzer.analyzeRiskProfile();

      // Store risk profile in data
      data.riskProfile = {
        byRiskLevel: {
          high: riskProfile.byRiskLevel.get('high')?.length || 0,
          medium: riskProfile.byRiskLevel.get('medium')?.length || 0,
          low: riskProfile.byRiskLevel.get('low')?.length || 0,
        },
        missingReversibilityPlan: riskProfile.missingReversibilityPlan.length,
        missingRiskAssessment: riskProfile.missingRiskAssessment.length,
      };

      // Generate findings for missing reversibility plans
      for (const decision of riskProfile.missingReversibilityPlan) {
        this.findings.push({
          id: `missing-reversibility-${decision.id || this.findings.length}`,
          category: 'decision_gap',
          severity: 'medium',
          title: 'One-way-door decision missing reversibility plan',
          summary: `High-risk decision lacks rollback strategy: ${(decision.decision || '').slice(0, 100)}`,
          evidence: [`decision:${decision.id || 'unknown'}`],
          recommendation: 'Add reversibility_plan field to document rollback strategy',
          confidence: 'high',
        });
      }

      // Generate findings for missing risk assessments
      if (riskProfile.missingRiskAssessment.length > 0) {
        this.findings.push({
          id: `missing-risk-assessment-${this.findings.length}`,
          category: 'decision_gap',
          severity: 'low',
          title: 'One-way-door decisions missing risk level',
          summary: `${riskProfile.missingRiskAssessment.length} irreversible decisions lack risk_level assessment`,
          evidence: riskProfile.missingRiskAssessment.slice(0, 3).map(d => `decision:${d.id || 'unknown'}`),
          recommendation: 'Add risk_level (high/medium/low) to one-way-door decisions',
          confidence: 'medium',
        });
      }

      // Phase 3.1: Decision thrash detection
      const decisionThrash = decisionAnalyzer.getDecisionThrash();
      for (const thrash of decisionThrash) {
        this.findings.push({
          id: `decision-thrash-${this.findings.length}`,
          category: 'collaboration',
          severity: thrash.severity === 'high' ? 'medium' : 'low',
          title: `Decision thrash detected: ${thrash.topic}`,
          summary: `${thrash.decisions.length} similar decisions made within 7 days - possible indecision or scope confusion`,
          evidence: thrash.decisions.slice(0, 3).map(d => `decision:${d.id || 'unknown'}`),
          recommendation: 'Review decision rationale and consider consolidating approach',
          confidence: 'medium',
        });
      }
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

      // Phase 1: Store full analysis result
      data.toolsAnalysis = {
        totalCalls: toolsAnalysis.totalCalls,
        uniqueTools: toolsAnalysis.uniqueTools,
        toolStats: toolsAnalysis.toolStats,
        errorRate: toolsAnalysis.errorRate,
        avgCallsPerSession: toolsAnalysis.avgCallsPerSession,
      };

      // Add findings from tools analysis with evidence
      for (const finding of toolsAnalysis.findings) {
        this.findings.push({
          id: `tools-${this.findings.length}`,
          category: 'collaboration',
          severity: toolsAnalysis.errorRate > 0.1 ? 'medium' : 'low',
          title: 'Tool Usage Pattern',
          summary: finding,
          evidence: [`inferred:tool-usage-analysis`],
          recommendation: toolsAnalysis.errorRate > 0.1 ? 'Investigate high tool error rate' : undefined,
          confidence: 'medium',
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

        // Phase 3.3: Add bottleneck findings
        const slowMergePRs = githubAnalysis.bottlenecks.filter(b => b.issue === 'slow_merge');
        if (slowMergePRs.length > 0) {
          this.findings.push({
            id: `pr-slow-merge-${this.findings.length}`,
            category: 'collaboration',
            severity: 'medium',
            title: 'PR review bottlenecks detected',
            summary: `${slowMergePRs.length} PRs took more than 48 hours to merge`,
            evidence: slowMergePRs.slice(0, 3).map(b => `pr:${b.pr.number}`),
            recommendation: 'Review team capacity and PR sizes to reduce merge time',
            confidence: 'high',
          });
        }

        const highRevisionPRs = githubAnalysis.bottlenecks.filter(b => b.issue === 'high_revisions');
        if (highRevisionPRs.length > 0) {
          this.findings.push({
            id: `pr-high-revisions-${this.findings.length}`,
            category: 'collaboration',
            severity: 'low',
            title: 'PRs with multiple revision cycles',
            summary: `${highRevisionPRs.length} PRs required more than 3 commits (potential rework)`,
            evidence: highRevisionPRs.slice(0, 3).map(b => `pr:${b.pr.number}`),
            recommendation: 'Consider smaller PRs or more upfront design discussion',
            confidence: 'medium',
          });
        }

        const stalePRs = githubAnalysis.bottlenecks.filter(b => b.issue === 'stale');
        if (stalePRs.length > 0) {
          this.findings.push({
            id: `pr-stale-${this.findings.length}`,
            category: 'collaboration',
            severity: 'medium',
            title: 'Stale pull requests',
            summary: `${stalePRs.length} PRs have been open for more than 7 days`,
            evidence: stalePRs.slice(0, 3).map(b => `pr:${b.pr.number}`),
            recommendation: 'Close or merge stale PRs to maintain flow',
            confidence: 'high',
          });
        }

        // Log review stats
        if (githubAnalysis.reviewStats.totalReviews > 0) {
          this.log(`  Reviews: ${githubAnalysis.reviewStats.totalReviews} total, ${githubAnalysis.reviewStats.avgReviewsPerPR.toFixed(1)} per PR`);
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

    // Phase 3.2: Collect security scan data
    const securityPath = join(logsBasePath, 'security');
    const securityAnalyzer = new SecurityAnalyzer(securityPath);
    const securityResult = securityAnalyzer.analyze();

    if (securityResult.hasScans) {
      data.securityAnalysis = {
        hasScans: true,
        scanTypes: securityResult.scanTypes,
        vulnerabilities: securityResult.vulnerabilities,
        totalVulnerabilities: securityResult.totalVulnerabilities,
        newDepsCount: securityResult.newDepsCount,
      };
      this.log(`  Security: ${securityResult.scanTypes.join(', ')} scans, ${securityResult.totalVulnerabilities} vulnerabilities`);

      // Generate findings for critical/high vulnerabilities
      if (securityResult.vulnerabilities.critical > 0) {
        this.findings.push({
          id: `security-critical-${this.findings.length}`,
          category: 'security',
          severity: 'critical',
          title: 'Critical security vulnerabilities detected',
          summary: `${securityResult.vulnerabilities.critical} critical vulnerabilities require immediate attention`,
          evidence: securityResult.vulnerabilityDetails
            .filter(v => v.severity === 'critical')
            .slice(0, 3)
            .map(v => `vuln:${v.id}`),
          recommendation: 'Run security scan locally and patch affected packages',
          confidence: 'high',
        });
      }

      if (securityResult.vulnerabilities.high > 0) {
        this.findings.push({
          id: `security-high-${this.findings.length}`,
          category: 'security',
          severity: 'medium',
          title: 'High severity vulnerabilities detected',
          summary: `${securityResult.vulnerabilities.high} high severity vulnerabilities should be addressed`,
          evidence: securityResult.vulnerabilityDetails
            .filter(v => v.severity === 'high')
            .slice(0, 3)
            .map(v => `vuln:${v.id}`),
          recommendation: 'Review and update affected dependencies',
          confidence: 'high',
        });
      }
    } else {
      this.addTelemetryGap({
        gap_type: 'missing_security_scans',
        severity: 'medium',
        impact: 'Cannot assess security posture or vulnerability status',
        recommendation: 'Add security scanning: trivy fs . --format json > .logs/security/trivy.json',
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
    const VALID_PREFIXES = ['commit:', 'pr:', 'decision:', 'file:', 'inferred:'];
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

    // Build a short-hash -> full-hash index so `commit:a1b2c3d` (7-12
    // char short hashes) resolves to the full 40-char hash indexed above.
    const shortHashIndex = new Map<string, string>();
    if (data.git?.commits) {
      for (const c of data.git.commits) {
        for (let len = 7; len <= Math.min(12, c.hash.length); len++) {
          shortHashIndex.set(c.hash.slice(0, len), c.hash);
        }
      }
    }

    // Collect evidence_refs with unrecognized prefixes so silent
    // orphaning (the bug reported in #18) surfaces as a stderr warning
    // and a TelemetryGap. stderr (not stdout) is required so --json
    // output stays machine-parseable.
    const unrecognizedRefs: Array<{ decisionId: string; ref: string }> = [];

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
            if (!VALID_PREFIXES.some(p => ref.startsWith(p))) {
              unrecognizedRefs.push({ decisionId: id, ref });
              continue;
            }
            const match = ref.match(/^commit:([0-9a-fA-F]+)/);
            if (match) {
              const resolvedHash = shortHashIndex.get(match[1]) ?? match[1];
              if (map.commits[resolvedHash]) {
                map.commits[resolvedHash].decisions.push(id);
                map.decisions[id].commits.push(resolvedHash);
              }
            }
          }
        }
      }
    }

    if (unrecognizedRefs.length > 0) {
      process.stderr.write(
        `[WARN] ${unrecognizedRefs.length} evidence_ref(s) have unrecognized format and will be orphaned:\n`
      );
      for (const { decisionId, ref } of unrecognizedRefs.slice(0, 5)) {
        process.stderr.write(`  - decision ${decisionId}: "${ref}"\n`);
      }
      if (unrecognizedRefs.length > 5) {
        process.stderr.write(`  ... and ${unrecognizedRefs.length - 5} more\n`);
      }
      process.stderr.write(
        '  Valid formats: commit:<hash>, pr:<number>, decision:<id>, file:<path>, inferred:<reason>\n'
      );
      this.addTelemetryGap({
        gap_type: 'unrecognized_evidence_refs',
        severity: 'medium',
        impact: `${unrecognizedRefs.length} evidence_refs have unrecognized format and will not link to any artifact`,
        recommendation:
          'Use prefixed formats: commit:<hash>, pr:<number>, decision:<id>, file:<path>. See docs/fixing-telemetry-gaps.md.',
      });
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

  private scoreSecurity(data: CollectedData): Score {
    if (!data.securityAnalysis || !data.securityAnalysis.hasScans) {
      return {
        score: null,
        confidence: 'none',
        evidence: [],
        details: 'No security scan data available',
      };
    }

    const { vulnerabilities, totalVulnerabilities, scanTypes } = data.securityAnalysis;
    const evidence: string[] = [`Scans: ${scanTypes.join(', ')}`];

    // Start at 5, reduce based on vulnerabilities
    let score = 5;

    if (vulnerabilities.critical > 0) {
      score = Math.max(1, score - 2);
      evidence.push(`${vulnerabilities.critical} critical vulnerabilities`);
    }

    if (vulnerabilities.high > 0) {
      score = Math.max(1, score - 1);
      evidence.push(`${vulnerabilities.high} high vulnerabilities`);
    }

    if (vulnerabilities.medium > 2) {
      score = Math.max(2, score - 1);
      evidence.push(`${vulnerabilities.medium} medium vulnerabilities`);
    }

    if (totalVulnerabilities === 0) {
      evidence.push('No vulnerabilities found');
    }

    return {
      score,
      confidence: 'high',
      evidence,
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

    // Build git metrics from collected data
    const gitMetrics: GitMetrics | undefined = data.git ? {
      hotspots: data.git.hotspots.map(h => ({
        path: h.path,
        changes: h.changes,
        concernLevel: h.changes >= 5 ? 'high' : h.changes >= 3 ? 'medium' : 'low',
      })),
      filesByExtension: Array.from(data.git.filesByExtension.entries())
        .map(([ext, count]) => ({
          extension: ext,
          count,
          percentage: Math.round((count / Array.from(data.git!.filesByExtension.values()).reduce((a, b) => a + b, 0)) * 100),
        }))
        .sort((a, b) => b.count - a.count),
      totalFilesChanged: Array.from(data.git.filesByExtension.values()).reduce((a, b) => a + b, 0),
    } : undefined;

    // Build tools summary from collected data
    const toolsSummary: ToolsSummary | undefined = data.toolsAnalysis ? {
      totalCalls: data.toolsAnalysis.totalCalls,
      uniqueTools: data.toolsAnalysis.uniqueTools,
      byTool: data.toolsAnalysis.toolStats.map(t => ({
        tool: t.toolName,
        calls: t.count,
        percentage: Math.round((t.count / data.toolsAnalysis!.totalCalls) * 100),
        avgDuration: t.avgDuration,
        successRate: t.successRate,
        errors: t.errors,
      })),
      overallErrorRate: data.toolsAnalysis.errorRate,
      avgCallsPerSession: data.toolsAnalysis.avgCallsPerSession,
    } : undefined;

    // Build decision analysis from collected data
    const decisionAnalysis: DecisionAnalysis | undefined = data.decisions ? {
      byCategory: Array.from(data.decisions.byCategory.entries()).map(([cat, decisions]) => ({
        category: cat,
        count: decisions.length,
        percentage: Math.round((decisions.length / data.decisions!.records.length) * 100),
        decisions: decisions.slice(0, 3).map((d) => (d.decision || d.summary || 'Untitled').slice(0, 50)),
      })),
      byActor: Array.from(data.decisions.byActor.entries()).map(([actor, decisions]) => ({
        actor,
        count: decisions.length,
        percentage: Math.round((decisions.length / data.decisions!.records.length) * 100),
        oneWayDoors: decisions.filter((d) => d.decision_type === 'one_way_door').length,
      })),
      byType: Array.from(data.decisions.byType.entries()).map(([type, decisions]) => ({
        type,
        count: decisions.length,
        percentage: Math.round((decisions.length / data.decisions!.records.length) * 100),
      })),
      escalationCompliance: {
        rate: data.decisions.escalationStats.rate,
        total: data.decisions.escalationStats.total,
        escalated: data.decisions.escalationStats.escalated,
        status: data.decisions.escalationStats.rate === 100 ? 'compliant' :
                data.decisions.escalationStats.rate >= 80 ? 'warning' : 'critical',
      },
    } : undefined;

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
        human_contributors: new Set(data.git?.commits?.map(c => c.author) || []).size - (data.git?.agentContributors || 0),
        agent_contributors: data.git?.agentContributors || 0,
        lines_added: data.git?.totalLinesAdded || 0,
        lines_removed: data.git?.totalLinesRemoved || 0,
        decisions_logged: data.decisions?.records?.length || 0,
        agent_commits: data.git?.agentCommits || 0,
        agent_commit_percentage: data.git?.commits?.length
          ? Math.round((data.git.agentCommits / data.git.commits.length) * 100)
          : 0,
      },
      scores,
      findings: this.findings,
      wins: [],
      risks: [],
      action_items: this.generateActionItems(),
      evidence_map: evidenceMap,
      // Phase 1 additions - surfaced data
      git_metrics: gitMetrics,
      tools_summary: toolsSummary,
      decision_analysis: decisionAnalysis,
      human_insights: data.humanInsights || undefined,
      fix_to_feature_ratio: data.fixToFeatureRatio || undefined,
      metadata: {
        // NOTE: `tool_version` represents the Agentic Retrospective/report tooling version
        // and may intentionally differ from the npm/package.json version.
        // It is bumped when the retrospective behavior or report format changes (e.g. "Phase 1"),
        // regardless of whether a new package version has been published yet.
        tool_version: '0.3.0', // Bumped for Phase 1 data surfacing
        // `schema_version` tracks the JSON schema for RetroReport and is versioned independently
        // from both the package version and `tool_version`.
        schema_version: '1.2', // Bumped for new fields
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

    // Append score snapshot to sprint history (one level above outputDir
    // so a single file spans all sprints).
    this.appendToHistory(report);

    return outputPath;
  }

  private appendToHistory(report: RetroReport): void {
    const historyPath = resolve(this.config.outputDir, '../.retro-history.jsonl');
    const entry: SprintHistoryEntry = {
      sprint_id: report.sprint_id,
      date: report.generated_at,
      scores: report.scores,
      data_completeness: report.data_completeness.percentage,
    };
    try {
      // Ensure parent dir exists (outputDir is created in writeOutputs,
      // but the history file sits one level up which may not yet exist
      // when outputDir itself is a fresh nested path).
      const historyDir = resolve(historyPath, '..');
      mkdirSync(historyDir, { recursive: true });
      appendFileSync(historyPath, JSON.stringify(entry) + '\n', 'utf8');
    } catch (err) {
      // Non-fatal: history is additive; failures should not break the run.
      process.stderr.write(
        `[WARN] Failed to append sprint history to ${historyPath}: ${
          err instanceof Error ? err.message : String(err)
        }\n`
      );
    }
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
    // Phase 1: Surfaced from GitAnalyzer
    hotspots: Array<{ path: string; changes: number }>;
    filesByExtension: Map<string, number>;
    totalLinesAdded: number;
    totalLinesRemoved: number;
    // Phase 2.1: Agent commit detection
    agentCommits: number;
    agentCommitHashes: string[];
    agentContributors: number;
  } | null;
  decisions: {
    records: Array<{
      id?: string;
      decision_type?: string;
      actor?: string;
      category?: string;
      evidence_refs?: string[];
      risk_level?: string;
      reversibility_plan?: string;
      decision?: string;
    }>;
    // Phase 1: Surfaced from DecisionAnalyzer
    byCategory: Map<string, DecisionRecord[]>;
    byActor: Map<string, DecisionRecord[]>;
    byType: Map<string, DecisionRecord[]>;
    escalationStats: { total: number; escalated: number; rate: number };
  } | null;
  // Phase 2.2: Risk profile from DecisionAnalyzer
  riskProfile: {
    byRiskLevel: { high: number; medium: number; low: number };
    missingReversibilityPlan: number;
    missingRiskAssessment: number;
  } | null;
  // Phase 1: Surfaced from ToolsAnalyzer
  toolsAnalysis: {
    totalCalls: number;
    uniqueTools: number;
    toolStats: Array<{
      toolName: string;
      count: number;
      avgDuration: number | null;
      successRate: number;
      errors: string[];
    }>;
    errorRate: number;
    avgCallsPerSession: number;
  } | null;
  agentLogs: unknown[] | null;
  testResults: unknown | null;
  ciResults: unknown | null;
  // Phase 1 additions
  humanInsights: HumanInsights | null;
  fixToFeatureRatio: FixToFeatureRatio | null;
  // Phase 3.2: Security analysis
  securityAnalysis: {
    hasScans: boolean;
    scanTypes: string[];
    vulnerabilities: { critical: number; high: number; medium: number; low: number };
    totalVulnerabilities: number;
    newDepsCount: number;
  } | null;
  // Phase 4.2: Rework analysis
  reworkAnalysis: {
    totalReworkCommits: number;
    reworkPercentage: number;
    totalReworkLines: number;
    avgTimeToFix: number | null;
    filesWithMostRework: Array<{ path: string; reworkCount: number }>;
    chains: Array<{ original: string; fixes: string[]; files: string[] }>;
  } | null;
}

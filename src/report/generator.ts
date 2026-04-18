/**
 * Report generator for the Agentic Retrospective
 *
 * Produces human-readable markdown reports from analysis results
 */

import type { RetroReport, Score, ActionItem, TelemetryGap, GitMetrics, ToolsSummary, DecisionAnalysis } from '../types.js';
import { HumanReportGenerator } from './human-report.js';

export class ReportGenerator {
  private humanReportGenerator: HumanReportGenerator;

  constructor() {
    this.humanReportGenerator = new HumanReportGenerator();
  }

  /**
   * Generate a multi-repo markdown report: one aggregate executive summary
   * followed by per-repo sections (full per-repo markdown rendered under a
   * "## Repository: <label>" header).
   */
  generateMultiRepoMarkdown(
    aggregated: RetroReport,
    perRepo: Array<{ label: string; path: string; report: RetroReport }>
  ): string {
    const sections: string[] = [];

    sections.push(
      `# Multi-Repo Sprint Retrospective: ${aggregated.sprint_id}

**Period**: ${aggregated.period.from} to ${aggregated.period.to}
**Generated**: ${aggregated.generated_at}
**Repos**: ${perRepo.length} (${perRepo.map(r => r.label).join(', ')})
**Data Completeness (avg)**: ${aggregated.data_completeness.percentage}%`
    );

    // Aggregate executive summary
    sections.push(this.generateExecutiveSummary(aggregated));

    // Quick per-repo commit table
    let repoTable = `## Per-Repo Breakdown\n\n| Repo | Commits | Lines +/- | Decisions | Agent commits |\n|------|---------|-----------|-----------|----------------|\n`;
    for (const r of perRepo) {
      const s = r.report.summary;
      repoTable += `| ${r.label} | ${s.commits} | +${s.lines_added}/-${s.lines_removed} | ${s.decisions_logged} | ${s.agent_commits} (${s.agent_commit_percentage}%) |\n`;
    }
    sections.push(repoTable);

    // Aggregate findings + action items (already capped at 5)
    sections.push(this.generateActionItems(aggregated.action_items));

    // Per-repo sections (full reports inline)
    for (const r of perRepo) {
      sections.push(
        `---\n\n## Repository: ${r.label} (\`${r.path}\`)\n\n${this.generateMarkdown(r.report)}`
      );
    }

    return sections.join('\n\n---\n\n');
  }

  /**
   * Generate markdown report from RetroReport
   */
  generateMarkdown(report: RetroReport): string {
    const sections: string[] = [];

    // Header
    sections.push(this.generateHeader(report));

    // TL;DR Quick Summary (Phase 1 addition)
    sections.push(this.humanReportGenerator.generateQuickSummary(report));

    // Executive Summary
    sections.push(this.generateExecutiveSummary(report));

    // Human Partner Insights (Phase 1 addition)
    if (report.human_insights) {
      sections.push(this.humanReportGenerator.generateHumanInsightsSection(report.human_insights));
    }

    // Fix-to-Feature Ratio (Phase 1 addition)
    if (report.fix_to_feature_ratio) {
      sections.push(this.humanReportGenerator.generateFixToFeatureSection(report.fix_to_feature_ratio));
    }

    // Code Hotspots (Phase 1 - surfaced from GitAnalyzer)
    if (report.git_metrics) {
      sections.push(this.generateCodeHotspotsSection(report.git_metrics));
    }

    // Tool Performance (Phase 1 - surfaced from ToolsAnalyzer)
    if (report.tools_summary) {
      sections.push(this.generateToolPerformanceSection(report.tools_summary));
    }

    // Decisions Analysis (Phase 1 - surfaced from DecisionAnalyzer)
    if (report.decision_analysis) {
      sections.push(this.generateDecisionAnalysisSection(report.decision_analysis));
    }

    // GAP-10: What Worked / What Didn't Work
    sections.push(this.generateWhatWorkedSection(report));

    // GAP-11: Mistakes & Corrections (if decisions have that data)
    if (report.decision_analysis) {
      const mistakesSection = this.generateMistakesSection(report);
      if (mistakesSection) {
        sections.push(mistakesSection);
      }
    }

    // Detailed Analysis
    sections.push(this.generateDetailedAnalysis(report));

    // Telemetry Gaps
    if (report.data_completeness.gaps.length > 0) {
      sections.push(this.generateTelemetryGapsSection(report.data_completeness.gaps));
    }

    // Scoring Summary
    sections.push(this.generateScoringSummary(report));

    // Action Items
    sections.push(this.generateActionItems(report.action_items));

    // Footer
    sections.push(this.generateFooter(report));

    return sections.join('\n\n---\n\n');
  }

  private generateHeader(report: RetroReport): string {
    return `# Sprint Retrospective: ${report.sprint_id}

**Period**: ${report.period.from} to ${report.period.to}
**Generated**: ${report.generated_at}
**Data Completeness**: ${report.data_completeness.percentage}% (${this.countSources(report.data_completeness.sources)}/5 sources)`;
  }

  private countSources(sources: Record<string, boolean>): number {
    return Object.values(sources).filter(Boolean).length;
  }

  private generateExecutiveSummary(report: RetroReport): string {
    const { summary, scores } = report;

    let md = `## Executive Summary

### Metrics at a Glance

| Metric | Value |
|--------|-------|
| Commits | ${summary.commits} |
| Contributors | ${summary.contributors} (${summary.human_contributors} human, ${summary.agent_contributors} agent) |
| Lines Changed | +${summary.lines_added.toLocaleString()} / -${summary.lines_removed.toLocaleString()} |
| Decisions Logged | ${summary.decisions_logged} |
| Agent Commits | ${summary.agent_commits} (${summary.agent_commit_percentage}%) |
`;

    // GAP-13: Add PR metrics if available
    if (report.pr_supersession) {
      md += `| PRs Total | ${report.pr_supersession.supersededPRs.length > 0 ? 'See PR analysis' : 'N/A'} |
`;
    }
    if (report.pr_test_coverage) {
      md += `| PRs with Tests | ${report.pr_test_coverage.prsWithTests}/${report.pr_test_coverage.totalPRs} (${report.pr_test_coverage.coverageRate}%) |
`;
    }
    if (report.pr_supersession && report.pr_supersession.supersessionRate > 0) {
      md += `| PR Rework Rate | ${report.pr_supersession.supersessionRate}% |
`;
    }

    // GAP-01: Commit type breakdown
    if (report.git_metrics?.commitTypeBreakdown) {
      const b = report.git_metrics.commitTypeBreakdown;
      md += `| Commit Types | feat:${b.feat} fix:${b.fix} docs:${b.docs} test:${b.test} refactor:${b.refactor} chore:${b.chore} |
`;
    }

    // GAP-03: Reactive/Proactive ratio
    if (report.git_metrics?.workClassification) {
      const w = report.git_metrics.workClassification;
      const ratio = Math.round(w.ratio * 100);
      md += `| Work Balance | ${ratio}% proactive, ${100 - ratio}% reactive |
`;
    }

    // GAP-04: Decision quality
    if (report.decision_analysis?.qualityMetrics) {
      const q = report.decision_analysis.qualityMetrics;
      md += `| Decision Quality | ${q.qualityScore}% (${q.status}) |
`;
    }

    // GAP-08: Testing discipline
    if (report.decision_analysis?.testingDiscipline) {
      const t = report.decision_analysis.testingDiscipline;
      md += `| Testing Discipline | ${t.adherenceRate}% (${t.status}) |
`;
    }

    md += `
### Quality Signals
- Delivery Predictability: ${this.formatScore(scores.delivery_predictability)}
- Quality/Maintainability: ${this.formatScore(scores.quality_maintainability)}
`;

    // Top findings
    md += `
### Top Findings
`;
    if (report.findings.length > 0) {
      for (const finding of report.findings.slice(0, 3)) {
        md += `- **${finding.title}** (${finding.severity}): ${finding.summary}\n`;
      }
    } else {
      md += `- No significant findings detected (may indicate missing data sources)\n`;
    }

    // GAP-12: Updated recommendations format
    const mustDo = report.action_items.filter(a => a.priority === 'must_do');
    if (mustDo.length > 0) {
      md += `
### Top Recommendations

| Area | Current | Target | Action |
|------|---------|--------|--------|
`;
      for (const action of mustDo.slice(0, 3)) {
        md += `| ${this.extractArea(action.action)} | - | - | ${action.action} |\n`;
      }
    }

    return md;
  }

  /**
   * Extract area from action text (first word or category)
   */
  private extractArea(action: string): string {
    const areas = ['testing', 'security', 'quality', 'documentation', 'decision', 'agent', 'collaboration', 'process'];
    const lower = action.toLowerCase();
    for (const area of areas) {
      if (lower.includes(area)) {
        return area.charAt(0).toUpperCase() + area.slice(1);
      }
    }
    return 'General';
  }

  private formatScore(score: Score): string {
    if (score.score === null) {
      return 'N/A (no data)';
    }
    return `${score.score}/5 (${score.confidence} confidence)`;
  }

  private generateDetailedAnalysis(report: RetroReport): string {
    const { scores } = report;

    const md = `## Detailed Analysis

### Delivery & Outcome

${scores.delivery_predictability.evidence.map(e => `- ${e}`).join('\n') || '- No evidence collected'}

**Score**: ${this.formatScore(scores.delivery_predictability)}

### Code Quality & Maintainability

${scores.quality_maintainability.evidence.map(e => `- ${e}`).join('\n') || '- No evidence collected'}

**Score**: ${this.formatScore(scores.quality_maintainability)}

### Test Loop Completeness (Inner Loop)

${scores.test_loop_completeness.evidence.map(e => `- ${e}`).join('\n') || '- No test data available'}

**Score**: ${this.formatScore(scores.test_loop_completeness)}
${scores.test_loop_completeness.details ? `\n*${scores.test_loop_completeness.details}*` : ''}

### Security Posture

${scores.security_posture.evidence.map(e => `- ${e}`).join('\n') || '- No security scan data available'}

**Score**: ${this.formatScore(scores.security_posture)}

### Agent Collaboration

${scores.collaboration_efficiency.evidence.map(e => `- ${e}`).join('\n') || '- No agent logs available'}

**Score**: ${this.formatScore(scores.collaboration_efficiency)}

### Decision Hygiene

${scores.decision_hygiene.evidence.map(e => `- ${e}`).join('\n') || '- No decision logs available'}

**Score**: ${this.formatScore(scores.decision_hygiene)}
`;

    return md;
  }

  private generateCodeHotspotsSection(metrics: GitMetrics): string {
    let md = `## Code Hotspots

Files changed 3+ times this sprint (high churn may indicate architectural issues):

`;

    if (metrics.hotspots.length === 0) {
      md += `*No hotspots detected - files are being changed at a healthy frequency.*\n`;
    } else {
      md += `| File | Changes | Concern Level |
|------|---------|---------------|
`;
      for (const hotspot of metrics.hotspots.slice(0, 10)) {
        const concernEmoji = hotspot.concernLevel === 'high' ? '**High**' :
                            hotspot.concernLevel === 'medium' ? 'Medium' : 'Low';
        md += `| \`${hotspot.path}\` | ${hotspot.changes} | ${concernEmoji} |\n`;
      }
    }

    md += `
### File Distribution

| Extension | Files Changed | % of Total |
|-----------|---------------|------------|
`;
    for (const ext of metrics.filesByExtension.slice(0, 8)) {
      md += `| ${ext.extension} | ${ext.count} | ${ext.percentage}% |\n`;
    }

    return md;
  }

  private generateToolPerformanceSection(summary: ToolsSummary): string {
    let md = `## Tool Performance

| Tool | Calls | % | Avg Duration | Success Rate | Top Error |
|------|-------|---|--------------|--------------|-----------|
`;

    for (const tool of summary.byTool.slice(0, 8)) {
      const avgDuration = tool.avgDuration !== null ? `${(tool.avgDuration / 1000).toFixed(2)}s` : '-';
      const successPct = `${Math.round(tool.successRate * 100)}%`;
      const topError = tool.errors.length > 0 ? tool.errors[0].slice(0, 30) : '-';
      md += `| ${tool.tool} | ${tool.calls} | ${tool.percentage}% | ${avgDuration} | ${successPct} | ${topError} |\n`;
    }

    md += `
**Overall**: ${summary.totalCalls} tool calls, ${Math.round((1 - summary.overallErrorRate) * 100)}% success rate, ${summary.avgCallsPerSession.toFixed(1)} avg calls/session
`;

    if (summary.overallErrorRate > 0.1) {
      md += `\n⚠️ **High error rate** (${Math.round(summary.overallErrorRate * 100)}%) - investigate tool failures\n`;
    }

    return md;
  }

  private generateDecisionAnalysisSection(analysis: DecisionAnalysis): string {
    let md = `## Decisions Analysis

### By Category

| Category | Count | % | Key Decisions |
|----------|-------|---|---------------|
`;

    for (const cat of analysis.byCategory) {
      const decisions = cat.decisions.join(', ').slice(0, 50);
      md += `| ${cat.category} | ${cat.count} | ${cat.percentage}% | ${decisions}${decisions.length >= 50 ? '...' : ''} |\n`;
    }

    md += `
### By Actor

| Actor | Decisions | % | One-Way-Doors |
|-------|-----------|---|---------------|
`;

    for (const actor of analysis.byActor) {
      md += `| ${actor.actor} | ${actor.count} | ${actor.percentage}% | ${actor.oneWayDoors} |\n`;
    }

    md += `
### Escalation Compliance
`;

    const statusEmoji = analysis.escalationCompliance.status === 'compliant' ? '✅' :
                       analysis.escalationCompliance.status === 'warning' ? '⚠️' : '❌';

    md += `${statusEmoji} **${Math.round(analysis.escalationCompliance.rate)}% escalation rate** - `;
    md += `${analysis.escalationCompliance.escalated}/${analysis.escalationCompliance.total} one-way-door decisions made by humans\n`;

    if (analysis.escalationCompliance.status === 'critical') {
      md += `\n**CRITICAL**: One-way-door decisions are being made by agents without human approval. This violates decision hygiene principles.\n`;
    }

    if (analysis.riskProfile) {
      md += `
### Risk Profile

| Risk Level | Count | Missing Reversibility Plan |
|------------|-------|---------------------------|
| High | ${analysis.riskProfile.high} | ${analysis.riskProfile.missingReversibilityPlan.length > 0 ? '⚠️' : '✅'} |
| Medium | ${analysis.riskProfile.medium} | - |
| Low | ${analysis.riskProfile.low} | - |
`;
    }

    return md;
  }

  private generateTelemetryGapsSection(gaps: TelemetryGap[]): string {
    let md = `## Telemetry Gaps

The following data sources were missing, limiting analysis depth:

`;

    for (const gap of gaps) {
      md += `### ${this.formatGapType(gap.gap_type)}

**Severity**: ${gap.severity}
**Impact**: ${gap.impact}

**How to fix**:
\`\`\`bash
${gap.recommendation}
\`\`\`

`;
    }

    md += `For detailed instructions, see \`docs/fixing-telemetry-gaps.md\``;

    return md;
  }

  private formatGapType(gapType: string): string {
    return gapType
      .replace(/_/g, ' ')
      .replace(/\b\w/g, c => c.toUpperCase());
  }

  private generateScoringSummary(report: RetroReport): string {
    const { scores } = report;

    return `## Scoring Summary

| Dimension | Score | Confidence | Key Evidence |
|-----------|-------|------------|--------------|
| Delivery Predictability | ${scores.delivery_predictability.score ?? 'N/A'}/5 | ${scores.delivery_predictability.confidence} | ${scores.delivery_predictability.evidence[0] || '-'} |
| Test Loop Completeness | ${scores.test_loop_completeness.score ?? 'N/A'}/5 | ${scores.test_loop_completeness.confidence} | ${scores.test_loop_completeness.evidence[0] || '-'} |
| Quality/Maintainability | ${scores.quality_maintainability.score ?? 'N/A'}/5 | ${scores.quality_maintainability.confidence} | ${scores.quality_maintainability.evidence[0] || '-'} |
| Security Posture | ${scores.security_posture.score ?? 'N/A'}/5 | ${scores.security_posture.confidence} | ${scores.security_posture.evidence[0] || '-'} |
| Collaboration Efficiency | ${scores.collaboration_efficiency.score ?? 'N/A'}/5 | ${scores.collaboration_efficiency.confidence} | ${scores.collaboration_efficiency.evidence[0] || '-'} |
| Decision Hygiene | ${scores.decision_hygiene.score ?? 'N/A'}/5 | ${scores.decision_hygiene.confidence} | ${scores.decision_hygiene.evidence[0] || '-'} |

**Overall Sprint Health**: ${this.calculateOverallHealth(scores)}`;
  }

  private calculateOverallHealth(scores: RetroReport['scores']): string {
    const validScores = [
      scores.delivery_predictability.score,
      scores.test_loop_completeness.score,
      scores.quality_maintainability.score,
      scores.security_posture.score,
      scores.collaboration_efficiency.score,
      scores.decision_hygiene.score,
    ].filter((s): s is number => s !== null);

    if (validScores.length === 0) {
      return 'UNKNOWN (insufficient data)';
    }

    const avg = validScores.reduce((a, b) => a + b, 0) / validScores.length;

    if (avg >= 4) return 'EXCELLENT';
    if (avg >= 3) return 'GOOD';
    if (avg >= 2) return 'NEEDS ATTENTION';
    return 'AT RISK';
  }

  private generateActionItems(items: ActionItem[]): string {
    const mustDo = items.filter(i => i.priority === 'must_do');
    const nextSprint = items.filter(i => i.priority === 'next_sprint');
    const backlog = items.filter(i => i.priority === 'backlog');

    let md = `## Action Items

### Must Do (This Sprint)

`;

    if (mustDo.length === 0) {
      md += `*No critical actions identified*\n`;
    } else {
      // GAP-12: Updated recommendation format
      md += `| Area | Current | Target | Action | Owner |
|------|---------|--------|--------|-------|
`;
      for (const item of mustDo) {
        const area = this.extractArea(item.action);
        md += `| ${area} | - | ${item.success_metric} | ${item.action} | ${item.owner || 'TBD'} |\n`;
      }
    }

    md += `
### Next Sprint

`;

    if (nextSprint.length === 0) {
      md += `*No deferred actions*\n`;
    } else {
      md += `| Area | Current | Target | Action | Owner |
|------|---------|--------|--------|-------|
`;
      for (const item of nextSprint) {
        const area = this.extractArea(item.action);
        md += `| ${area} | - | ${item.success_metric} | ${item.action} | ${item.owner || 'TBD'} |\n`;
      }
    }

    if (backlog.length > 0) {
      md += `
### Backlog

| Area | Action | Priority |
|------|--------|----------|
`;
      for (const item of backlog) {
        const area = this.extractArea(item.action);
        md += `| ${area} | ${item.action} | Low |\n`;
      }
    }

    return md;
  }

  private generateFooter(report: RetroReport): string {
    return `*Generated by \`agentic-retrospective\` - Agentic Retrospective*
*Tool version: ${report.metadata.tool_version}*
*Report schema: ${report.metadata.schema_version}*`;
  }

  /**
   * GAP-10: Generate What Worked / What Didn't Work section
   * Thresholds: > 70% = WORKED, < 50% = DIDN'T WORK, 50-70% = NEEDS ATTENTION
   */
  private generateWhatWorkedSection(report: RetroReport): string {
    const worked: Array<{ area: string; value: number; evidence: string }> = [];
    const didntWork: Array<{ area: string; value: number; evidence: string }> = [];
    const needsAttention: Array<{ area: string; value: number; evidence: string }> = [];

    // Check decision quality
    if (report.decision_analysis?.qualityMetrics) {
      const q = report.decision_analysis.qualityMetrics;
      const item = { area: 'Decision Quality', value: q.qualityScore, evidence: `${q.decisionsWithBoth}/${q.totalDecisions} decisions have rationale and context` };
      if (q.qualityScore >= 70) worked.push(item);
      else if (q.qualityScore < 50) didntWork.push(item);
      else needsAttention.push(item);
    }

    // Check testing discipline
    if (report.decision_analysis?.testingDiscipline) {
      const t = report.decision_analysis.testingDiscipline;
      const item = { area: 'Testing Discipline', value: t.adherenceRate, evidence: `${t.decisionsWithTesting}/${t.totalDecisions} decisions reference testing` };
      if (t.adherenceRate >= 70) worked.push(item);
      else if (t.adherenceRate < 50) didntWork.push(item);
      else needsAttention.push(item);
    }

    // Check PR test coverage
    if (report.pr_test_coverage) {
      const p = report.pr_test_coverage;
      const item = { area: 'PR Test Coverage', value: p.coverageRate, evidence: `${p.prsWithTests}/${p.totalPRs} PRs include test files` };
      if (p.coverageRate >= 70) worked.push(item);
      else if (p.coverageRate < 50) didntWork.push(item);
      else needsAttention.push(item);
    }

    // Check escalation compliance
    if (report.decision_analysis?.escalationCompliance) {
      const e = report.decision_analysis.escalationCompliance;
      const item = { area: 'Escalation Compliance', value: e.rate, evidence: `${e.escalated}/${e.total} one-way-doors escalated to humans` };
      if (e.rate >= 70) worked.push(item);
      else if (e.rate < 50) didntWork.push(item);
      else needsAttention.push(item);
    }

    // Check proactive work ratio
    if (report.git_metrics?.workClassification) {
      const w = report.git_metrics.workClassification;
      const ratio = Math.round(w.ratio * 100);
      const item = { area: 'Proactive Work', value: ratio, evidence: `${w.proactive} proactive vs ${w.reactive} reactive commits` };
      if (ratio >= 70) worked.push(item);
      else if (ratio < 50) didntWork.push(item);
      else needsAttention.push(item);
    }

    // Check negative review rate (inverse - lower is better)
    if (report.pr_review_analysis) {
      const n = report.pr_review_analysis;
      // For negative reviews, we invert: >30% negative is bad, <10% is good
      const successRate = 100 - n.negativeReviewRate;
      const item = { area: 'PR Review Quality', value: successRate, evidence: `${n.prsWithNegativeReviews}/${n.totalReviewedPRs} PRs had change requests` };
      if (n.negativeReviewRate < 30) worked.push(item);
      else if (n.negativeReviewRate > 50) didntWork.push(item);
      else needsAttention.push(item);
    }

    let md = `## What Worked / What Didn't

`;

    if (worked.length > 0) {
      md += `### What Worked Well

| Area | Score | Evidence |
|------|-------|----------|
`;
      for (const item of worked) {
        md += `| ${item.area} | ${item.value}% | ${item.evidence} |
`;
      }
      md += '\n';
    }

    if (didntWork.length > 0) {
      md += `### What Didn't Work

| Area | Score | Evidence | Recommendation |
|------|-------|----------|----------------|
`;
      for (const item of didntWork) {
        md += `| ${item.area} | ${item.value}% | ${item.evidence} | Improve ${item.area.toLowerCase()} processes |
`;
      }
      md += '\n';
    }

    if (needsAttention.length > 0) {
      md += `### Needs Attention

| Area | Score | Evidence |
|------|-------|----------|
`;
      for (const item of needsAttention) {
        md += `| ${item.area} | ${item.value}% | ${item.evidence} |
`;
      }
    }

    if (worked.length === 0 && didntWork.length === 0 && needsAttention.length === 0) {
      md += `*Insufficient data to evaluate. Ensure decision logs and PR data are available.*`;
    }

    return md;
  }

  /**
   * GAP-11: Generate Mistakes & Corrections section
   * Extracts decisions that have mistake or correction fields
   */
  private generateMistakesSection(report: RetroReport): string | null {
    // This would need decisions with mistake/correction fields
    // For now, extract from evidence_map.decisions or findings that indicate corrections
    const corrections: Array<{
      decision: string;
      mistake: string;
      correction: string;
      timeToCorrect: string;
    }> = [];

    // Check findings for correction patterns
    for (const finding of report.findings) {
      if (finding.category === 'scope_drift' || finding.title.toLowerCase().includes('correction') || finding.title.toLowerCase().includes('revert')) {
        corrections.push({
          decision: finding.title,
          mistake: finding.summary,
          correction: finding.recommendation || 'See finding details',
          timeToCorrect: 'Within sprint',
        });
      }
    }

    // Check for PR supersession chains as mistakes
    if (report.pr_supersession && report.pr_supersession.chains.length > 0) {
      for (const chain of report.pr_supersession.chains) {
        if (chain.length >= 2) {
          corrections.push({
            decision: `PR #${chain[0]}`,
            mistake: `Superseded ${chain.length - 1} time(s)`,
            correction: `Final PR #${chain[chain.length - 1]}`,
            timeToCorrect: `${chain.length - 1} iterations`,
          });
        }
      }
    }

    if (corrections.length === 0) {
      return null; // Don't show section if no corrections
    }

    let md = `## Mistakes & Corrections

| Decision | Mistake | Correction | Time to Correct |
|----------|---------|------------|-----------------|
`;

    for (const c of corrections.slice(0, 10)) {
      md += `| ${c.decision} | ${c.mistake} | ${c.correction} | ${c.timeToCorrect} |
`;
    }

    return md;
  }
}

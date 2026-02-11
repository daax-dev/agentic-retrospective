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

### What Was Delivered
- ${summary.commits} commits by ${summary.contributors} contributor(s)
- ${summary.lines_added.toLocaleString()} lines added, ${summary.lines_removed.toLocaleString()} lines removed
`;

    if (summary.decisions_logged > 0) {
      md += `- ${summary.decisions_logged} decisions documented\n`;
    }

    md += `
### Quality Signals
- Delivery Predictability: ${this.formatScore(scores.delivery_predictability)}
- Quality/Maintainability: ${this.formatScore(scores.quality_maintainability)}
`;

    // Top wins (from findings marked as positive)
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

    // Recommendations
    const mustDo = report.action_items.filter(a => a.priority === 'must_do');
    if (mustDo.length > 0) {
      md += `
### Top Recommendations
`;
      for (const action of mustDo.slice(0, 3)) {
        md += `1. **${action.action}** - ${action.rationale}\n`;
      }
    }

    return md;
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
      md += `| Action | Why | Owner | Success Metric |
|--------|-----|-------|----------------|
`;
      for (const item of mustDo) {
        md += `| ${item.action} | ${item.rationale} | ${item.owner || 'TBD'} | ${item.success_metric} |\n`;
      }
    }

    md += `
### Next Sprint

`;

    if (nextSprint.length === 0) {
      md += `*No deferred actions*\n`;
    } else {
      md += `| Action | Why | Owner | Success Metric |
|--------|-----|-------|----------------|
`;
      for (const item of nextSprint) {
        md += `| ${item.action} | ${item.rationale} | ${item.owner || 'TBD'} | ${item.success_metric} |\n`;
      }
    }

    if (backlog.length > 0) {
      md += `
### Backlog

| Action | Why | Priority |
|--------|-----|----------|
`;
      for (const item of backlog) {
        md += `| ${item.action} | ${item.rationale} | Low |\n`;
      }
    }

    return md;
  }

  private generateFooter(report: RetroReport): string {
    return `*Generated by \`agentic-retrospective\` - Agentic Retrospective*
*Tool version: ${report.metadata.tool_version}*
*Report schema: ${report.metadata.schema_version}*`;
  }
}

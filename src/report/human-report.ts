/**
 * Human Improvement Report Generator
 *
 * Generates the "Human Partner Insights" section of the retrospective
 * focusing on prompt patterns, intervention timing, and CLAUDE.md suggestions.
 *
 * Part of Phase 1: Foundation improvements
 */

import type { HumanInsights, FixToFeatureRatio, RetroReport } from '../types.js';

export class HumanReportGenerator {
  /**
   * Generate the Human Partner Insights section
   */
  generateHumanInsightsSection(insights: HumanInsights): string {
    const sections: string[] = [];

    sections.push('## 🧑 Human Partner Insights\n');

    // Feedback Summary
    if (insights.feedbackSummary.totalSessions > 0) {
      sections.push(this.generateFeedbackSummary(insights.feedbackSummary));
    }

    // Effective Patterns
    if (insights.promptPatterns.effective.length > 0) {
      sections.push(this.generateEffectivePatterns(insights.promptPatterns.effective));
    }

    // Problematic Patterns
    if (insights.promptPatterns.problematic.length > 0) {
      sections.push(this.generateProblematicPatterns(insights.promptPatterns.problematic));
    }

    // Top Successes
    if (insights.topSuccesses.length > 0) {
      sections.push(this.generateTopSuccesses(insights.topSuccesses));
    }

    // CLAUDE.md Suggestions
    if (insights.claudeMdSuggestions.length > 0) {
      sections.push(this.generateClaudeMdSuggestions(insights.claudeMdSuggestions));
    }

    // Top Improvements
    if (insights.topImprovements.length > 0) {
      sections.push(this.generateTopImprovements(insights.topImprovements));
    }

    if (sections.length === 1) {
      sections.push('*No human feedback data available. Run `micro-retrospective.sh` after sessions to capture insights.*\n');
    }

    return sections.join('\n');
  }

  private generateFeedbackSummary(summary: HumanInsights['feedbackSummary']): string {
    const totalRework = summary.reworkDistribution.none +
      summary.reworkDistribution.minor +
      summary.reworkDistribution.significant;

    const nonePercent = totalRework > 0
      ? Math.round((summary.reworkDistribution.none / totalRework) * 100)
      : 0;
    const minorPercent = totalRework > 0
      ? Math.round((summary.reworkDistribution.minor / totalRework) * 100)
      : 0;
    const significantPercent = totalRework > 0
      ? Math.round((summary.reworkDistribution.significant / totalRework) * 100)
      : 0;

    let alignmentEmoji = '🟡';
    if (summary.avgAlignment >= 4) alignmentEmoji = '🟢';
    else if (summary.avgAlignment < 3) alignmentEmoji = '🔴';

    return `### Session Feedback Summary

| Metric | Value |
|--------|-------|
| Sessions Tracked | ${summary.totalSessions} |
| Avg Alignment | ${alignmentEmoji} ${summary.avgAlignment.toFixed(1)}/5 |
| Avg Revision Cycles | ${summary.avgRevisionCycles.toFixed(1)} |
| Rework: None | ${nonePercent}% (${summary.reworkDistribution.none}) |
| Rework: Minor | ${minorPercent}% (${summary.reworkDistribution.minor}) |
| Rework: Significant | ${significantPercent}% (${summary.reworkDistribution.significant}) |
`;
  }

  private generateEffectivePatterns(patterns: HumanInsights['promptPatterns']['effective']): string {
    let md = '### Prompt Patterns That Worked Well ✅\n\n';

    for (let i = 0; i < patterns.length; i++) {
      const p = patterns[i];
      md += `${i + 1}. **${p.description}**`;
      if (p.avgAlignmentScore > 0) {
        md += ` - Avg alignment: ${p.avgAlignmentScore.toFixed(1)}/5`;
      }
      md += '\n';
      if (p.examples.length > 0) {
        md += `   - Example: "${p.examples[0]}"\n`;
      }
      if (p.recommendation) {
        md += `   - ${p.recommendation}\n`;
      }
      md += '\n';
    }

    return md;
  }

  private generateProblematicPatterns(patterns: HumanInsights['promptPatterns']['problematic']): string {
    let md = '### Prompt Patterns That Caused Issues ⚠️\n\n';

    for (let i = 0; i < patterns.length; i++) {
      const p = patterns[i];
      md += `${i + 1}. **${p.description}**`;
      if (p.avgReworkLevel > 0) {
        const reworkLabel = p.avgReworkLevel < 0.5 ? 'low rework'
          : p.avgReworkLevel < 1.5 ? 'minor rework'
          : 'significant rework';
        md += ` - Led to ${reworkLabel}`;
      }
      md += ` (${p.frequency} occurrences)\n`;
      if (p.examples.length > 0) {
        md += `   - Example: "${p.examples[0]}"\n`;
      }
      if (p.recommendation) {
        md += `   - **Improvement**: ${p.recommendation}\n`;
      }
      md += '\n';
    }

    return md;
  }

  private generateTopSuccesses(successes: string[]): string {
    let md = '### What Worked Well 🎉\n\n';
    for (const success of successes) {
      md += `- ${success}\n`;
    }
    md += '\n';
    return md;
  }

  private generateClaudeMdSuggestions(suggestions: string[]): string {
    let md = '### Recommended CLAUDE.md Updates 📝\n\n';
    md += 'Based on this sprint, consider adding to your CLAUDE.md:\n\n';
    md += '```markdown\n';
    md += '## Prompting Preferences\n';
    for (const suggestion of suggestions) {
      md += `${suggestion}\n`;
    }
    md += '```\n\n';
    return md;
  }

  private generateTopImprovements(improvements: string[]): string {
    let md = '### Areas for Improvement 🔧\n\n';
    md += '*From session feedback:*\n\n';
    for (const improvement of improvements) {
      md += `- ${improvement}\n`;
    }
    md += '\n';
    return md;
  }

  /**
   * Generate the Fix-to-Feature Ratio section
   */
  generateFixToFeatureSection(ratio: FixToFeatureRatio): string {
    let md = '### Fix-to-Feature Ratio 📊\n\n';

    const ratioDisplay = ratio.featureCommits > 0
      ? `${ratio.fixCommits}:${ratio.featureCommits}`
      : (ratio.fixCommits > 0 ? `${ratio.fixCommits}:0` : '0:0');

    const healthEmoji = ratio.isHealthy ? '🟢' : '🔴';
    const healthLabel = ratio.isHealthy ? 'Healthy' : 'Needs Attention';

    md += `| Metric | Value |\n`;
    md += `|--------|-------|\n`;
    md += `| Fix Commits | ${ratio.fixCommits} |\n`;
    md += `| Feature Commits | ${ratio.featureCommits} |\n`;
    md += `| Ratio (fix:feature) | ${ratioDisplay} |\n`;
    md += `| Status | ${healthEmoji} ${healthLabel} |\n`;
    // Calculate the healthy ratio display dynamically from threshold, with bounds
    const healthyRatio = (ratio.threshold > 0 && Number.isFinite(ratio.threshold))
      ? Math.min(100, Math.max(1, Math.round(1 / ratio.threshold)))
      : 10;
    md += `| Threshold | ${ratio.threshold} (${healthyRatio}:1 feature-to-fix is healthy) |\n`;
    md += '\n';

    if (!ratio.isHealthy) {
      md += `> ⚠️ **High fix ratio detected.** This may indicate:\n`;
      md += `> - Unclear initial requirements leading to rework\n`;
      md += `> - Complex features needing iteration\n`;
      md += `> - Technical debt accumulation\n\n`;
    }

    return md;
  }

  /**
   * Generate TL;DR Quick Summary with Phase 1 metrics
   */
  generateQuickSummary(report: RetroReport): string {
    const scores = report.scores;
    const healthy: string[] = [];
    const attention: string[] = [];
    const actionReq: string[] = [];

    // Categorize scores
    const scoreEntries: Array<[string, number | null]> = [
      ['Decision Hygiene', scores.decision_hygiene.score],
      ['Delivery', scores.delivery_predictability.score],
      ['Test Coverage', scores.test_loop_completeness.score],
      ['Collaboration', scores.collaboration_efficiency.score],
      ['Quality', scores.quality_maintainability.score],
      ['Security', scores.security_posture.score],
    ];

    for (const [name, score] of scoreEntries) {
      if (score === null) continue;
      if (score >= 4) healthy.push(`${name} (${score}/5)`);
      else if (score >= 3) attention.push(`${name} (${score}/5)`);
      else actionReq.push(`${name} (${score}/5)`);
    }

    let md = '## ⚡ TL;DR (30 seconds)\n\n';
    md += '```\n';
    md += '┌─────────────────────────────────────────────────────────────┐\n';

    if (healthy.length > 0) {
      md += `│ 🟢 HEALTHY    │ ${healthy.join(', ').padEnd(42)} │\n`;
    }
    if (attention.length > 0) {
      md += `│ 🟡 ATTENTION  │ ${attention.join(', ').padEnd(42)} │\n`;
    }
    if (actionReq.length > 0) {
      md += `│ 🔴 ACTION REQ │ ${actionReq.join(', ').padEnd(42)} │\n`;
    }

    md += '├─────────────────────────────────────────────────────────────┤\n';

    // Add fix-to-feature ratio if available
    // Note: Emoji takes ~2 display columns but 1-2 JS chars, so we pad content separately
    if (report.fix_to_feature_ratio) {
      const ratio = report.fix_to_feature_ratio;
      const ratioStr = `${ratio.fixCommits}:${ratio.featureCommits} fix-to-feature ratio`;
      const emoji = ratio.isHealthy ? '📊' : '⚠️';
      md += `│ ${emoji} ${ratioStr.padEnd(55)} │\n`;
    }

    // Add average alignment if available
    if (report.human_insights && report.human_insights.feedbackSummary.totalSessions > 0) {
      const avg = report.human_insights.feedbackSummary.avgAlignment;
      const revCycles = report.human_insights.feedbackSummary.avgRevisionCycles;
      const alignmentStr = `${avg.toFixed(1)}/5 avg alignment, ${revCycles.toFixed(1)} avg revision cycles`;
      md += `│ 🎯 ${alignmentStr.padEnd(55)} │\n`;
    }

    // Quick wins count
    const mustDoCount = report.action_items.filter(a => a.priority === 'must_do').length;
    if (mustDoCount > 0) {
      const quickWinsStr = `${mustDoCount} quick wins identified`;
      md += `│ 🎯 ${quickWinsStr.padEnd(55)} │\n`;
    }

    md += '└─────────────────────────────────────────────────────────────┘\n';
    md += '```\n\n';

    return md;
  }
}

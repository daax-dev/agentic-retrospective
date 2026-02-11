"""Report generator for agentic retrospective markdown output.

This module contains the ReportGenerator and HumanReportGenerator classes
that transform RetroReport data into formatted markdown reports suitable
for human review and action planning.
"""

from datetime import datetime
from typing import Literal

from ..models import (
    ActionItem,
    FixToFeatureRatio,
    HumanInsights,
    RetroReport,
    Score,
    TelemetryGap,
)


class HumanReportGenerator:
    """Generator for human-focused report sections.

    Produces markdown sections for human insights, fix-to-feature ratios,
    and quick summary views that highlight actionable information.
    """

    def generate_human_insights_section(self, insights: HumanInsights) -> str:
        """Generate the human insights section of the report.

        Includes feedback summary, effective and problematic patterns,
        top successes, CLAUDE.md suggestions, and top improvements.

        Args:
            insights: HumanInsights data to render.

        Returns:
            Formatted markdown string for the human insights section.
        """
        sections: list[str] = []
        sections.append("## Human Insights")
        sections.append("")

        # Feedback Summary table
        sections.append("### Feedback Summary")
        sections.append("")
        feedback = insights.feedback_summary
        sections.append("| Metric | Value |")
        sections.append("|--------|-------|")
        sections.append(f"| Average Alignment | {feedback.avg_alignment:.2f}/5 |")
        sections.append(f"| Total Sessions | {feedback.total_sessions} |")
        sections.append(
            f"| Rework Distribution | None: {feedback.rework_distribution.none}, "
            f"Minor: {feedback.rework_distribution.minor}, "
            f"Significant: {feedback.rework_distribution.significant} |"
        )
        sections.append(f"| Avg Revision Cycles | {feedback.avg_revision_cycles:.2f} |")
        sections.append("")

        # Effective Patterns section
        if insights.prompt_patterns.effective:
            sections.append("### Effective Patterns")
            sections.append("")
            for pattern in insights.prompt_patterns.effective:
                sections.append(f"**{pattern.pattern}** ({pattern.frequency} occurrences)")
                sections.append(f"- {pattern.description}")
                sections.append(
                    f"- Avg Alignment: {pattern.avg_alignment_score:.2f}, "
                    f"Avg Rework: {pattern.avg_rework_level:.2f}"
                )
                if pattern.recommendation:
                    sections.append(f"- Recommendation: {pattern.recommendation}")
                if pattern.examples:
                    sections.append("- Examples:")
                    for example in pattern.examples[:3]:
                        # Truncate long examples
                        display_example = (
                            example[:100] + "..." if len(example) > 100 else example
                        )
                        sections.append(f"  - `{display_example}`")
                sections.append("")

        # Problematic Patterns section
        if insights.prompt_patterns.problematic:
            sections.append("### Problematic Patterns")
            sections.append("")
            for pattern in insights.prompt_patterns.problematic:
                sections.append(f"**{pattern.pattern}** ({pattern.frequency} occurrences)")
                sections.append(f"- {pattern.description}")
                sections.append(
                    f"- Avg Alignment: {pattern.avg_alignment_score:.2f}, "
                    f"Avg Rework: {pattern.avg_rework_level:.2f}"
                )
                if pattern.recommendation:
                    sections.append(f"- Recommendation: {pattern.recommendation}")
                if pattern.examples:
                    sections.append("- Examples:")
                    for example in pattern.examples[:3]:
                        display_example = (
                            example[:100] + "..." if len(example) > 100 else example
                        )
                        sections.append(f"  - `{display_example}`")
                sections.append("")

        # Top Successes section
        if insights.top_successes:
            sections.append("### Top Successes")
            sections.append("")
            for i, success in enumerate(insights.top_successes, 1):
                sections.append(f"{i}. {success}")
            sections.append("")

        # CLAUDE.md Suggestions code block
        if insights.claude_md_suggestions:
            sections.append("### CLAUDE.md Suggestions")
            sections.append("")
            sections.append("```markdown")
            sections.append("# Suggested additions to CLAUDE.md:")
            sections.append("")
            for suggestion in insights.claude_md_suggestions:
                sections.append(f"- {suggestion}")
            sections.append("```")
            sections.append("")

        # Top Improvements section
        if insights.top_improvements:
            sections.append("### Top Improvements")
            sections.append("")
            for i, improvement in enumerate(insights.top_improvements, 1):
                sections.append(f"{i}. {improvement}")
            sections.append("")

        return "\n".join(sections)

    def generate_fix_to_feature_section(self, ratio: FixToFeatureRatio) -> str:
        """Generate the fix-to-feature ratio section.

        Displays a table with fix/feature counts, ratio, health status,
        and threshold. Shows a warning if the ratio is unhealthy.

        Args:
            ratio: FixToFeatureRatio data to render.

        Returns:
            Formatted markdown string for the fix-to-feature section.
        """
        sections: list[str] = []
        sections.append("## Fix-to-Feature Ratio")
        sections.append("")

        # Table with fix/feature counts, ratio, status, threshold
        status = "Healthy" if ratio.is_healthy else "Unhealthy"
        status_emoji = "" if ratio.is_healthy else " (Warning)"

        sections.append("| Metric | Value |")
        sections.append("|--------|-------|")
        sections.append(f"| Fix Commits | {ratio.fix_commits} |")
        sections.append(f"| Feature Commits | {ratio.feature_commits} |")

        # Handle infinity ratio
        if ratio.ratio == float("inf"):
            ratio_display = "N/A (no features)"
        else:
            ratio_display = f"{ratio.ratio:.2f}"

        sections.append(f"| Ratio | {ratio_display} |")
        sections.append(f"| Status | {status}{status_emoji} |")
        sections.append(f"| Threshold | {ratio.threshold:.2f} |")
        sections.append("")

        # Warning if unhealthy
        if not ratio.is_healthy:
            sections.append("> **Warning**: The fix-to-feature ratio exceeds the healthy threshold.")
            sections.append("> This may indicate:")
            sections.append("> - High bug rate in recent features")
            sections.append("> - Technical debt accumulation")
            sections.append("> - Need for improved testing or code review")
            sections.append("")

        return "\n".join(sections)

    def generate_quick_summary(self, report: RetroReport) -> str:
        """Generate a quick TL;DR summary box.

        Creates an ASCII box with high-level health indicators,
        categorization (Healthy/Attention/ActionReq), fix-to-feature ratio,
        and average alignment if available.

        Args:
            report: Full RetroReport to summarize.

        Returns:
            Formatted markdown string with the quick summary box.
        """
        sections: list[str] = []
        sections.append("## TL;DR")
        sections.append("")

        # Calculate overall health
        healthy_count = 0
        attention_count = 0
        action_required_count = 0
        total_scored = 0

        score_attrs = [
            "delivery_predictability",
            "test_loop_completeness",
            "quality_maintainability",
            "security_posture",
            "collaboration_efficiency",
            "decision_hygiene",
        ]

        for attr in score_attrs:
            score: Score = getattr(report.scores, attr)
            if score.score is not None:
                total_scored += 1
                if score.score >= 4:
                    healthy_count += 1
                elif score.score >= 3:
                    attention_count += 1
                else:
                    action_required_count += 1

        # Build the summary box
        sections.append("```")
        sections.append("+------------------------------------------+")
        sections.append("|           SPRINT HEALTH SUMMARY          |")
        sections.append("+------------------------------------------+")

        if total_scored > 0:
            sections.append(f"|  Healthy:      {healthy_count:2d} dimensions             |")
            sections.append(f"|  Attention:    {attention_count:2d} dimensions             |")
            sections.append(f"|  Action Req:   {action_required_count:2d} dimensions             |")
        else:
            sections.append("|  No scores available                     |")

        sections.append("+------------------------------------------+")

        # Fix-to-feature ratio line
        if report.fix_to_feature_ratio:
            ratio = report.fix_to_feature_ratio
            if ratio.ratio == float("inf"):
                ratio_display = "N/A"
            else:
                ratio_display = f"{ratio.ratio:.2f}"
            status = "OK" if ratio.is_healthy else "HIGH"
            sections.append(f"|  Fix/Feature Ratio: {ratio_display:>6} ({status:>4})       |")

        # Average alignment line if available
        if report.human_insights:
            avg_align = report.human_insights.feedback_summary.avg_alignment
            if avg_align > 0:
                sections.append(f"|  Avg Alignment:     {avg_align:.2f}/5            |")

        # Quick wins count
        must_do_count = sum(
            1 for item in report.action_items if item.priority == "must_do"
        )
        if must_do_count > 0:
            sections.append(f"|  Must-Do Actions:   {must_do_count:2d}                  |")

        sections.append("+------------------------------------------+")
        sections.append("```")
        sections.append("")

        return "\n".join(sections)


class ReportGenerator:
    """Main report generator for agentic retrospectives.

    Produces complete markdown reports from RetroReport data,
    combining infrastructure health, executive summary, detailed
    analysis, scoring summaries, and action items.
    """

    def __init__(self) -> None:
        """Initialize the report generator with a human report generator."""
        self.human_report_generator = HumanReportGenerator()

    def generate_markdown(self, report: RetroReport) -> str:
        """Generate a complete markdown report from retrospective data.

        Assembles all sections of the report including header, quick summary,
        infrastructure health, executive summary, human insights, detailed
        analysis, telemetry gaps, scoring summary, action items, and footer.

        Args:
            report: Complete RetroReport data structure.

        Returns:
            Complete formatted markdown report as a string.
        """
        sections: list[str] = []

        # Header with period, generated date, completeness
        sections.append(self._generate_header(report))

        # Quick TL;DR summary
        sections.append(self.human_report_generator.generate_quick_summary(report))

        # Infrastructure health (data sources)
        sections.append(self._generate_infrastructure_health(report))

        # Executive summary
        sections.append(self._generate_executive_summary(report))

        # Human insights (if available)
        if report.human_insights:
            sections.append(
                self.human_report_generator.generate_human_insights_section(
                    report.human_insights
                )
            )

        # Fix-to-feature ratio (if available)
        if report.fix_to_feature_ratio:
            sections.append(
                self.human_report_generator.generate_fix_to_feature_section(
                    report.fix_to_feature_ratio
                )
            )

        # Detailed analysis of all scoring dimensions
        sections.append(self._generate_detailed_analysis(report))

        # Telemetry gaps (if any)
        if report.data_completeness.gaps:
            sections.append(
                self._generate_telemetry_gaps_section(report.data_completeness.gaps)
            )

        # Scoring summary table
        sections.append(self._generate_scoring_summary(report))

        # Action items by priority
        sections.append(self._generate_action_items(report.action_items))

        # Footer with generated by and version info
        sections.append(self._generate_footer(report))

        return "\n\n---\n\n".join(sections)

    def _generate_header(self, report: RetroReport) -> str:
        """Generate the report header with period and metadata.

        Args:
            report: RetroReport containing metadata.

        Returns:
            Formatted header markdown.
        """
        sections: list[str] = []
        sections.append(f"# Sprint Retrospective: {report.sprint_id}")
        sections.append("")
        sections.append(f"**Period**: {report.period.from_date} to {report.period.to_date}")
        sections.append(f"**Generated**: {report.generated_at}")

        # Data completeness indicator
        completeness = report.data_completeness
        sources_available = sum([
            completeness.sources.git,
            completeness.sources.decisions,
            completeness.sources.agent_logs,
            completeness.sources.ci,
            completeness.sources.tests,
        ])
        sections.append(
            f"**Data Completeness**: {completeness.percentage:.0f}% ({sources_available}/5 sources)"
        )

        return "\n".join(sections)

    def _generate_infrastructure_health(self, report: RetroReport) -> str:
        """Generate infrastructure health section showing data source status.

        Args:
            report: RetroReport with data completeness info.

        Returns:
            Formatted infrastructure health table.
        """
        sections: list[str] = []
        sections.append("## Infrastructure Health")
        sections.append("")
        sections.append("| Data Source | Status |")
        sections.append("|-------------|--------|")

        sources = report.data_completeness.sources

        def status_icon(available: bool) -> str:
            return "Available" if available else "Missing"

        sections.append(f"| Git History | {status_icon(sources.git)} |")
        sections.append(f"| Decision Logs | {status_icon(sources.decisions)} |")
        sections.append(f"| Agent Logs | {status_icon(sources.agent_logs)} |")
        sections.append(f"| CI Results | {status_icon(sources.ci)} |")
        sections.append(f"| Test Results | {status_icon(sources.tests)} |")

        return "\n".join(sections)

    def _generate_executive_summary(self, report: RetroReport) -> str:
        """Generate executive summary with delivery, quality, and findings.

        Args:
            report: RetroReport with summary and findings data.

        Returns:
            Formatted executive summary markdown.
        """
        sections: list[str] = []
        sections.append("## Executive Summary")
        sections.append("")

        # What was delivered
        sections.append("### What Was Delivered")
        summary = report.summary
        sections.append(
            f"- {summary.commits} commits by {summary.contributors} contributors "
            f"({summary.human_contributors} human, {summary.agent_contributors} agent)"
        )
        sections.append(
            f"- {summary.lines_added:,} lines added, {summary.lines_removed:,} lines removed"
        )
        sections.append(f"- {summary.decisions_logged} decisions logged")
        if summary.agent_commits > 0:
            sections.append(
                f"- Agent contribution: {summary.agent_commit_percentage:.1f}% of commits "
                f"({summary.agent_commits}/{summary.commits})"
            )
        sections.append("")

        # Quality signals
        sections.append("### Quality Signals")
        score_attrs = [
            ("delivery_predictability", "Delivery Predictability"),
            ("test_loop_completeness", "Test Loop Completeness"),
            ("quality_maintainability", "Quality/Maintainability"),
            ("security_posture", "Security Posture"),
            ("collaboration_efficiency", "Collaboration Efficiency"),
            ("decision_hygiene", "Decision Hygiene"),
        ]

        for attr, label in score_attrs:
            score: Score = getattr(report.scores, attr)
            if score.score is not None:
                sections.append(
                    f"- {label}: {score.score}/5 ({score.confidence} confidence)"
                )
        sections.append("")

        # Top wins
        if report.wins:
            sections.append("### Top Wins")
            for win in report.wins[:3]:
                evidence_str = ", ".join(win.evidence[:3]) if win.evidence else "N/A"
                sections.append(f"1. **{win.title}** (Evidence: {evidence_str})")
                sections.append(f"   - {win.description}")
            sections.append("")

        # Top risks
        if report.risks:
            sections.append("### Top Risks")
            for risk in report.risks[:3]:
                evidence_str = ", ".join(risk.evidence[:3]) if risk.evidence else "N/A"
                sections.append(f"1. **{risk.title}** (Evidence: {evidence_str})")
                sections.append(f"   - {risk.description}")
                sections.append(f"   - Mitigation: {risk.mitigation}")
            sections.append("")

        # Key findings
        if report.findings:
            sections.append("### Key Findings")
            for finding in report.findings[:5]:
                severity_label = finding.severity.upper()
                sections.append(
                    f"- [{severity_label}] **{finding.title}**: {finding.summary}"
                )
                if finding.recommendation:
                    sections.append(f"  - Recommendation: {finding.recommendation}")
            sections.append("")

        return "\n".join(sections)

    def _generate_detailed_analysis(self, report: RetroReport) -> str:
        """Generate detailed analysis for all 6 scoring dimensions.

        Args:
            report: RetroReport with scores data.

        Returns:
            Formatted detailed analysis markdown.
        """
        sections: list[str] = []
        sections.append("## Detailed Analysis")
        sections.append("")

        # Define scoring dimensions with descriptions
        dimensions = [
            (
                "delivery_predictability",
                "Delivery Predictability",
                "Measures consistency of commit sizes and frequency, scope drift incidents.",
            ),
            (
                "test_loop_completeness",
                "Test Loop Completeness",
                "Evaluates test coverage, pass rates, and red-green cycle efficiency.",
            ),
            (
                "quality_maintainability",
                "Quality & Maintainability",
                "Assesses code quality indicators, documentation, and commit hygiene.",
            ),
            (
                "security_posture",
                "Security Posture",
                "Reviews security scanning, vulnerability management, and security decisions.",
            ),
            (
                "collaboration_efficiency",
                "Collaboration Efficiency",
                "Evaluates human-agent collaboration, interrupts, and handoff quality.",
            ),
            (
                "decision_hygiene",
                "Decision Hygiene",
                "Measures decision logging, escalation compliance, and rationale documentation.",
            ),
        ]

        for attr, title, description in dimensions:
            score: Score = getattr(report.scores, attr)
            sections.append(f"### {title}")
            sections.append("")
            sections.append(f"*{description}*")
            sections.append("")

            if score.score is not None:
                sections.append(f"**Score**: {score.score}/5 ({score.confidence} confidence)")
            else:
                sections.append(f"**Score**: N/A ({score.confidence} confidence)")

            if score.details:
                sections.append(f"**Details**: {score.details}")

            if score.evidence:
                sections.append("")
                sections.append("**Evidence**:")
                for evidence_item in score.evidence:
                    sections.append(f"- {evidence_item}")

            sections.append("")

        return "\n".join(sections)

    def _generate_telemetry_gaps_section(self, gaps: list[TelemetryGap]) -> str:
        """Generate section listing telemetry gaps with remediation.

        Args:
            gaps: List of TelemetryGap items to document.

        Returns:
            Formatted telemetry gaps markdown.
        """
        sections: list[str] = []
        sections.append("## Telemetry Gaps")
        sections.append("")
        sections.append(
            "The following data sources are missing or incomplete, "
            "limiting analysis accuracy:"
        )
        sections.append("")

        for gap in gaps:
            severity_label = gap.severity.upper()
            sections.append(f"### {gap.gap_type} [{severity_label}]")
            sections.append("")
            sections.append(f"**Impact**: {gap.impact}")
            sections.append("")
            sections.append("**Recommendation**:")
            sections.append(f"```bash")
            sections.append(gap.recommendation)
            sections.append("```")
            sections.append("")

        return "\n".join(sections)

    def _generate_scoring_summary(self, report: RetroReport) -> str:
        """Generate scoring summary table with overall health assessment.

        Args:
            report: RetroReport with scores data.

        Returns:
            Formatted scoring summary markdown.
        """
        sections: list[str] = []
        sections.append("## Scoring Summary")
        sections.append("")

        sections.append("| Dimension | Score | Confidence | Key Evidence |")
        sections.append("|-----------|-------|------------|--------------|")

        dimensions = [
            ("delivery_predictability", "Delivery Predictability"),
            ("test_loop_completeness", "Test Loop Completeness"),
            ("quality_maintainability", "Quality/Maintainability"),
            ("security_posture", "Security Posture"),
            ("collaboration_efficiency", "Collaboration Efficiency"),
            ("decision_hygiene", "Decision Hygiene"),
        ]

        total_score = 0
        scored_count = 0

        for attr, label in dimensions:
            score: Score = getattr(report.scores, attr)
            score_display = f"{score.score}/5" if score.score is not None else "N/A"
            confidence = score.confidence
            # Get first evidence item or N/A
            evidence_summary = score.evidence[0][:50] + "..." if score.evidence else "N/A"
            if score.evidence and len(score.evidence[0]) <= 50:
                evidence_summary = score.evidence[0]

            sections.append(
                f"| {label} | {score_display} | {confidence} | {evidence_summary} |"
            )

            if score.score is not None:
                total_score += score.score
                scored_count += 1

        sections.append("")

        # Overall health assessment
        if scored_count > 0:
            avg_score = total_score / scored_count
            if avg_score >= 4:
                health_status = "GOOD"
            elif avg_score >= 3:
                health_status = "FAIR (with attention areas)"
            elif avg_score >= 2:
                health_status = "NEEDS IMPROVEMENT"
            else:
                health_status = "CRITICAL"

            sections.append(f"**Overall Sprint Health**: {health_status}")
            sections.append(f"**Average Score**: {avg_score:.1f}/5")
        else:
            sections.append("**Overall Sprint Health**: Unable to assess (insufficient data)")

        return "\n".join(sections)

    def _generate_action_items(self, items: list[ActionItem]) -> str:
        """Generate action items section organized by priority.

        Creates three tables for must_do, next_sprint, and backlog items.

        Args:
            items: List of ActionItem objects to render.

        Returns:
            Formatted action items markdown.
        """
        sections: list[str] = []
        sections.append("## Action Items")
        sections.append("")

        # Separate by priority
        must_do = [i for i in items if i.priority == "must_do"]
        next_sprint = [i for i in items if i.priority == "next_sprint"]
        backlog = [i for i in items if i.priority == "backlog"]

        # Must Do (This Sprint)
        if must_do:
            sections.append("### Must Do (This Sprint)")
            sections.append("")
            sections.append("| Action | Why | Owner | Success Metric |")
            sections.append("|--------|-----|-------|----------------|")
            for item in must_do:
                owner = item.owner if item.owner else "Unassigned"
                sections.append(
                    f"| {item.action} | {item.rationale} | {owner} | {item.success_metric} |"
                )
            sections.append("")

        # Next Sprint
        if next_sprint:
            sections.append("### Next Sprint")
            sections.append("")
            sections.append("| Action | Why | Owner | Success Metric |")
            sections.append("|--------|-----|-------|----------------|")
            for item in next_sprint:
                owner = item.owner if item.owner else "Unassigned"
                sections.append(
                    f"| {item.action} | {item.rationale} | {owner} | {item.success_metric} |"
                )
            sections.append("")

        # Backlog
        if backlog:
            sections.append("### Backlog")
            sections.append("")
            sections.append("| Action | Why | Priority Score |")
            sections.append("|--------|-----|----------------|")
            for item in backlog:
                # Calculate priority score: (impact + risk_reduction) / effort
                priority_score = (item.impact + item.risk_reduction) / max(item.effort, 1)
                sections.append(
                    f"| {item.action} | {item.rationale} | {priority_score:.1f} |"
                )
            sections.append("")

        if not items:
            sections.append("*No action items identified.*")
            sections.append("")

        return "\n".join(sections)

    def _generate_footer(self, report: RetroReport) -> str:
        """Generate report footer with generation info and version.

        Args:
            report: RetroReport with metadata.

        Returns:
            Formatted footer markdown.
        """
        sections: list[str] = []
        sections.append("---")
        sections.append("")
        sections.append(f"*Generated by `{report.metadata.generated_by}` - Agentic Retrospective*")
        sections.append(f"*Tool version: {report.metadata.tool_version}*")
        sections.append(f"*Schema version: {report.metadata.schema_version}*")

        return "\n".join(sections)


def generate_report(report: RetroReport) -> str:
    """Convenience function to generate a markdown report.

    Args:
        report: Complete RetroReport data structure.

    Returns:
        Complete formatted markdown report as a string.
    """
    generator = ReportGenerator()
    return generator.generate_markdown(report)

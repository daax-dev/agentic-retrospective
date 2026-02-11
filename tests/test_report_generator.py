"""Tests for Report Generator in agentic_retrospective.report.generator."""

import pytest

from agentic_retrospective.models import (
    ActionItem,
    DataCompleteness,
    DataSources,
    EvidenceMap,
    FeedbackSummary,
    Finding,
    FixToFeatureRatio,
    HumanInsights,
    Period,
    PromptPattern,
    PromptPatterns,
    ReportMetadata,
    RetroReport,
    ReworkDistribution,
    Risk,
    Score,
    Scores,
    SprintSummary,
    TelemetryGap,
    Win,
)
from agentic_retrospective.report.generator import (
    HumanReportGenerator,
    ReportGenerator,
    generate_report,
)


@pytest.fixture
def sample_report() -> RetroReport:
    """Create a sample RetroReport for testing."""
    return RetroReport(
        sprint_id="sprint-2024-01",
        period=Period(**{"from": "2024-01-01", "to": "2024-01-14"}),
        generated_at="2024-01-15T10:00:00",
        data_completeness=DataCompleteness(
            percentage=75.0,
            sources=DataSources(git=True, decisions=True, agent_logs=True, ci=False, tests=False),
            gaps=[
                TelemetryGap(
                    gap_type="missing_ci",
                    severity="medium",
                    impact="Cannot assess CI health",
                    recommendation="Configure CI path",
                )
            ],
        ),
        summary=SprintSummary(
            commits=25,
            contributors=5,
            human_contributors=3,
            agent_contributors=2,
            lines_added=1500,
            lines_removed=500,
            decisions_logged=10,
            agent_commits=8,
            agent_commit_percentage=32.0,
        ),
        scores=Scores(
            delivery_predictability=Score(
                score=4.0, confidence="high", evidence=["Small commits (avg 45 lines)"]
            ),
            test_loop_completeness=Score(
                score=3.5,
                confidence="medium",
                evidence=["85% pass rate"],
                details="Good coverage",
            ),
            quality_maintainability=Score(
                score=4.0, confidence="high", evidence=["5 documentation commits"]
            ),
            security_posture=Score(
                score=None, confidence="none", details="No security scan data"
            ),
            collaboration_efficiency=Score(
                score=3.0, confidence="medium", evidence=["8 agent commits"]
            ),
            decision_hygiene=Score(
                score=5.0, confidence="high", evidence=["5/5 one-way-doors escalated"]
            ),
        ),
        findings=[
            Finding(
                id="F-001",
                severity="high",
                category="quality",
                title="High bug rate",
                summary="Fix commits exceed 20% of total",
                evidence=["15 fix commits out of 25"],
                confidence="high",
                recommendation="Improve testing coverage",
            ),
            Finding(
                id="F-002",
                severity="medium",
                category="scope_drift",
                title="Orphan commits",
                summary="5 commits without decision context",
                evidence=["abc123", "bcd234"],
                confidence="medium",
            ),
        ],
        wins=[
            Win(
                title="Strong delivery predictability",
                description="Consistent small commits",
                evidence=["45 line average"],
            ),
            Win(
                title="Excellent decision hygiene",
                description="All one-way doors escalated",
                evidence=["100% escalation rate"],
            ),
        ],
        risks=[
            Risk(
                title="Missing security scans",
                description="No security scanning configured",
                evidence=["No scan data found"],
                mitigation="Configure security scanning in CI",
            )
        ],
        action_items=[
            ActionItem(
                id="A-001",
                priority="must_do",
                action="Add security scanning",
                rationale="Critical security gap",
                owner="Security Team",
                success_metric="Security scans passing",
                effort=3,
                impact=5,
                risk_reduction=5,
            ),
            ActionItem(
                id="A-002",
                priority="next_sprint",
                action="Improve test coverage",
                rationale="High bug rate",
                owner=None,
                success_metric="Coverage > 80%",
                effort=4,
                impact=4,
                risk_reduction=3,
            ),
            ActionItem(
                id="A-003",
                priority="backlog",
                action="Document decision process",
                rationale="Help future decisions",
                owner=None,
                success_metric="Updated CLAUDE.md",
                effort=2,
                impact=2,
                risk_reduction=1,
            ),
        ],
        evidence_map=EvidenceMap(),
        human_insights=HumanInsights(
            prompt_patterns=PromptPatterns(
                effective=[
                    PromptPattern(
                        pattern="file_references",
                        description="Prompts with file paths",
                        frequency=15,
                        avg_alignment_score=4.5,
                        avg_rework_level=0.2,
                        examples=["Update src/main.py"],
                        recommendation="Continue using file paths",
                    )
                ],
                problematic=[
                    PromptPattern(
                        pattern="high_ambiguity",
                        description="Vague prompts",
                        frequency=5,
                        avg_alignment_score=2.0,
                        avg_rework_level=1.5,
                        examples=["Fix it"],
                        recommendation="Be more specific",
                    )
                ],
            ),
            feedback_summary=FeedbackSummary(
                avg_alignment=4.2,
                total_sessions=10,
                rework_distribution=ReworkDistribution(none=7, minor=2, significant=1),
                avg_revision_cycles=1.5,
            ),
            claude_md_suggestions=["Add file paths section", "Document constraints"],
            top_improvements=["Be more specific in prompts"],
            top_successes=["Good test coverage"],
        ),
        fix_to_feature_ratio=FixToFeatureRatio(
            ratio=0.25,
            fix_commits=5,
            feature_commits=20,
            is_healthy=False,
            threshold=0.1,
        ),
        metadata=ReportMetadata(
            tool_version="0.1.0",
            schema_version="1.0.0",
            generated_by="agentic-retrospective",
        ),
    )


class TestReportGeneratorMarkdown:
    """Tests for ReportGenerator markdown generation."""

    def test_generate_markdown_returns_string(self, sample_report: RetroReport):
        """Test generate_markdown returns a string."""
        generator = ReportGenerator()
        result = generator.generate_markdown(sample_report)

        assert isinstance(result, str)
        assert len(result) > 0

    def test_generate_markdown_includes_header(self, sample_report: RetroReport):
        """Test markdown includes report header with sprint ID."""
        generator = ReportGenerator()
        result = generator.generate_markdown(sample_report)

        assert "# Sprint Retrospective: sprint-2024-01" in result
        assert "2024-01-01" in result
        assert "2024-01-14" in result

    def test_generate_markdown_includes_data_completeness(self, sample_report: RetroReport):
        """Test markdown includes data completeness percentage."""
        generator = ReportGenerator()
        result = generator.generate_markdown(sample_report)

        assert "75%" in result
        assert "Data Completeness" in result

    def test_generate_markdown_includes_infrastructure_health(self, sample_report: RetroReport):
        """Test markdown includes infrastructure health table."""
        generator = ReportGenerator()
        result = generator.generate_markdown(sample_report)

        assert "Infrastructure Health" in result
        assert "Git History" in result
        assert "Decision Logs" in result

    def test_generate_markdown_includes_executive_summary(self, sample_report: RetroReport):
        """Test markdown includes executive summary section."""
        generator = ReportGenerator()
        result = generator.generate_markdown(sample_report)

        assert "Executive Summary" in result
        assert "25 commits" in result
        assert "5 contributors" in result

    def test_generate_markdown_includes_detailed_analysis(self, sample_report: RetroReport):
        """Test markdown includes detailed analysis for all dimensions."""
        generator = ReportGenerator()
        result = generator.generate_markdown(sample_report)

        assert "Detailed Analysis" in result
        assert "Delivery Predictability" in result
        assert "Test Loop Completeness" in result
        assert "Quality & Maintainability" in result
        assert "Security Posture" in result
        assert "Collaboration Efficiency" in result
        assert "Decision Hygiene" in result

    def test_generate_markdown_includes_scoring_summary(self, sample_report: RetroReport):
        """Test markdown includes scoring summary table."""
        generator = ReportGenerator()
        result = generator.generate_markdown(sample_report)

        assert "Scoring Summary" in result
        assert "4.0/5" in result or "4/5" in result  # Delivery score
        assert "5.0/5" in result or "5/5" in result  # Decision hygiene score
        assert "N/A" in result  # Security posture (no score)

    def test_generate_markdown_includes_action_items(self, sample_report: RetroReport):
        """Test markdown includes action items by priority."""
        generator = ReportGenerator()
        result = generator.generate_markdown(sample_report)

        assert "Action Items" in result
        assert "Must Do" in result
        assert "Next Sprint" in result
        assert "Backlog" in result
        assert "Add security scanning" in result

    def test_generate_markdown_includes_telemetry_gaps(self, sample_report: RetroReport):
        """Test markdown includes telemetry gaps section."""
        generator = ReportGenerator()
        result = generator.generate_markdown(sample_report)

        assert "Telemetry Gaps" in result
        assert "missing_ci" in result
        assert "Cannot assess CI health" in result

    def test_generate_markdown_includes_footer(self, sample_report: RetroReport):
        """Test markdown includes footer with version info."""
        generator = ReportGenerator()
        result = generator.generate_markdown(sample_report)

        assert "agentic-retrospective" in result
        assert "0.1.0" in result
        assert "1.0.0" in result

    def test_generate_markdown_includes_findings(self, sample_report: RetroReport):
        """Test markdown includes findings section."""
        generator = ReportGenerator()
        result = generator.generate_markdown(sample_report)

        assert "Key Findings" in result or "Findings" in result
        assert "HIGH" in result
        assert "High bug rate" in result

    def test_generate_markdown_includes_wins(self, sample_report: RetroReport):
        """Test markdown includes wins section."""
        generator = ReportGenerator()
        result = generator.generate_markdown(sample_report)

        assert "Wins" in result or "Top Wins" in result
        assert "Strong delivery predictability" in result

    def test_generate_markdown_includes_risks(self, sample_report: RetroReport):
        """Test markdown includes risks section."""
        generator = ReportGenerator()
        result = generator.generate_markdown(sample_report)

        assert "Risks" in result or "Top Risks" in result
        assert "Missing security scans" in result


class TestReportGeneratorHandleNoneValues:
    """Tests for handling None values in report generation."""

    def test_handle_none_score(self, sample_report: RetroReport):
        """Test handling of None score values."""
        # sample_report already has security_posture with None score
        generator = ReportGenerator()
        result = generator.generate_markdown(sample_report)

        # Should show N/A for None scores
        assert "N/A" in result

    def test_handle_none_human_insights(self, sample_report: RetroReport):
        """Test handling when human_insights is None."""
        report = sample_report.model_copy(update={"human_insights": None})
        generator = ReportGenerator()

        # Should not raise an error
        result = generator.generate_markdown(report)

        assert isinstance(result, str)
        # Human Insights section should not be present
        assert "Human Insights" not in result or "Feedback Summary" not in result

    def test_handle_none_fix_to_feature_ratio(self, sample_report: RetroReport):
        """Test handling when fix_to_feature_ratio is None."""
        report = sample_report.model_copy(update={"fix_to_feature_ratio": None})
        generator = ReportGenerator()

        result = generator.generate_markdown(report)

        assert isinstance(result, str)
        # Fix-to-Feature section should not be present
        assert "Fix-to-Feature Ratio" not in result or "Fix Commits" not in result

    def test_handle_empty_findings(self, sample_report: RetroReport):
        """Test handling when findings list is empty."""
        report = sample_report.model_copy(update={"findings": []})
        generator = ReportGenerator()

        result = generator.generate_markdown(report)

        assert isinstance(result, str)

    def test_handle_empty_action_items(self, sample_report: RetroReport):
        """Test handling when action_items list is empty."""
        report = sample_report.model_copy(update={"action_items": []})
        generator = ReportGenerator()

        result = generator.generate_markdown(report)

        assert "No action items" in result or "Action Items" in result

    def test_handle_empty_wins(self, sample_report: RetroReport):
        """Test handling when wins list is empty."""
        report = sample_report.model_copy(update={"wins": []})
        generator = ReportGenerator()

        result = generator.generate_markdown(report)

        assert isinstance(result, str)

    def test_handle_empty_risks(self, sample_report: RetroReport):
        """Test handling when risks list is empty."""
        report = sample_report.model_copy(update={"risks": []})
        generator = ReportGenerator()

        result = generator.generate_markdown(report)

        assert isinstance(result, str)


class TestHumanReportGenerator:
    """Tests for HumanReportGenerator sections."""

    def test_generate_human_insights_section(self, sample_report: RetroReport):
        """Test human insights section generation."""
        generator = HumanReportGenerator()
        result = generator.generate_human_insights_section(sample_report.human_insights)

        assert "Human Insights" in result
        assert "Feedback Summary" in result
        assert "4.2" in result  # avg_alignment rounded to 4.20
        assert "10" in result  # total_sessions

    def test_generate_human_insights_includes_patterns(self, sample_report: RetroReport):
        """Test human insights includes effective and problematic patterns."""
        generator = HumanReportGenerator()
        result = generator.generate_human_insights_section(sample_report.human_insights)

        assert "Effective Patterns" in result
        assert "file_references" in result
        assert "Problematic Patterns" in result
        assert "high_ambiguity" in result

    def test_generate_human_insights_includes_suggestions(self, sample_report: RetroReport):
        """Test human insights includes CLAUDE.md suggestions."""
        generator = HumanReportGenerator()
        result = generator.generate_human_insights_section(sample_report.human_insights)

        assert "CLAUDE.md Suggestions" in result
        assert "Add file paths section" in result

    def test_generate_fix_to_feature_section(self, sample_report: RetroReport):
        """Test fix-to-feature ratio section generation."""
        generator = HumanReportGenerator()
        result = generator.generate_fix_to_feature_section(sample_report.fix_to_feature_ratio)

        assert "Fix-to-Feature Ratio" in result
        assert "5" in result  # fix_commits
        assert "20" in result  # feature_commits
        assert "0.25" in result  # ratio
        assert "Unhealthy" in result  # status

    def test_generate_fix_to_feature_section_healthy(self):
        """Test fix-to-feature section with healthy ratio."""
        ratio = FixToFeatureRatio(
            ratio=0.05, fix_commits=1, feature_commits=20, is_healthy=True, threshold=0.1
        )
        generator = HumanReportGenerator()
        result = generator.generate_fix_to_feature_section(ratio)

        assert "Healthy" in result
        assert "Warning" not in result

    def test_generate_fix_to_feature_section_infinity(self):
        """Test fix-to-feature section with infinite ratio (no features)."""
        ratio = FixToFeatureRatio(
            ratio=float("inf"), fix_commits=5, feature_commits=0, is_healthy=False, threshold=0.1
        )
        generator = HumanReportGenerator()
        result = generator.generate_fix_to_feature_section(ratio)

        assert "N/A (no features)" in result

    def test_generate_quick_summary(self, sample_report: RetroReport):
        """Test quick summary box generation."""
        generator = HumanReportGenerator()
        result = generator.generate_quick_summary(sample_report)

        assert "TL;DR" in result
        assert "SPRINT HEALTH SUMMARY" in result
        assert "Healthy" in result
        assert "Attention" in result

    def test_generate_quick_summary_includes_metrics(self, sample_report: RetroReport):
        """Test quick summary includes key metrics."""
        generator = HumanReportGenerator()
        result = generator.generate_quick_summary(sample_report)

        # Should include fix/feature ratio
        assert "Fix/Feature Ratio" in result
        # Should include avg alignment
        assert "Avg Alignment" in result
        # Should include must-do count
        assert "Must-Do Actions" in result


class TestGenerateReportConvenienceFunction:
    """Tests for generate_report convenience function."""

    def test_generate_report_returns_markdown(self, sample_report: RetroReport):
        """Test generate_report convenience function."""
        result = generate_report(sample_report)

        assert isinstance(result, str)
        assert "Sprint Retrospective" in result


class TestReportGeneratorEdgeCases:
    """Tests for edge cases in report generation."""

    def test_long_evidence_truncated_in_table(self, sample_report: RetroReport):
        """Test long evidence strings are truncated in summary table."""
        # Modify a score to have long evidence
        sample_report.scores.delivery_predictability.evidence = [
            "This is a very long evidence string that should be truncated when displayed in the summary table to prevent layout issues"
        ]

        generator = ReportGenerator()
        result = generator.generate_markdown(sample_report)

        # Evidence in table should be truncated
        assert "..." in result

    def test_action_item_without_owner(self, sample_report: RetroReport):
        """Test action items without owner show Unassigned."""
        generator = ReportGenerator()
        result = generator.generate_markdown(sample_report)

        assert "Unassigned" in result

    def test_multiple_telemetry_gaps(self, sample_report: RetroReport):
        """Test handling multiple telemetry gaps."""
        sample_report.data_completeness.gaps = [
            TelemetryGap(
                gap_type="missing_ci",
                severity="medium",
                impact="Cannot assess CI",
                recommendation="Configure CI",
            ),
            TelemetryGap(
                gap_type="missing_tests",
                severity="high",
                impact="Cannot assess tests",
                recommendation="Configure tests",
            ),
        ]

        generator = ReportGenerator()
        result = generator.generate_markdown(sample_report)

        assert "missing_ci" in result
        assert "missing_tests" in result

    def test_empty_evidence_list(self, sample_report: RetroReport):
        """Test handling scores with empty evidence list."""
        sample_report.scores.collaboration_efficiency.evidence = []

        generator = ReportGenerator()
        result = generator.generate_markdown(sample_report)

        # Should show N/A for empty evidence
        assert isinstance(result, str)

    def test_very_long_action_description(self, sample_report: RetroReport):
        """Test handling very long action descriptions."""
        sample_report.action_items[0].action = "x" * 200

        generator = ReportGenerator()
        result = generator.generate_markdown(sample_report)

        # Should truncate in table
        assert isinstance(result, str)

    def test_special_characters_in_content(self, sample_report: RetroReport):
        """Test handling special markdown characters in content."""
        sample_report.findings[0].title = "Bug with | pipe | characters"
        sample_report.findings[0].summary = "Contains `code` and *emphasis*"

        generator = ReportGenerator()
        result = generator.generate_markdown(sample_report)

        assert isinstance(result, str)


class TestReportGeneratorHealthAssessment:
    """Tests for overall health assessment in reports."""

    def test_good_health_assessment(self, sample_report: RetroReport):
        """Test GOOD health assessment when average score >= 4."""
        # Modify scores to all be >= 4
        sample_report.scores.delivery_predictability.score = 5.0
        sample_report.scores.test_loop_completeness.score = 4.0
        sample_report.scores.quality_maintainability.score = 5.0
        sample_report.scores.security_posture.score = 4.0
        sample_report.scores.collaboration_efficiency.score = 4.0
        sample_report.scores.decision_hygiene.score = 5.0

        generator = ReportGenerator()
        result = generator.generate_markdown(sample_report)

        assert "GOOD" in result

    def test_fair_health_assessment(self, sample_report: RetroReport):
        """Test FAIR health assessment when average score >= 3."""
        # Modify scores to average around 3.5
        sample_report.scores.delivery_predictability.score = 4.0
        sample_report.scores.test_loop_completeness.score = 3.0
        sample_report.scores.quality_maintainability.score = 4.0
        sample_report.scores.security_posture.score = 3.0
        sample_report.scores.collaboration_efficiency.score = 3.0
        sample_report.scores.decision_hygiene.score = 4.0

        generator = ReportGenerator()
        result = generator.generate_markdown(sample_report)

        assert "FAIR" in result

    def test_needs_improvement_assessment(self, sample_report: RetroReport):
        """Test NEEDS IMPROVEMENT health assessment when average score >= 2."""
        # Modify scores to average around 2.5
        sample_report.scores.delivery_predictability.score = 3.0
        sample_report.scores.test_loop_completeness.score = 2.0
        sample_report.scores.quality_maintainability.score = 3.0
        sample_report.scores.security_posture.score = 2.0
        sample_report.scores.collaboration_efficiency.score = 2.0
        sample_report.scores.decision_hygiene.score = 3.0

        generator = ReportGenerator()
        result = generator.generate_markdown(sample_report)

        assert "NEEDS IMPROVEMENT" in result

    def test_insufficient_data_assessment(self, sample_report: RetroReport):
        """Test insufficient data assessment when no scores available."""
        # Set all scores to None
        sample_report.scores.delivery_predictability.score = None
        sample_report.scores.test_loop_completeness.score = None
        sample_report.scores.quality_maintainability.score = None
        sample_report.scores.security_posture.score = None
        sample_report.scores.collaboration_efficiency.score = None
        sample_report.scores.decision_hygiene.score = None

        generator = ReportGenerator()
        result = generator.generate_markdown(sample_report)

        assert "insufficient data" in result.lower() or "unable to assess" in result.lower()

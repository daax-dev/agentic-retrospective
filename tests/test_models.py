"""Tests for Pydantic models in agentic_retrospective.models."""

import json
from datetime import datetime

import pytest
from pydantic import ValidationError

from agentic_retrospective.models import (
    ActionItem,
    CommitEvidence,
    CommitInfo,
    ComplexitySignals,
    DataCompleteness,
    DataSources,
    DecisionEvidence,
    DecisionRecord,
    EvidenceMap,
    FeedbackEntry,
    FeedbackSummary,
    FileChange,
    Finding,
    FixToFeatureRatio,
    HumanInsights,
    Orphans,
    Period,
    PromptEntry,
    PromptPattern,
    PromptPatterns,
    ReportMetadata,
    RetroConfig,
    RetroReport,
    ReworkDistribution,
    Risk,
    Score,
    Scores,
    SprintSummary,
    TelemetryGap,
    Win,
)


class TestScore:
    """Tests for Score model."""

    def test_score_creation_with_all_fields(self):
        """Test Score creation with all fields provided."""
        score = Score(
            score=4.5,
            confidence="high",
            evidence=["Test passed", "Coverage good"],
            details="Excellent performance",
        )

        assert score.score == 4.5
        assert score.confidence == "high"
        assert score.evidence == ["Test passed", "Coverage good"]
        assert score.details == "Excellent performance"

    def test_score_creation_with_minimal_fields(self):
        """Test Score creation with only required fields."""
        score = Score(confidence="medium")

        assert score.score is None
        assert score.confidence == "medium"
        assert score.evidence == []
        assert score.details is None

    def test_score_with_none_value(self):
        """Test Score with None score value (not assessable)."""
        score = Score(score=None, confidence="none", evidence=["No data available"])

        assert score.score is None
        assert score.confidence == "none"

    def test_score_with_float_value(self):
        """Test Score accepts float values."""
        score = Score(score=3.7, confidence="medium")

        assert score.score == 3.7

    def test_score_defaults(self):
        """Test Score default values."""
        score = Score(confidence="low")

        assert score.evidence == []
        assert score.details is None


class TestScores:
    """Tests for Scores model containing all 6 dimensions."""

    def test_scores_creation_with_all_dimensions(self):
        """Test Scores creation with all 6 scoring dimensions."""
        scores = Scores(
            delivery_predictability=Score(score=4.0, confidence="high"),
            test_loop_completeness=Score(score=3.5, confidence="medium"),
            quality_maintainability=Score(score=4.5, confidence="high"),
            security_posture=Score(score=None, confidence="none"),
            collaboration_efficiency=Score(score=3.0, confidence="low"),
            decision_hygiene=Score(score=5.0, confidence="high"),
        )

        assert scores.delivery_predictability.score == 4.0
        assert scores.test_loop_completeness.score == 3.5
        assert scores.quality_maintainability.score == 4.5
        assert scores.security_posture.score is None
        assert scores.collaboration_efficiency.score == 3.0
        assert scores.decision_hygiene.score == 5.0

    def test_scores_missing_dimension_raises_error(self):
        """Test that missing dimension raises ValidationError."""
        with pytest.raises(ValidationError):
            Scores(
                delivery_predictability=Score(score=4.0, confidence="high"),
                test_loop_completeness=Score(score=3.5, confidence="medium"),
                # Missing other dimensions
            )


class TestDecisionRecord:
    """Tests for DecisionRecord model."""

    def test_decision_record_creation(self):
        """Test DecisionRecord creation with typical fields."""
        record = DecisionRecord(
            id="DEC-001",
            ts="2024-01-15T10:30:00",
            actor="human",
            category="architecture",
            decision_type="one_way_door",
            decision="Use PostgreSQL",
            rationale="ACID compliance needed",
            risk_level="high",
        )

        assert record.id == "DEC-001"
        assert record.ts == "2024-01-15T10:30:00"
        assert record.actor == "human"
        assert record.decision_type == "one_way_door"

    def test_decision_record_with_minimal_fields(self):
        """Test DecisionRecord with only required fields."""
        record = DecisionRecord(ts="2024-01-15T10:30:00")

        assert record.ts == "2024-01-15T10:30:00"
        assert record.id is None
        assert record.actor is None
        assert record.decision is None

    def test_decision_record_field_aliases(self):
        """Test DecisionRecord handles field aliases (summary/decision, reasoning/rationale)."""
        record = DecisionRecord(
            ts="2024-01-15T10:30:00",
            summary="Use Redis",
            reasoning="Fast caching",
            chosen="Redis",
        )

        assert record.summary == "Use Redis"
        assert record.reasoning == "Fast caching"
        assert record.chosen == "Redis"

    def test_decision_record_with_options_considered(self):
        """Test DecisionRecord with options_considered field."""
        from agentic_retrospective.models import OptionConsidered

        record = DecisionRecord(
            ts="2024-01-15T10:30:00",
            options_considered=[
                OptionConsidered(
                    option="PostgreSQL", pros=["ACID", "Complex queries"], cons=["Scaling"]
                ),
                OptionConsidered(option="MongoDB", pros=["Flexible schema"], cons=["No ACID"]),
            ],
            chosen_option="PostgreSQL",
        )

        assert len(record.options_considered) == 2
        assert record.options_considered[0].option == "PostgreSQL"
        assert record.chosen_option == "PostgreSQL"

    def test_decision_record_context_as_dict(self):
        """Test DecisionRecord with context as dictionary."""
        record = DecisionRecord(
            ts="2024-01-15T10:30:00",
            context={"environment": "production", "team_size": 5},
        )

        assert isinstance(record.context, dict)
        assert record.context["environment"] == "production"

    def test_decision_record_context_as_string(self):
        """Test DecisionRecord with context as string."""
        record = DecisionRecord(
            ts="2024-01-15T10:30:00",
            context="Production deployment context",
        )

        assert isinstance(record.context, str)


class TestRetroReport:
    """Tests for RetroReport model serialization/deserialization."""

    @pytest.fixture
    def minimal_report(self) -> RetroReport:
        """Create a minimal valid RetroReport."""
        return RetroReport(
            sprint_id="sprint-001",
            period=Period(**{"from": "2024-01-01", "to": "2024-01-14"}),
            generated_at="2024-01-15T10:00:00",
            data_completeness=DataCompleteness(
                percentage=50.0,
                sources=DataSources(git=True, decisions=True),
            ),
            summary=SprintSummary(
                commits=10,
                contributors=3,
                human_contributors=2,
                agent_contributors=1,
                lines_added=500,
                lines_removed=100,
                decisions_logged=5,
                agent_commits=3,
                agent_commit_percentage=30.0,
            ),
            scores=Scores(
                delivery_predictability=Score(score=4.0, confidence="high"),
                test_loop_completeness=Score(score=3.0, confidence="medium"),
                quality_maintainability=Score(score=4.0, confidence="high"),
                security_posture=Score(score=None, confidence="none"),
                collaboration_efficiency=Score(score=3.5, confidence="medium"),
                decision_hygiene=Score(score=4.5, confidence="high"),
            ),
            evidence_map=EvidenceMap(),
            metadata=ReportMetadata(
                tool_version="0.1.0",
                schema_version="1.0.0",
                generated_by="agentic-retrospective",
            ),
        )

    def test_retro_report_serialization(self, minimal_report: RetroReport):
        """Test RetroReport serializes to dict correctly."""
        data = minimal_report.model_dump()

        assert data["sprint_id"] == "sprint-001"
        assert data["summary"]["commits"] == 10
        assert data["scores"]["delivery_predictability"]["score"] == 4.0

    def test_retro_report_json_serialization(self, minimal_report: RetroReport):
        """Test RetroReport serializes to JSON correctly."""
        json_str = minimal_report.model_dump_json()
        parsed = json.loads(json_str)

        assert parsed["sprint_id"] == "sprint-001"
        assert parsed["metadata"]["tool_version"] == "0.1.0"

    def test_retro_report_deserialization(self, minimal_report: RetroReport):
        """Test RetroReport deserializes from dict correctly."""
        data = minimal_report.model_dump(by_alias=True)
        restored = RetroReport.model_validate(data)

        assert restored.sprint_id == minimal_report.sprint_id
        assert restored.summary.commits == minimal_report.summary.commits

    def test_retro_report_with_findings(self, minimal_report: RetroReport):
        """Test RetroReport with findings list."""
        report = minimal_report.model_copy(
            update={
                "findings": [
                    Finding(
                        id="F-001",
                        severity="high",
                        category="quality",
                        title="High bug rate",
                        summary="Many fix commits detected",
                        confidence="high",
                    )
                ]
            }
        )

        assert len(report.findings) == 1
        assert report.findings[0].severity == "high"

    def test_retro_report_with_action_items(self, minimal_report: RetroReport):
        """Test RetroReport with action items."""
        report = minimal_report.model_copy(
            update={
                "action_items": [
                    ActionItem(
                        id="A-001",
                        priority="must_do",
                        action="Fix critical bug",
                        rationale="Production impact",
                        success_metric="No errors in logs",
                        effort=2,
                        impact=5,
                        risk_reduction=5,
                    )
                ]
            }
        )

        assert len(report.action_items) == 1
        assert report.action_items[0].priority == "must_do"

    def test_retro_report_with_human_insights(self, minimal_report: RetroReport):
        """Test RetroReport with human insights."""
        insights = HumanInsights(
            prompt_patterns=PromptPatterns(effective=[], problematic=[]),
            feedback_summary=FeedbackSummary(
                avg_alignment=4.0,
                total_sessions=5,
                rework_distribution=ReworkDistribution(none=3, minor=2, significant=0),
                avg_revision_cycles=1.5,
            ),
            claude_md_suggestions=["Add file paths section"],
            top_improvements=["Be more specific"],
            top_successes=["Good test coverage"],
        )

        report = minimal_report.model_copy(update={"human_insights": insights})

        assert report.human_insights is not None
        assert report.human_insights.feedback_summary.avg_alignment == 4.0

    def test_retro_report_with_fix_to_feature_ratio(self, minimal_report: RetroReport):
        """Test RetroReport with fix-to-feature ratio."""
        ratio = FixToFeatureRatio(
            ratio=0.05,
            fix_commits=2,
            feature_commits=40,
            is_healthy=True,
            threshold=0.1,
        )

        report = minimal_report.model_copy(update={"fix_to_feature_ratio": ratio})

        assert report.fix_to_feature_ratio is not None
        assert report.fix_to_feature_ratio.is_healthy is True


class TestPeriod:
    """Tests for Period model with field aliases."""

    def test_period_creation_with_aliases(self):
        """Test Period creation using from/to aliases."""
        period = Period(**{"from": "2024-01-01", "to": "2024-01-14"})

        assert period.from_date == "2024-01-01"
        assert period.to_date == "2024-01-14"

    def test_period_serialization_with_aliases(self):
        """Test Period serializes with aliases."""
        period = Period(**{"from": "2024-01-01", "to": "2024-01-14"})
        data = period.model_dump(by_alias=True)

        assert data["from"] == "2024-01-01"
        assert data["to"] == "2024-01-14"


class TestCommitInfo:
    """Tests for CommitInfo model."""

    def test_commit_info_creation(self):
        """Test CommitInfo creation with all fields."""
        commit = CommitInfo(
            hash="abc123def456789012345678901234567890abcd",
            short_hash="abc123d",
            author="Developer",
            email="dev@example.com",
            date="2024-01-15T10:30:00",
            subject="feat: add feature",
            body="Description",
            files=[FileChange(path="src/main.py", additions=10, deletions=5, change_type="modify")],
            lines_added=10,
            lines_removed=5,
        )

        assert commit.hash == "abc123def456789012345678901234567890abcd"
        assert commit.short_hash == "abc123d"
        assert len(commit.files) == 1


class TestFileChange:
    """Tests for FileChange model."""

    def test_file_change_creation(self):
        """Test FileChange creation."""
        change = FileChange(path="src/main.py", additions=100, deletions=50, change_type="modify")

        assert change.path == "src/main.py"
        assert change.additions == 100
        assert change.deletions == 50
        assert change.change_type == "modify"

    def test_file_change_types(self):
        """Test various file change types."""
        add = FileChange(path="new.py", additions=50, deletions=0, change_type="add")
        delete = FileChange(path="old.py", additions=0, deletions=30, change_type="delete")
        rename = FileChange(path="renamed.py", additions=0, deletions=0, change_type="rename")

        assert add.change_type == "add"
        assert delete.change_type == "delete"
        assert rename.change_type == "rename"


class TestComplexitySignals:
    """Tests for ComplexitySignals model."""

    def test_complexity_signals_defaults(self):
        """Test ComplexitySignals default values."""
        signals = ComplexitySignals()

        assert signals.has_constraints is False
        assert signals.has_examples is False
        assert signals.has_acceptance_criteria is False
        assert signals.file_references == 0
        assert signals.ambiguity_score == 0.0

    def test_complexity_signals_validation(self):
        """Test ComplexitySignals field validation."""
        signals = ComplexitySignals(ambiguity_score=0.5, file_references=3)

        assert signals.ambiguity_score == 0.5
        assert signals.file_references == 3

    def test_ambiguity_score_bounds(self):
        """Test ambiguity_score is bounded between 0 and 1."""
        with pytest.raises(ValidationError):
            ComplexitySignals(ambiguity_score=1.5)

        with pytest.raises(ValidationError):
            ComplexitySignals(ambiguity_score=-0.1)


class TestEvidenceMap:
    """Tests for EvidenceMap model."""

    def test_evidence_map_creation(self):
        """Test EvidenceMap creation."""
        evidence_map = EvidenceMap(
            commits={
                "abc123": CommitEvidence(decisions=["DEC-001"], findings=["F-001"], category="feature")
            },
            decisions={
                "DEC-001": DecisionEvidence(
                    commits=["abc123"], type="one_way_door", escalated=True, category="architecture"
                )
            },
            orphans=Orphans(
                commits_without_context=["def456"], decisions_without_implementation=["DEC-002"]
            ),
        )

        assert "abc123" in evidence_map.commits
        assert "DEC-001" in evidence_map.decisions
        assert "def456" in evidence_map.orphans.commits_without_context

    def test_evidence_map_defaults(self):
        """Test EvidenceMap default values."""
        evidence_map = EvidenceMap()

        assert evidence_map.commits == {}
        assert evidence_map.decisions == {}
        assert evidence_map.orphans.commits_without_context == []


class TestTelemetryGap:
    """Tests for TelemetryGap model."""

    def test_telemetry_gap_creation(self):
        """Test TelemetryGap creation."""
        gap = TelemetryGap(
            gap_type="missing_agent_logs",
            severity="high",
            impact="Cannot analyze agent behavior",
            recommendation="Run setup to enable telemetry",
        )

        assert gap.gap_type == "missing_agent_logs"
        assert gap.severity == "high"


class TestFeedbackEntry:
    """Tests for FeedbackEntry model."""

    def test_feedback_entry_creation(self):
        """Test FeedbackEntry creation."""
        feedback = FeedbackEntry(
            timestamp=datetime.now(),
            session_id="session-001",
            alignment=4,
            rework_needed="minor",
            revision_cycles=2,
            improvement_suggestion="Be more specific",
            worked_well="Good coverage",
        )

        assert feedback.alignment == 4
        assert feedback.rework_needed == "minor"

    def test_feedback_entry_alignment_validation(self):
        """Test alignment field validation (1-5 range)."""
        with pytest.raises(ValidationError):
            FeedbackEntry(
                timestamp=datetime.now(),
                session_id="session-001",
                alignment=6,  # Out of range
            )

        with pytest.raises(ValidationError):
            FeedbackEntry(
                timestamp=datetime.now(),
                session_id="session-001",
                alignment=0,  # Out of range
            )


class TestPromptEntry:
    """Tests for PromptEntry model."""

    def test_prompt_entry_creation(self):
        """Test PromptEntry creation."""
        prompt = PromptEntry(
            timestamp=datetime.now(),
            session_id="session-001",
            prompt="Fix the bug in auth.py",
            prompt_length=22,
            complexity_signals=ComplexitySignals(file_references=1),
        )

        assert prompt.session_id == "session-001"
        assert prompt.complexity_signals.file_references == 1


class TestRetroConfig:
    """Tests for RetroConfig model."""

    def test_retro_config_creation(self):
        """Test RetroConfig creation."""
        config = RetroConfig(
            from_ref="HEAD~10",
            to_ref="HEAD",
            sprint_id="sprint-001",
            decisions_path="/path/to/decisions",
            agent_logs_path="/path/to/logs",
            ci_path="/path/to/ci",
            output_dir="/path/to/output",
        )

        assert config.from_ref == "HEAD~10"
        assert config.sprint_id == "sprint-001"

    def test_retro_config_optional_ci_path(self):
        """Test RetroConfig with optional ci_path."""
        config = RetroConfig(
            from_ref="HEAD~10",
            to_ref="HEAD",
            sprint_id="sprint-001",
            decisions_path="/path/to/decisions",
            agent_logs_path="/path/to/logs",
            output_dir="/path/to/output",
        )

        assert config.ci_path is None

"""Tests for Human Insights analyzer in agentic_retrospective.analyzers.human_insights."""

import json
from datetime import datetime, timedelta
from pathlib import Path

import pytest

from agentic_retrospective.analyzers.human_insights import DataStatus, HumanInsightsAnalyzer
from agentic_retrospective.models import (
    CommitInfo,
    ComplexitySignals,
    FeedbackEntry,
    FeedbackSummary,
    FileChange,
    FixToFeatureRatio,
    HumanInsights,
    PromptEntry,
    PromptPatterns,
    ReworkDistribution,
)


class TestHumanInsightsAnalyzerPromptPatterns:
    """Tests for HumanInsightsAnalyzer prompt pattern detection."""

    def test_detect_file_reference_pattern(
        self, temp_project_dir: Path, sample_prompts: list[PromptEntry]
    ):
        """Test detection of file reference pattern in prompts."""
        logs_dir = temp_project_dir / ".logs"
        prompts_dir = logs_dir / "prompts"
        prompts_file = prompts_dir / "prompts.jsonl"

        # Write prompts with file references
        with prompts_file.open("w", encoding="utf-8") as f:
            for prompt in sample_prompts:
                data = prompt.model_dump()
                data["timestamp"] = prompt.timestamp.isoformat()
                f.write(json.dumps(data) + "\n")

        analyzer = HumanInsightsAnalyzer(logs_dir)
        analyzer.load_logs()  # Must load logs before analyzing
        patterns = analyzer.analyze_prompt_patterns()

        # Should detect file_references pattern from prompts with file_references > 0
        file_ref_patterns = [p for p in patterns.effective if p.pattern == "file_references"]
        assert len(file_ref_patterns) == 1
        assert file_ref_patterns[0].frequency >= 1

    def test_detect_constraints_pattern(self, temp_project_dir: Path):
        """Test detection of explicit constraints pattern."""
        logs_dir = temp_project_dir / ".logs"
        prompts_dir = logs_dir / "prompts"
        prompts_file = prompts_dir / "prompts.jsonl"

        prompts = [
            PromptEntry(
                timestamp=datetime.now(),
                session_id="s1",
                prompt="Implement with constraint",
                complexity_signals=ComplexitySignals(has_constraints=True),
            ),
            PromptEntry(
                timestamp=datetime.now(),
                session_id="s2",
                prompt="No constraints",
                complexity_signals=ComplexitySignals(has_constraints=False),
            ),
        ]

        with prompts_file.open("w", encoding="utf-8") as f:
            for prompt in prompts:
                data = prompt.model_dump()
                data["timestamp"] = prompt.timestamp.isoformat()
                f.write(json.dumps(data) + "\n")

        analyzer = HumanInsightsAnalyzer(logs_dir)
        analyzer.load_logs()  # Must load logs before analyzing
        patterns = analyzer.analyze_prompt_patterns()

        constraint_patterns = [p for p in patterns.effective if p.pattern == "explicit_constraints"]
        assert len(constraint_patterns) == 1

    def test_detect_high_ambiguity_pattern(self, temp_project_dir: Path):
        """Test detection of high ambiguity pattern (problematic)."""
        logs_dir = temp_project_dir / ".logs"
        prompts_dir = logs_dir / "prompts"
        prompts_file = prompts_dir / "prompts.jsonl"

        prompts = [
            PromptEntry(
                timestamp=datetime.now(),
                session_id="s1",
                prompt="Do something",
                complexity_signals=ComplexitySignals(ambiguity_score=0.9),
            ),
            PromptEntry(
                timestamp=datetime.now(),
                session_id="s2",
                prompt="Fix it somehow",
                complexity_signals=ComplexitySignals(ambiguity_score=0.8),
            ),
        ]

        with prompts_file.open("w", encoding="utf-8") as f:
            for prompt in prompts:
                data = prompt.model_dump()
                data["timestamp"] = prompt.timestamp.isoformat()
                f.write(json.dumps(data) + "\n")

        analyzer = HumanInsightsAnalyzer(logs_dir)
        analyzer.load_logs()  # Must load logs before analyzing
        patterns = analyzer.analyze_prompt_patterns()

        ambiguity_patterns = [p for p in patterns.problematic if p.pattern == "high_ambiguity"]
        assert len(ambiguity_patterns) == 1
        assert ambiguity_patterns[0].frequency == 2

    def test_detect_missing_acceptance_criteria_pattern(self, temp_project_dir: Path):
        """Test detection of missing acceptance criteria pattern."""
        logs_dir = temp_project_dir / ".logs"
        prompts_dir = logs_dir / "prompts"
        prompts_file = prompts_dir / "prompts.jsonl"

        prompts = [
            PromptEntry(
                timestamp=datetime.now(),
                session_id="s1",
                prompt="Add feature",
                complexity_signals=ComplexitySignals(has_acceptance_criteria=False),
            ),
        ]

        with prompts_file.open("w", encoding="utf-8") as f:
            for prompt in prompts:
                data = prompt.model_dump()
                data["timestamp"] = prompt.timestamp.isoformat()
                f.write(json.dumps(data) + "\n")

        analyzer = HumanInsightsAnalyzer(logs_dir)
        analyzer.load_logs()  # Must load logs before analyzing
        patterns = analyzer.analyze_prompt_patterns()

        missing_criteria = [
            p for p in patterns.problematic if p.pattern == "missing_acceptance_criteria"
        ]
        assert len(missing_criteria) == 1

    def test_empty_prompts_returns_empty_patterns(self, temp_project_dir: Path):
        """Test that empty prompts directory returns empty patterns."""
        logs_dir = temp_project_dir / ".logs"

        analyzer = HumanInsightsAnalyzer(logs_dir)
        patterns = analyzer.analyze_prompt_patterns()

        assert patterns.effective == []
        assert patterns.problematic == []

    def test_pattern_examples_truncated(self, temp_project_dir: Path):
        """Test that pattern examples are truncated to 200 chars."""
        logs_dir = temp_project_dir / ".logs"
        prompts_dir = logs_dir / "prompts"
        prompts_file = prompts_dir / "prompts.jsonl"

        long_prompt = "x" * 300
        prompts = [
            PromptEntry(
                timestamp=datetime.now(),
                session_id="s1",
                prompt=long_prompt,
                complexity_signals=ComplexitySignals(has_constraints=True),
            ),
        ]

        with prompts_file.open("w", encoding="utf-8") as f:
            for prompt in prompts:
                data = prompt.model_dump()
                data["timestamp"] = prompt.timestamp.isoformat()
                f.write(json.dumps(data) + "\n")

        analyzer = HumanInsightsAnalyzer(logs_dir)
        analyzer.load_logs()  # Must load logs before analyzing
        patterns = analyzer.analyze_prompt_patterns()

        constraint_pattern = patterns.effective[0]
        assert len(constraint_pattern.examples[0]) <= 200


class TestHumanInsightsAnalyzerFeedbackSummary:
    """Tests for HumanInsightsAnalyzer feedback summary calculation."""

    def test_feedback_summary_calculation(
        self, temp_project_dir: Path, sample_feedback: list[FeedbackEntry]
    ):
        """Test feedback summary is calculated correctly."""
        logs_dir = temp_project_dir / ".logs"
        feedback_dir = logs_dir / "feedback"
        feedback_file = feedback_dir / "feedback.jsonl"

        with feedback_file.open("w", encoding="utf-8") as f:
            for feedback in sample_feedback:
                data = feedback.model_dump()
                data["timestamp"] = feedback.timestamp.isoformat()
                f.write(json.dumps(data) + "\n")

        analyzer = HumanInsightsAnalyzer(logs_dir)
        analyzer.load_logs()  # Must load logs before analyzing
        summary = analyzer.analyze_feedback()

        # Based on sample_feedback: alignments are 5, 2, 4, 1, 5 => avg = 17/5 = 3.4
        assert summary.avg_alignment == 3.4
        assert summary.total_sessions == 3  # session-001, session-002, session-003

    def test_rework_distribution_calculation(self, temp_project_dir: Path):
        """Test rework distribution is calculated correctly."""
        logs_dir = temp_project_dir / ".logs"
        feedback_dir = logs_dir / "feedback"
        feedback_file = feedback_dir / "feedback.jsonl"

        feedbacks = [
            FeedbackEntry(
                timestamp=datetime.now(), session_id="s1", alignment=4, rework_needed="none"
            ),
            FeedbackEntry(
                timestamp=datetime.now(), session_id="s2", alignment=3, rework_needed="minor"
            ),
            FeedbackEntry(
                timestamp=datetime.now(), session_id="s3", alignment=2, rework_needed="significant"
            ),
            FeedbackEntry(
                timestamp=datetime.now(), session_id="s4", alignment=5, rework_needed="none"
            ),
        ]

        with feedback_file.open("w", encoding="utf-8") as f:
            for fb in feedbacks:
                data = fb.model_dump()
                data["timestamp"] = fb.timestamp.isoformat()
                f.write(json.dumps(data) + "\n")

        analyzer = HumanInsightsAnalyzer(logs_dir)
        analyzer.load_logs()  # Must load logs before analyzing
        summary = analyzer.analyze_feedback()

        assert summary.rework_distribution.none == 2
        assert summary.rework_distribution.minor == 1
        assert summary.rework_distribution.significant == 1

    def test_avg_revision_cycles_calculation(self, temp_project_dir: Path):
        """Test average revision cycles is calculated correctly."""
        logs_dir = temp_project_dir / ".logs"
        feedback_dir = logs_dir / "feedback"
        feedback_file = feedback_dir / "feedback.jsonl"

        feedbacks = [
            FeedbackEntry(
                timestamp=datetime.now(), session_id="s1", alignment=4, revision_cycles=2
            ),
            FeedbackEntry(
                timestamp=datetime.now(), session_id="s2", alignment=3, revision_cycles=4
            ),
            FeedbackEntry(
                timestamp=datetime.now(),
                session_id="s3",
                alignment=5,
                revision_cycles=None,  # Null - should be excluded
            ),
        ]

        with feedback_file.open("w", encoding="utf-8") as f:
            for fb in feedbacks:
                data = fb.model_dump()
                data["timestamp"] = fb.timestamp.isoformat()
                f.write(json.dumps(data) + "\n")

        analyzer = HumanInsightsAnalyzer(logs_dir)
        analyzer.load_logs()  # Must load logs before analyzing
        summary = analyzer.analyze_feedback()

        # Average of 2 and 4 = 3.0
        assert summary.avg_revision_cycles == 3.0

    def test_empty_feedback_returns_defaults(self, temp_project_dir: Path):
        """Test empty feedback returns default summary."""
        logs_dir = temp_project_dir / ".logs"

        analyzer = HumanInsightsAnalyzer(logs_dir)
        summary = analyzer.analyze_feedback()

        assert summary.avg_alignment == 0.0
        assert summary.total_sessions == 0
        assert summary.avg_revision_cycles == 0.0


class TestHumanInsightsAnalyzerFixToFeatureRatio:
    """Tests for HumanInsightsAnalyzer fix-to-feature ratio calculation."""

    def test_calculate_fix_to_feature_ratio_healthy(self, sample_commits: list[CommitInfo]):
        """Test fix-to-feature ratio calculation with healthy ratio."""
        ratio = HumanInsightsAnalyzer.calculate_fix_to_feature_ratio(sample_commits)

        # sample_commits has: 1 fix ("fix:"), 1 feat ("feat:"), 1 docs, 1 chore, 1 test, 1 refactor
        assert ratio.fix_commits >= 1
        assert ratio.feature_commits >= 1
        assert isinstance(ratio.is_healthy, bool)
        assert ratio.threshold == 0.1

    def test_calculate_fix_to_feature_ratio_unhealthy(self):
        """Test fix-to-feature ratio when fix commits exceed threshold."""
        commits = [
            CommitInfo(
                hash=f"abc{i}",
                short_hash=f"abc{i}",
                author="Dev",
                email="dev@test.com",
                date="2024-01-15",
                subject="fix: bug fix",
                body="",
                files=[],
                lines_added=5,
                lines_removed=2,
            )
            for i in range(10)  # 10 fix commits
        ] + [
            CommitInfo(
                hash="feat1",
                short_hash="feat1",
                author="Dev",
                email="dev@test.com",
                date="2024-01-16",
                subject="feat: new feature",
                body="",
                files=[],
                lines_added=50,
                lines_removed=0,
            )
        ]  # 1 feature commit

        ratio = HumanInsightsAnalyzer.calculate_fix_to_feature_ratio(commits)

        # 10 fixes / 1 feature = 10.0, which exceeds threshold of 0.1
        assert ratio.ratio > 0.1
        assert ratio.is_healthy is False

    def test_calculate_fix_to_feature_ratio_no_features(self):
        """Test fix-to-feature ratio when no feature commits."""
        commits = [
            CommitInfo(
                hash="fix1",
                short_hash="fix1",
                author="Dev",
                email="dev@test.com",
                date="2024-01-15",
                subject="fix: bug fix",
                body="",
                files=[],
                lines_added=5,
                lines_removed=2,
            )
        ]

        ratio = HumanInsightsAnalyzer.calculate_fix_to_feature_ratio(commits)

        assert ratio.ratio == float("inf")
        assert ratio.feature_commits == 0
        assert ratio.fix_commits == 1

    def test_calculate_fix_to_feature_ratio_no_commits(self):
        """Test fix-to-feature ratio with no commits."""
        ratio = HumanInsightsAnalyzer.calculate_fix_to_feature_ratio([])

        assert ratio.ratio == 0.0
        assert ratio.fix_commits == 0
        assert ratio.feature_commits == 0

    def test_fix_patterns_detection(self):
        """Test various fix patterns are detected."""
        commits = [
            CommitInfo(
                hash="1",
                short_hash="1",
                author="Dev",
                email="dev@test.com",
                date="2024-01-15",
                subject="fix: simple fix",
                body="",
                files=[],
                lines_added=1,
                lines_removed=1,
            ),
            CommitInfo(
                hash="2",
                short_hash="2",
                author="Dev",
                email="dev@test.com",
                date="2024-01-15",
                subject="bugfix: resolve issue",
                body="",
                files=[],
                lines_added=1,
                lines_removed=1,
            ),
            CommitInfo(
                hash="3",
                short_hash="3",
                author="Dev",
                email="dev@test.com",
                date="2024-01-15",
                subject="hotfix: emergency patch",
                body="",
                files=[],
                lines_added=1,
                lines_removed=1,
            ),
            CommitInfo(
                hash="4",
                short_hash="4",
                author="Dev",
                email="dev@test.com",
                date="2024-01-15",
                subject="revert: undo changes",
                body="",
                files=[],
                lines_added=1,
                lines_removed=1,
            ),
        ]

        ratio = HumanInsightsAnalyzer.calculate_fix_to_feature_ratio(commits)

        assert ratio.fix_commits == 4

    def test_feature_patterns_detection(self):
        """Test various feature patterns are detected."""
        commits = [
            CommitInfo(
                hash="1",
                short_hash="1",
                author="Dev",
                email="dev@test.com",
                date="2024-01-15",
                subject="feat: add new feature",
                body="",
                files=[],
                lines_added=50,
                lines_removed=0,
            ),
            CommitInfo(
                hash="2",
                short_hash="2",
                author="Dev",
                email="dev@test.com",
                date="2024-01-15",
                subject="add: new endpoint",
                body="",
                files=[],
                lines_added=30,
                lines_removed=0,
            ),
            CommitInfo(
                hash="3",
                short_hash="3",
                author="Dev",
                email="dev@test.com",
                date="2024-01-15",
                subject="implement: user auth",
                body="",
                files=[],
                lines_added=100,
                lines_removed=0,
            ),
        ]

        ratio = HumanInsightsAnalyzer.calculate_fix_to_feature_ratio(commits)

        assert ratio.feature_commits == 3


class TestHumanInsightsAnalyzerClaudeMdSuggestions:
    """Tests for HumanInsightsAnalyzer CLAUDE.md suggestions generation."""

    def test_generate_file_paths_suggestion(self, temp_project_dir: Path):
        """Test suggestion to add file paths section."""
        logs_dir = temp_project_dir / ".logs"
        prompts_dir = logs_dir / "prompts"
        prompts_file = prompts_dir / "prompts.jsonl"

        # 5+ prompts with file references
        prompts = [
            PromptEntry(
                timestamp=datetime.now() - timedelta(hours=i),
                session_id=f"s{i}",
                prompt=f"Update file{i}.py",
                complexity_signals=ComplexitySignals(file_references=1),
            )
            for i in range(6)
        ]

        with prompts_file.open("w", encoding="utf-8") as f:
            for prompt in prompts:
                data = prompt.model_dump()
                data["timestamp"] = prompt.timestamp.isoformat()
                f.write(json.dumps(data) + "\n")

        analyzer = HumanInsightsAnalyzer(logs_dir)
        analyzer.load_logs()  # Must load logs before analyzing
        suggestions = analyzer.generate_claude_md_suggestions()

        assert any("File Organization" in s for s in suggestions)

    def test_generate_task_templates_suggestion(self, temp_project_dir: Path):
        """Test suggestion to add task templates for ambiguous prompts."""
        logs_dir = temp_project_dir / ".logs"
        prompts_dir = logs_dir / "prompts"
        prompts_file = prompts_dir / "prompts.jsonl"

        # 3+ prompts with high ambiguity
        prompts = [
            PromptEntry(
                timestamp=datetime.now() - timedelta(hours=i),
                session_id=f"s{i}",
                prompt="Do something vague",
                complexity_signals=ComplexitySignals(ambiguity_score=0.9),
            )
            for i in range(4)
        ]

        with prompts_file.open("w", encoding="utf-8") as f:
            for prompt in prompts:
                data = prompt.model_dump()
                data["timestamp"] = prompt.timestamp.isoformat()
                f.write(json.dumps(data) + "\n")

        analyzer = HumanInsightsAnalyzer(logs_dir)
        analyzer.load_logs()  # Must load logs before analyzing
        suggestions = analyzer.generate_claude_md_suggestions()

        assert any("Task Templates" in s for s in suggestions)

    def test_generate_low_alignment_suggestion(self, temp_project_dir: Path):
        """Test suggestion when average alignment is low."""
        logs_dir = temp_project_dir / ".logs"
        feedback_dir = logs_dir / "feedback"
        feedback_file = feedback_dir / "feedback.jsonl"

        # 5+ sessions with low alignment
        feedbacks = [
            FeedbackEntry(
                timestamp=datetime.now() - timedelta(hours=i), session_id=f"s{i}", alignment=2
            )
            for i in range(6)
        ]

        with feedback_file.open("w", encoding="utf-8") as f:
            for fb in feedbacks:
                data = fb.model_dump()
                data["timestamp"] = fb.timestamp.isoformat()
                f.write(json.dumps(data) + "\n")

        analyzer = HumanInsightsAnalyzer(logs_dir)
        analyzer.load_logs()  # Must load logs before analyzing
        suggestions = analyzer.generate_claude_md_suggestions()

        assert any("context about project conventions" in s for s in suggestions)

    def test_generate_significant_rework_suggestion(self, temp_project_dir: Path):
        """Test suggestion when significant rework is frequent."""
        logs_dir = temp_project_dir / ".logs"
        feedback_dir = logs_dir / "feedback"
        feedback_file = feedback_dir / "feedback.jsonl"

        # 3+ significant rework entries
        feedbacks = [
            FeedbackEntry(
                timestamp=datetime.now() - timedelta(hours=i),
                session_id=f"s{i}",
                alignment=3,
                rework_needed="significant",
            )
            for i in range(4)
        ]

        with feedback_file.open("w", encoding="utf-8") as f:
            for fb in feedbacks:
                data = fb.model_dump()
                data["timestamp"] = fb.timestamp.isoformat()
                f.write(json.dumps(data) + "\n")

        analyzer = HumanInsightsAnalyzer(logs_dir)
        analyzer.load_logs()  # Must load logs before analyzing
        suggestions = analyzer.generate_claude_md_suggestions()

        assert any("error patterns" in s for s in suggestions)

    def test_generate_review_checklist_suggestion(self, temp_project_dir: Path):
        """Test suggestion when revision cycles are high."""
        logs_dir = temp_project_dir / ".logs"
        feedback_dir = logs_dir / "feedback"
        feedback_file = feedback_dir / "feedback.jsonl"

        # High revision cycles
        feedbacks = [
            FeedbackEntry(
                timestamp=datetime.now() - timedelta(hours=i),
                session_id=f"s{i}",
                alignment=4,
                revision_cycles=4,
            )
            for i in range(3)
        ]

        with feedback_file.open("w", encoding="utf-8") as f:
            for fb in feedbacks:
                data = fb.model_dump()
                data["timestamp"] = fb.timestamp.isoformat()
                f.write(json.dumps(data) + "\n")

        analyzer = HumanInsightsAnalyzer(logs_dir)
        analyzer.load_logs()  # Must load logs before analyzing
        suggestions = analyzer.generate_claude_md_suggestions()

        assert any("Review Checklist" in s for s in suggestions)


class TestHumanInsightsAnalyzerDataStatus:
    """Tests for HumanInsightsAnalyzer data status methods."""

    def test_has_data_with_prompts(
        self, temp_project_dir: Path, sample_prompts: list[PromptEntry]
    ):
        """Test has_data returns True when prompts exist."""
        logs_dir = temp_project_dir / ".logs"
        prompts_dir = logs_dir / "prompts"
        prompts_file = prompts_dir / "prompts.jsonl"

        with prompts_file.open("w", encoding="utf-8") as f:
            for prompt in sample_prompts:
                data = prompt.model_dump()
                data["timestamp"] = prompt.timestamp.isoformat()
                f.write(json.dumps(data) + "\n")

        analyzer = HumanInsightsAnalyzer(logs_dir)
        assert analyzer.has_data() is True

    def test_has_data_with_feedback(
        self, temp_project_dir: Path, sample_feedback: list[FeedbackEntry]
    ):
        """Test has_data returns True when feedback exists."""
        logs_dir = temp_project_dir / ".logs"
        feedback_dir = logs_dir / "feedback"
        feedback_file = feedback_dir / "feedback.jsonl"

        with feedback_file.open("w", encoding="utf-8") as f:
            for fb in sample_feedback:
                data = fb.model_dump()
                data["timestamp"] = fb.timestamp.isoformat()
                f.write(json.dumps(data) + "\n")

        analyzer = HumanInsightsAnalyzer(logs_dir)
        assert analyzer.has_data() is True

    def test_has_data_empty(self, temp_project_dir: Path):
        """Test has_data returns False when no data."""
        logs_dir = temp_project_dir / ".logs"

        analyzer = HumanInsightsAnalyzer(logs_dir)
        assert analyzer.has_data() is False

    def test_get_data_status(self, temp_project_dir: Path, sample_prompts: list[PromptEntry]):
        """Test get_data_status returns correct status."""
        logs_dir = temp_project_dir / ".logs"
        prompts_dir = logs_dir / "prompts"
        prompts_file = prompts_dir / "prompts.jsonl"

        with prompts_file.open("w", encoding="utf-8") as f:
            for prompt in sample_prompts:
                data = prompt.model_dump()
                data["timestamp"] = prompt.timestamp.isoformat()
                f.write(json.dumps(data) + "\n")

        analyzer = HumanInsightsAnalyzer(logs_dir)
        status = analyzer.get_data_status()

        assert status.prompts == len(sample_prompts)
        assert status.feedback == 0
        assert status.has_complexity_signals is True


class TestHumanInsightsAnalyzerFullAnalysis:
    """Tests for HumanInsightsAnalyzer.analyze method."""

    def test_analyze_returns_human_insights(
        self,
        temp_project_dir: Path,
        sample_prompts: list[PromptEntry],
        sample_feedback: list[FeedbackEntry],
    ):
        """Test analyze returns complete HumanInsights object."""
        logs_dir = temp_project_dir / ".logs"

        # Write prompts
        prompts_dir = logs_dir / "prompts"
        prompts_file = prompts_dir / "prompts.jsonl"
        with prompts_file.open("w", encoding="utf-8") as f:
            for prompt in sample_prompts:
                data = prompt.model_dump()
                data["timestamp"] = prompt.timestamp.isoformat()
                f.write(json.dumps(data) + "\n")

        # Write feedback
        feedback_dir = logs_dir / "feedback"
        feedback_file = feedback_dir / "feedback.jsonl"
        with feedback_file.open("w", encoding="utf-8") as f:
            for fb in sample_feedback:
                data = fb.model_dump()
                data["timestamp"] = fb.timestamp.isoformat()
                f.write(json.dumps(data) + "\n")

        analyzer = HumanInsightsAnalyzer(logs_dir)
        insights = analyzer.analyze()

        assert isinstance(insights, HumanInsights)
        assert isinstance(insights.prompt_patterns, PromptPatterns)
        assert isinstance(insights.feedback_summary, FeedbackSummary)
        assert isinstance(insights.claude_md_suggestions, list)


class TestHumanInsightsAnalyzerExtractTopInsights:
    """Tests for extract_top_insights method."""

    def test_extract_top_improvements(self, temp_project_dir: Path):
        """Test extraction of top improvement suggestions."""
        logs_dir = temp_project_dir / ".logs"
        feedback_dir = logs_dir / "feedback"
        feedback_file = feedback_dir / "feedback.jsonl"

        feedbacks = [
            FeedbackEntry(
                timestamp=datetime.now() - timedelta(hours=i),
                session_id=f"s{i}",
                alignment=3,
                improvement_suggestion=f"Improvement {i}",
            )
            for i in range(7)
        ]

        with feedback_file.open("w", encoding="utf-8") as f:
            for fb in feedbacks:
                data = fb.model_dump()
                data["timestamp"] = fb.timestamp.isoformat()
                f.write(json.dumps(data) + "\n")

        analyzer = HumanInsightsAnalyzer(logs_dir)
        analyzer.load_logs()
        insights_dict = analyzer.extract_top_insights()

        # Should limit to top 5
        assert len(insights_dict["improvements"]) <= 5

    def test_extract_top_successes(self, temp_project_dir: Path):
        """Test extraction of top successes."""
        logs_dir = temp_project_dir / ".logs"
        feedback_dir = logs_dir / "feedback"
        feedback_file = feedback_dir / "feedback.jsonl"

        feedbacks = [
            FeedbackEntry(
                timestamp=datetime.now() - timedelta(hours=i),
                session_id=f"s{i}",
                alignment=5,
                worked_well=f"Success {i}",
            )
            for i in range(7)
        ]

        with feedback_file.open("w", encoding="utf-8") as f:
            for fb in feedbacks:
                data = fb.model_dump()
                data["timestamp"] = fb.timestamp.isoformat()
                f.write(json.dumps(data) + "\n")

        analyzer = HumanInsightsAnalyzer(logs_dir)
        analyzer.load_logs()
        insights_dict = analyzer.extract_top_insights()

        # Should limit to top 5
        assert len(insights_dict["successes"]) <= 5

    def test_extract_deduplicates_insights(self, temp_project_dir: Path):
        """Test that duplicate insights are deduplicated."""
        logs_dir = temp_project_dir / ".logs"
        feedback_dir = logs_dir / "feedback"
        feedback_file = feedback_dir / "feedback.jsonl"

        # Same improvement suggestion twice
        feedbacks = [
            FeedbackEntry(
                timestamp=datetime.now() - timedelta(hours=1),
                session_id="s1",
                alignment=3,
                improvement_suggestion="Same suggestion",
            ),
            FeedbackEntry(
                timestamp=datetime.now(),
                session_id="s2",
                alignment=3,
                improvement_suggestion="Same suggestion",
            ),
        ]

        with feedback_file.open("w", encoding="utf-8") as f:
            for fb in feedbacks:
                data = fb.model_dump()
                data["timestamp"] = fb.timestamp.isoformat()
                f.write(json.dumps(data) + "\n")

        analyzer = HumanInsightsAnalyzer(logs_dir)
        analyzer.load_logs()
        insights_dict = analyzer.extract_top_insights()

        assert len(insights_dict["improvements"]) == 1


class TestDataStatusDataclass:
    """Tests for DataStatus dataclass."""

    def test_data_status_creation(self):
        """Test DataStatus dataclass creation."""
        status = DataStatus(prompts=10, feedback=5, has_complexity_signals=True)

        assert status.prompts == 10
        assert status.feedback == 5
        assert status.has_complexity_signals is True

    def test_data_status_defaults(self):
        """Test DataStatus default values."""
        status = DataStatus()

        assert status.prompts == 0
        assert status.feedback == 0
        assert status.has_complexity_signals is False

"""Tests for Decision analyzer in agentic_retrospective.analyzers.decisions."""

import json
from pathlib import Path

import pytest

from agentic_retrospective.analyzers.decisions import (
    DataQuality,
    DecisionAnalysisResult,
    DecisionAnalyzer,
    EscalationStats,
)
from agentic_retrospective.models import DecisionRecord


class TestDecisionAnalyzerLoadRecords:
    """Tests for DecisionAnalyzer record loading from JSONL files."""

    def test_load_records_from_jsonl_file(
        self, temp_project_dir: Path, sample_decisions: list[DecisionRecord]
    ):
        """Test loading records from a JSONL file."""
        # Create decisions JSONL file
        decisions_dir = temp_project_dir / "decisions"
        decisions_file = decisions_dir / "decisions.jsonl"

        with decisions_file.open("w", encoding="utf-8") as f:
            for decision in sample_decisions:
                f.write(json.dumps(decision.model_dump()) + "\n")

        analyzer = DecisionAnalyzer(decisions_dir)
        result = analyzer.analyze()

        assert len(result.records) == len(sample_decisions)

    def test_load_records_from_multiple_files(self, temp_project_dir: Path):
        """Test loading records from multiple JSONL files."""
        decisions_dir = temp_project_dir / "decisions"

        # Create first file with 2 decisions
        file1 = decisions_dir / "sprint1.jsonl"
        with file1.open("w", encoding="utf-8") as f:
            f.write(json.dumps({"ts": "2024-01-01", "decision": "Decision 1"}) + "\n")
            f.write(json.dumps({"ts": "2024-01-02", "decision": "Decision 2"}) + "\n")

        # Create second file with 1 decision
        file2 = decisions_dir / "sprint2.jsonl"
        with file2.open("w", encoding="utf-8") as f:
            f.write(json.dumps({"ts": "2024-01-03", "decision": "Decision 3"}) + "\n")

        analyzer = DecisionAnalyzer(decisions_dir)
        result = analyzer.analyze()

        assert len(result.records) == 3

    def test_load_records_skips_non_jsonl_files(self, temp_project_dir: Path):
        """Test that non-JSONL files are skipped."""
        decisions_dir = temp_project_dir / "decisions"

        # Create JSONL file
        jsonl_file = decisions_dir / "decisions.jsonl"
        with jsonl_file.open("w", encoding="utf-8") as f:
            f.write(json.dumps({"ts": "2024-01-01", "decision": "Decision 1"}) + "\n")

        # Create non-JSONL file
        txt_file = decisions_dir / "notes.txt"
        txt_file.write_text("Some notes")

        analyzer = DecisionAnalyzer(decisions_dir)
        result = analyzer.analyze()

        assert len(result.records) == 1

    def test_load_records_handles_empty_directory(self, temp_project_dir: Path):
        """Test handling of empty decisions directory."""
        decisions_dir = temp_project_dir / "decisions"
        # Directory is already empty from fixture

        analyzer = DecisionAnalyzer(decisions_dir)
        result = analyzer.analyze()

        assert len(result.records) == 0

    def test_load_records_handles_nonexistent_directory(self, temp_project_dir: Path):
        """Test handling of nonexistent directory."""
        nonexistent_dir = temp_project_dir / "nonexistent"

        analyzer = DecisionAnalyzer(nonexistent_dir)
        result = analyzer.analyze()

        assert len(result.records) == 0

    def test_load_records_skips_empty_lines(self, temp_project_dir: Path):
        """Test that empty lines in JSONL files are skipped."""
        decisions_dir = temp_project_dir / "decisions"
        decisions_file = decisions_dir / "decisions.jsonl"

        with decisions_file.open("w", encoding="utf-8") as f:
            f.write(json.dumps({"ts": "2024-01-01", "decision": "Decision 1"}) + "\n")
            f.write("\n")  # Empty line
            f.write("   \n")  # Whitespace only line
            f.write(json.dumps({"ts": "2024-01-02", "decision": "Decision 2"}) + "\n")

        analyzer = DecisionAnalyzer(decisions_dir)
        result = analyzer.analyze()

        assert len(result.records) == 2


class TestDecisionAnalyzerNormalization:
    """Tests for DecisionAnalyzer field normalization."""

    def test_normalize_decision_type_with_hyphens(self, temp_project_dir: Path):
        """Test normalization of decision_type with hyphens to underscores."""
        decisions_dir = temp_project_dir / "decisions"
        decisions_file = decisions_dir / "decisions.jsonl"

        with decisions_file.open("w", encoding="utf-8") as f:
            f.write(
                json.dumps(
                    {"ts": "2024-01-01", "decision_type": "one-way-door", "decision": "Test"}
                )
                + "\n"
            )

        analyzer = DecisionAnalyzer(decisions_dir)
        result = analyzer.analyze()

        assert result.records[0].decision_type == "one_way_door"

    def test_normalize_invalid_decision_type_to_unknown(self, temp_project_dir: Path):
        """Test that invalid decision types are normalized to 'unknown'."""
        decisions_dir = temp_project_dir / "decisions"
        decisions_file = decisions_dir / "decisions.jsonl"

        with decisions_file.open("w", encoding="utf-8") as f:
            f.write(
                json.dumps(
                    {"ts": "2024-01-01", "decision_type": "invalid_type", "decision": "Test"}
                )
                + "\n"
            )

        analyzer = DecisionAnalyzer(decisions_dir)
        result = analyzer.analyze()

        assert result.records[0].decision_type == "unknown"

    def test_normalize_type_alias_for_decision_type(self, temp_project_dir: Path):
        """Test that 'type' field is used as alias for decision_type."""
        decisions_dir = temp_project_dir / "decisions"
        decisions_file = decisions_dir / "decisions.jsonl"

        with decisions_file.open("w", encoding="utf-8") as f:
            f.write(
                json.dumps({"ts": "2024-01-01", "type": "two_way_door", "decision": "Test"}) + "\n"
            )

        analyzer = DecisionAnalyzer(decisions_dir)
        result = analyzer.analyze()

        assert result.records[0].decision_type == "two_way_door"

    def test_normalize_summary_alias_for_decision(self, temp_project_dir: Path):
        """Test that 'summary' field populates decision if decision is missing."""
        decisions_dir = temp_project_dir / "decisions"
        decisions_file = decisions_dir / "decisions.jsonl"

        with decisions_file.open("w", encoding="utf-8") as f:
            f.write(json.dumps({"ts": "2024-01-01", "summary": "Use Redis for caching"}) + "\n")

        analyzer = DecisionAnalyzer(decisions_dir)
        result = analyzer.analyze()

        assert result.records[0].decision == "Use Redis for caching"

    def test_normalize_reasoning_alias_for_rationale(self, temp_project_dir: Path):
        """Test that 'reasoning' field populates rationale if rationale is missing."""
        decisions_dir = temp_project_dir / "decisions"
        decisions_file = decisions_dir / "decisions.jsonl"

        with decisions_file.open("w", encoding="utf-8") as f:
            f.write(
                json.dumps(
                    {
                        "ts": "2024-01-01",
                        "decision": "Test",
                        "reasoning": "Performance requirements",
                    }
                )
                + "\n"
            )

        analyzer = DecisionAnalyzer(decisions_dir)
        result = analyzer.analyze()

        assert result.records[0].rationale == "Performance requirements"

    def test_normalize_chosen_alias_for_chosen_option(self, temp_project_dir: Path):
        """Test that 'chosen' field populates chosen_option if chosen_option is missing."""
        decisions_dir = temp_project_dir / "decisions"
        decisions_file = decisions_dir / "decisions.jsonl"

        with decisions_file.open("w", encoding="utf-8") as f:
            f.write(
                json.dumps({"ts": "2024-01-01", "decision": "Test", "chosen": "Option A"}) + "\n"
            )

        analyzer = DecisionAnalyzer(decisions_dir)
        result = analyzer.analyze()

        assert result.records[0].chosen_option == "Option A"

    def test_normalize_timestamp_alias_for_ts(self, temp_project_dir: Path):
        """Test that 'timestamp' field is captured correctly."""
        decisions_dir = temp_project_dir / "decisions"
        decisions_file = decisions_dir / "decisions.jsonl"

        with decisions_file.open("w", encoding="utf-8") as f:
            f.write(
                json.dumps(
                    {"timestamp": "2024-01-01T10:00:00", "ts": "", "decision": "Test"}
                )
                + "\n"
            )

        analyzer = DecisionAnalyzer(decisions_dir)
        result = analyzer.analyze()

        assert result.records[0].timestamp == "2024-01-01T10:00:00"


class TestDecisionAnalyzerEscalationStats:
    """Tests for DecisionAnalyzer escalation statistics calculation."""

    def test_escalation_stats_with_all_escalated(self, temp_project_dir: Path):
        """Test escalation stats when all one-way doors are escalated."""
        decisions_dir = temp_project_dir / "decisions"
        decisions_file = decisions_dir / "decisions.jsonl"

        with decisions_file.open("w", encoding="utf-8") as f:
            # 3 one-way doors, all escalated to human
            for i in range(3):
                f.write(
                    json.dumps(
                        {
                            "ts": f"2024-01-0{i+1}",
                            "decision_type": "one_way_door",
                            "actor": "human",
                            "decision": f"Decision {i}",
                        }
                    )
                    + "\n"
                )

        analyzer = DecisionAnalyzer(decisions_dir)
        result = analyzer.analyze()

        assert result.escalation_stats.total == 3
        assert result.escalation_stats.escalated == 3
        assert result.escalation_stats.rate == 100.0

    def test_escalation_stats_with_none_escalated(self, temp_project_dir: Path):
        """Test escalation stats when no one-way doors are escalated."""
        decisions_dir = temp_project_dir / "decisions"
        decisions_file = decisions_dir / "decisions.jsonl"

        with decisions_file.open("w", encoding="utf-8") as f:
            # 3 one-way doors, all made by agent (not escalated)
            for i in range(3):
                f.write(
                    json.dumps(
                        {
                            "ts": f"2024-01-0{i+1}",
                            "decision_type": "one_way_door",
                            "actor": "agent",
                            "decision": f"Decision {i}",
                        }
                    )
                    + "\n"
                )

        analyzer = DecisionAnalyzer(decisions_dir)
        result = analyzer.analyze()

        assert result.escalation_stats.total == 3
        assert result.escalation_stats.escalated == 0
        assert result.escalation_stats.rate == 0.0

    def test_escalation_stats_with_partial_escalation(self, temp_project_dir: Path):
        """Test escalation stats with partial escalation."""
        decisions_dir = temp_project_dir / "decisions"
        decisions_file = decisions_dir / "decisions.jsonl"

        with decisions_file.open("w", encoding="utf-8") as f:
            # 2 escalated, 2 not escalated
            f.write(
                json.dumps(
                    {
                        "ts": "2024-01-01",
                        "decision_type": "one_way_door",
                        "actor": "human",
                        "decision": "D1",
                    }
                )
                + "\n"
            )
            f.write(
                json.dumps(
                    {
                        "ts": "2024-01-02",
                        "decision_type": "one_way_door",
                        "actor": "human",
                        "decision": "D2",
                    }
                )
                + "\n"
            )
            f.write(
                json.dumps(
                    {
                        "ts": "2024-01-03",
                        "decision_type": "one_way_door",
                        "actor": "agent",
                        "decision": "D3",
                    }
                )
                + "\n"
            )
            f.write(
                json.dumps(
                    {
                        "ts": "2024-01-04",
                        "decision_type": "one_way_door",
                        "actor": "agent",
                        "decision": "D4",
                    }
                )
                + "\n"
            )

        analyzer = DecisionAnalyzer(decisions_dir)
        result = analyzer.analyze()

        assert result.escalation_stats.total == 4
        assert result.escalation_stats.escalated == 2
        assert result.escalation_stats.rate == 50.0

    def test_escalation_stats_with_no_one_way_doors(self, temp_project_dir: Path):
        """Test escalation stats when there are no one-way door decisions."""
        decisions_dir = temp_project_dir / "decisions"
        decisions_file = decisions_dir / "decisions.jsonl"

        with decisions_file.open("w", encoding="utf-8") as f:
            # All two-way doors
            for i in range(3):
                f.write(
                    json.dumps(
                        {
                            "ts": f"2024-01-0{i+1}",
                            "decision_type": "two_way_door",
                            "actor": "agent",
                            "decision": f"Decision {i}",
                        }
                    )
                    + "\n"
                )

        analyzer = DecisionAnalyzer(decisions_dir)
        result = analyzer.analyze()

        assert result.escalation_stats.total == 0
        assert result.escalation_stats.rate == 100.0  # Default rate when no one-way doors


class TestDecisionAnalyzerDataQuality:
    """Tests for DecisionAnalyzer data quality analysis."""

    def test_data_quality_counts_malformed_records(self, temp_project_dir: Path):
        """Test data quality counts malformed JSON records."""
        decisions_dir = temp_project_dir / "decisions"
        decisions_file = decisions_dir / "decisions.jsonl"

        with decisions_file.open("w", encoding="utf-8") as f:
            f.write(json.dumps({"ts": "2024-01-01", "decision": "Valid"}) + "\n")
            f.write("invalid json\n")  # Malformed
            f.write('{"unclosed": "bracket"\n')  # Malformed
            f.write(json.dumps({"ts": "2024-01-02", "decision": "Valid 2"}) + "\n")

        analyzer = DecisionAnalyzer(decisions_dir)
        result = analyzer.analyze()

        assert result.data_quality.total_records == 4
        assert result.data_quality.valid_records == 2
        assert result.data_quality.malformed_records == 2

    def test_data_quality_tracks_missing_fields(self, temp_project_dir: Path):
        """Test data quality tracks missing optional fields."""
        decisions_dir = temp_project_dir / "decisions"
        decisions_file = decisions_dir / "decisions.jsonl"

        with decisions_file.open("w", encoding="utf-8") as f:
            # Missing category and rationale
            f.write(json.dumps({"ts": "2024-01-01", "decision": "Test"}) + "\n")
            # Missing rationale
            f.write(
                json.dumps({"ts": "2024-01-02", "decision": "Test 2", "category": "api"}) + "\n"
            )

        analyzer = DecisionAnalyzer(decisions_dir)
        result = analyzer.analyze()

        assert "category" in result.data_quality.missing_fields
        assert result.data_quality.missing_fields["category"] == 1
        assert "rationale" in result.data_quality.missing_fields
        assert result.data_quality.missing_fields["rationale"] == 2

    def test_data_quality_invalid_records_without_timestamp(self, temp_project_dir: Path):
        """Test records without timestamp are marked invalid."""
        decisions_dir = temp_project_dir / "decisions"
        decisions_file = decisions_dir / "decisions.jsonl"

        with decisions_file.open("w", encoding="utf-8") as f:
            f.write(json.dumps({"ts": "2024-01-01", "decision": "Valid"}) + "\n")
            f.write(json.dumps({"decision": "No timestamp"}) + "\n")  # Invalid - no ts

        analyzer = DecisionAnalyzer(decisions_dir)
        result = analyzer.analyze()

        # Only the valid record should be in records list
        assert len(result.records) == 1
        assert result.data_quality.valid_records == 1


class TestDecisionAnalyzerMissedAndTrivialEscalations:
    """Tests for get_missed_escalations and get_trivial_escalations methods."""

    def test_get_missed_escalations(self, temp_project_dir: Path):
        """Test get_missed_escalations returns one-way doors made by agent."""
        decisions_dir = temp_project_dir / "decisions"
        decisions_file = decisions_dir / "decisions.jsonl"

        with decisions_file.open("w", encoding="utf-8") as f:
            # One-way door by agent (missed escalation)
            f.write(
                json.dumps(
                    {
                        "ts": "2024-01-01",
                        "decision_type": "one_way_door",
                        "actor": "agent",
                        "decision": "Missed",
                    }
                )
                + "\n"
            )
            # One-way door by human (proper escalation)
            f.write(
                json.dumps(
                    {
                        "ts": "2024-01-02",
                        "decision_type": "one_way_door",
                        "actor": "human",
                        "decision": "Proper",
                    }
                )
                + "\n"
            )
            # Two-way door by agent (not relevant)
            f.write(
                json.dumps(
                    {
                        "ts": "2024-01-03",
                        "decision_type": "two_way_door",
                        "actor": "agent",
                        "decision": "Two-way",
                    }
                )
                + "\n"
            )

        analyzer = DecisionAnalyzer(decisions_dir)
        missed = analyzer.get_missed_escalations()

        assert len(missed) == 1
        assert missed[0].decision == "Missed"

    def test_get_trivial_escalations(self, temp_project_dir: Path):
        """Test get_trivial_escalations returns two-way doors made by human."""
        decisions_dir = temp_project_dir / "decisions"
        decisions_file = decisions_dir / "decisions.jsonl"

        with decisions_file.open("w", encoding="utf-8") as f:
            # Two-way door by human (trivial escalation)
            f.write(
                json.dumps(
                    {
                        "ts": "2024-01-01",
                        "decision_type": "two_way_door",
                        "actor": "human",
                        "decision": "Trivial",
                    }
                )
                + "\n"
            )
            # Two-way door by agent (proper)
            f.write(
                json.dumps(
                    {
                        "ts": "2024-01-02",
                        "decision_type": "two_way_door",
                        "actor": "agent",
                        "decision": "Proper",
                    }
                )
                + "\n"
            )
            # One-way door by human (not relevant)
            f.write(
                json.dumps(
                    {
                        "ts": "2024-01-03",
                        "decision_type": "one_way_door",
                        "actor": "human",
                        "decision": "One-way",
                    }
                )
                + "\n"
            )

        analyzer = DecisionAnalyzer(decisions_dir)
        trivial = analyzer.get_trivial_escalations()

        assert len(trivial) == 1
        assert trivial[0].decision == "Trivial"


class TestDecisionAnalyzerCategorization:
    """Tests for DecisionAnalyzer decision categorization."""

    def test_group_by_category(self, temp_project_dir: Path):
        """Test decisions are grouped by category correctly."""
        decisions_dir = temp_project_dir / "decisions"
        decisions_file = decisions_dir / "decisions.jsonl"

        with decisions_file.open("w", encoding="utf-8") as f:
            f.write(
                json.dumps(
                    {"ts": "2024-01-01", "category": "architecture", "decision": "D1"}
                )
                + "\n"
            )
            f.write(
                json.dumps({"ts": "2024-01-02", "category": "api", "decision": "D2"}) + "\n"
            )
            f.write(
                json.dumps(
                    {"ts": "2024-01-03", "category": "architecture", "decision": "D3"}
                )
                + "\n"
            )

        analyzer = DecisionAnalyzer(decisions_dir)
        result = analyzer.analyze()

        assert len(result.by_category["architecture"]) == 2
        assert len(result.by_category["api"]) == 1

    def test_group_by_actor(self, temp_project_dir: Path):
        """Test decisions are grouped by actor correctly."""
        decisions_dir = temp_project_dir / "decisions"
        decisions_file = decisions_dir / "decisions.jsonl"

        with decisions_file.open("w", encoding="utf-8") as f:
            f.write(
                json.dumps({"ts": "2024-01-01", "actor": "human", "decision": "D1"}) + "\n"
            )
            f.write(
                json.dumps({"ts": "2024-01-02", "actor": "agent", "decision": "D2"}) + "\n"
            )
            f.write(
                json.dumps({"ts": "2024-01-03", "actor": "human", "decision": "D3"}) + "\n"
            )

        analyzer = DecisionAnalyzer(decisions_dir)
        result = analyzer.analyze()

        assert len(result.by_actor["human"]) == 2
        assert len(result.by_actor["agent"]) == 1

    def test_group_by_decision_type(self, temp_project_dir: Path):
        """Test decisions are grouped by decision type correctly."""
        decisions_dir = temp_project_dir / "decisions"
        decisions_file = decisions_dir / "decisions.jsonl"

        with decisions_file.open("w", encoding="utf-8") as f:
            f.write(
                json.dumps(
                    {"ts": "2024-01-01", "decision_type": "one_way_door", "decision": "D1"}
                )
                + "\n"
            )
            f.write(
                json.dumps(
                    {"ts": "2024-01-02", "decision_type": "two_way_door", "decision": "D2"}
                )
                + "\n"
            )

        analyzer = DecisionAnalyzer(decisions_dir)
        result = analyzer.analyze()

        assert len(result.by_type["one_way_door"]) == 1
        assert len(result.by_type["two_way_door"]) == 1


class TestDataQualityDataclass:
    """Tests for DataQuality dataclass."""

    def test_data_quality_creation(self):
        """Test DataQuality dataclass creation."""
        quality = DataQuality(
            total_records=10,
            valid_records=8,
            malformed_records=2,
            missing_fields={"category": 3, "rationale": 5},
        )

        assert quality.total_records == 10
        assert quality.valid_records == 8
        assert quality.missing_fields["category"] == 3


class TestEscalationStatsDataclass:
    """Tests for EscalationStats dataclass."""

    def test_escalation_stats_creation(self):
        """Test EscalationStats dataclass creation."""
        stats = EscalationStats(total=10, escalated=7, rate=70.0)

        assert stats.total == 10
        assert stats.escalated == 7
        assert stats.rate == 70.0

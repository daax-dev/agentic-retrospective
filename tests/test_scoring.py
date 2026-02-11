"""Tests for scoring rubrics in agentic_retrospective.scoring."""

import pytest

from agentic_retrospective.scoring import (
    ActionItem,
    CollaborationEfficiencyData,
    ConfidenceFactors,
    ConfidenceLevel,
    DecisionHygieneData,
    DeliveryPredictabilityData,
    QualityMaintainabilityData,
    Score,
    SecurityPostureData,
    TestLoopCompletenessData,
    calculate_priority_score,
    calculate_score,
    determine_confidence,
    score_collaboration_efficiency,
    score_decision_hygiene,
    score_delivery_predictability,
    score_quality_maintainability,
    score_security_posture,
    score_test_loop_completeness,
)


class TestCalculateScore:
    """Tests for calculate_score helper function."""

    def test_calculate_score_with_all_params(self):
        """Test calculate_score creates Score with all parameters."""
        score = calculate_score(
            value=4,
            confidence=ConfidenceLevel.HIGH,
            evidence=["Test 1", "Test 2"],
            details="Additional context",
        )

        assert score.score == 4
        assert score.confidence == ConfidenceLevel.HIGH
        assert score.evidence == ["Test 1", "Test 2"]
        assert score.details == "Additional context"

    def test_calculate_score_with_none_value(self):
        """Test calculate_score with None score value."""
        score = calculate_score(value=None, confidence=ConfidenceLevel.NONE, evidence=[])

        assert score.score is None
        assert score.confidence == ConfidenceLevel.NONE


class TestCalculatePriorityScore:
    """Tests for calculate_priority_score function."""

    def test_calculate_priority_score_high_impact_low_effort(self):
        """Test priority calculation for high impact, low effort items."""
        item = ActionItem(impact=5, risk_reduction=5, effort=1)
        priority = calculate_priority_score(item)

        # (5 + 5) / 1 = 10
        assert priority == 10.0

    def test_calculate_priority_score_low_impact_high_effort(self):
        """Test priority calculation for low impact, high effort items."""
        item = ActionItem(impact=1, risk_reduction=1, effort=5)
        priority = calculate_priority_score(item)

        # (1 + 1) / 5 = 0.4
        assert priority == 0.4

    def test_calculate_priority_score_balanced(self):
        """Test priority calculation for balanced items."""
        item = ActionItem(impact=3, risk_reduction=3, effort=3)
        priority = calculate_priority_score(item)

        # (3 + 3) / 3 = 2
        assert priority == 2.0

    def test_calculate_priority_score_default_effort(self):
        """Test priority calculation with default effort value."""
        item = ActionItem(impact=4, risk_reduction=4)
        priority = calculate_priority_score(item)

        # (4 + 4) / 1 = 8 (default effort is 1)
        assert priority == 8.0


class TestScoreDeliveryPredictability:
    """Tests for score_delivery_predictability function."""

    def test_no_commits_returns_none_score(self):
        """Test with no commits returns None score with NONE confidence."""
        data = DeliveryPredictabilityData(commit_count=0, avg_commit_size=0.0)
        score = score_delivery_predictability(data)

        assert score.score is None
        assert score.confidence == ConfidenceLevel.NONE
        assert "No commits found" in score.evidence

    def test_small_commits_returns_high_score(self):
        """Test small commits (< 50 lines) return score of 5."""
        data = DeliveryPredictabilityData(commit_count=10, avg_commit_size=30.0)
        score = score_delivery_predictability(data)

        assert score.score == 5
        assert score.confidence == ConfidenceLevel.HIGH
        assert any("Small commits" in e for e in score.evidence)

    def test_reasonable_commits_returns_score_4(self):
        """Test reasonable commits (50-100 lines) return score of 4."""
        data = DeliveryPredictabilityData(commit_count=10, avg_commit_size=75.0)
        score = score_delivery_predictability(data)

        assert score.score == 4
        assert any("Reasonable commit size" in e for e in score.evidence)

    def test_medium_commits_returns_score_3(self):
        """Test medium commits (100-200 lines) return score of 3."""
        data = DeliveryPredictabilityData(commit_count=10, avg_commit_size=150.0)
        score = score_delivery_predictability(data)

        assert score.score == 3
        assert any("Medium commits" in e for e in score.evidence)

    def test_large_commits_returns_low_score(self):
        """Test large commits (> 200 lines) return low score."""
        data = DeliveryPredictabilityData(commit_count=10, avg_commit_size=300.0)
        score = score_delivery_predictability(data)

        assert score.score <= 2
        assert any("Large commits" in e for e in score.evidence)

    def test_scope_drift_reduces_score(self):
        """Test scope drift incidents reduce the score."""
        data_no_drift = DeliveryPredictabilityData(
            commit_count=10, avg_commit_size=30.0, scope_drift_incidents=0
        )
        data_with_drift = DeliveryPredictabilityData(
            commit_count=10, avg_commit_size=30.0, scope_drift_incidents=2
        )

        score_no_drift = score_delivery_predictability(data_no_drift)
        score_with_drift = score_delivery_predictability(data_with_drift)

        assert score_with_drift.score < score_no_drift.score
        assert any("scope drift" in e for e in score_with_drift.evidence)

    def test_score_minimum_is_1(self):
        """Test score never goes below 1."""
        data = DeliveryPredictabilityData(
            commit_count=10, avg_commit_size=500.0, scope_drift_incidents=5
        )
        score = score_delivery_predictability(data)

        assert score.score >= 1


class TestScoreTestLoopCompleteness:
    """Tests for score_test_loop_completeness function."""

    def test_no_test_results_no_commits_returns_none(self):
        """Test without test results and no test commits returns None score."""
        data = TestLoopCompletenessData(has_test_results=False, test_related_commits=0)
        score = score_test_loop_completeness(data)

        assert score.score is None
        assert score.confidence == ConfidenceLevel.NONE
        assert "No test data available" in (score.details or "")

    def test_no_test_results_with_commits_returns_inferred_score(self):
        """Test without test results but with test commits returns inferred score."""
        data = TestLoopCompletenessData(has_test_results=False, test_related_commits=5)
        score = score_test_loop_completeness(data)

        assert score.score == 3
        assert score.confidence == ConfidenceLevel.LOW
        assert any("Inferred" in e for e in score.evidence)

    def test_high_pass_rate_returns_score_5(self):
        """Test high pass rate (>= 95%) returns score of 5."""
        data = TestLoopCompletenessData(has_test_results=True, pass_rate=98.0)
        score = score_test_loop_completeness(data)

        assert score.score == 5
        assert any("98.0% pass rate" in e for e in score.evidence)

    def test_good_pass_rate_returns_score_4(self):
        """Test good pass rate (85-95%) returns score of 4."""
        data = TestLoopCompletenessData(has_test_results=True, pass_rate=90.0)
        score = score_test_loop_completeness(data)

        assert score.score == 4

    def test_moderate_pass_rate_returns_score_3(self):
        """Test moderate pass rate (70-85%) returns score of 3."""
        data = TestLoopCompletenessData(has_test_results=True, pass_rate=78.0)
        score = score_test_loop_completeness(data)

        assert score.score == 3

    def test_low_pass_rate_returns_score_2(self):
        """Test low pass rate (< 70%) returns score of 2."""
        data = TestLoopCompletenessData(has_test_results=True, pass_rate=55.0)
        score = score_test_loop_completeness(data)

        assert score.score == 2
        assert any("Low pass rate" in e for e in score.evidence)

    def test_human_debug_events_reduce_score(self):
        """Test excessive human debug events reduce the score."""
        data_few_debugs = TestLoopCompletenessData(
            has_test_results=True, pass_rate=90.0, human_debug_events=2
        )
        data_many_debugs = TestLoopCompletenessData(
            has_test_results=True, pass_rate=90.0, human_debug_events=10
        )

        score_few = score_test_loop_completeness(data_few_debugs)
        score_many = score_test_loop_completeness(data_many_debugs)

        assert score_many.score < score_few.score
        assert any("human debug" in e for e in score_many.evidence)


class TestScoreQualityMaintainability:
    """Tests for score_quality_maintainability function."""

    def test_no_commits_returns_none(self):
        """Test with no commits returns None score."""
        data = QualityMaintainabilityData(commit_count=0)
        score = score_quality_maintainability(data)

        assert score.score is None
        assert "No commits found" in score.evidence

    def test_few_large_commits_increases_score(self):
        """Test few large commits (< 5%) increases score."""
        data = QualityMaintainabilityData(commit_count=100, large_commit_count=2)
        score = score_quality_maintainability(data)

        assert score.score >= 4

    def test_many_large_commits_decreases_score(self):
        """Test many large commits (> 30%) decreases score."""
        data = QualityMaintainabilityData(commit_count=10, large_commit_count=5)
        score = score_quality_maintainability(data)

        assert score.score <= 2
        assert any("large commits" in e for e in score.evidence)

    def test_docs_commits_add_evidence(self):
        """Test documentation commits are noted in evidence."""
        data = QualityMaintainabilityData(commit_count=10, docs_commit_count=3)
        score = score_quality_maintainability(data)

        assert any("documentation commits" in e for e in score.evidence)

    def test_test_commits_increase_score(self):
        """Test commits increase the score."""
        data_no_tests = QualityMaintainabilityData(commit_count=10, test_commit_count=0)
        data_with_tests = QualityMaintainabilityData(commit_count=10, test_commit_count=5)

        score_no_tests = score_quality_maintainability(data_no_tests)
        score_with_tests = score_quality_maintainability(data_with_tests)

        assert score_with_tests.score > score_no_tests.score


class TestScoreSecurityPosture:
    """Tests for score_security_posture function."""

    def test_no_security_scans_returns_none(self):
        """Test without security scans returns None score."""
        data = SecurityPostureData(has_security_scans=False)
        score = score_security_posture(data)

        assert score.score is None
        assert score.confidence == ConfidenceLevel.NONE
        assert "No security scan data" in (score.details or "")

    def test_no_vulnerabilities_returns_score_5(self):
        """Test no vulnerabilities found returns score of 5."""
        data = SecurityPostureData(has_security_scans=True, vulnerabilities_found=0)
        score = score_security_posture(data)

        assert score.score == 5
        assert any("No vulnerabilities" in e for e in score.evidence)

    def test_few_vulnerabilities_returns_score_4(self):
        """Test 1-3 vulnerabilities returns score of 4."""
        data = SecurityPostureData(has_security_scans=True, vulnerabilities_found=2)
        score = score_security_posture(data)

        assert score.score == 4

    def test_many_vulnerabilities_reduces_score(self):
        """Test many vulnerabilities reduces score."""
        data = SecurityPostureData(has_security_scans=True, vulnerabilities_found=10)
        score = score_security_posture(data)

        assert score.score <= 3

    def test_security_decisions_noted_in_evidence(self):
        """Test security decisions are noted in evidence."""
        data = SecurityPostureData(
            has_security_scans=True, vulnerabilities_found=0, security_decisions_logged=3
        )
        score = score_security_posture(data)

        assert any("security decisions logged" in e for e in score.evidence)


class TestScoreCollaborationEfficiency:
    """Tests for score_collaboration_efficiency function."""

    def test_no_agent_logs_returns_none(self):
        """Test without agent logs returns None score."""
        data = CollaborationEfficiencyData(has_agent_logs=False)
        score = score_collaboration_efficiency(data)

        assert score.score is None
        assert score.confidence == ConfidenceLevel.NONE

    def test_efficient_interrupts_keeps_score_4(self):
        """Test efficient interrupts (<= 5) keeps score at 4."""
        data = CollaborationEfficiencyData(has_agent_logs=True, human_interrupts=3)
        score = score_collaboration_efficiency(data)

        assert score.score == 4
        assert any("efficient" in e for e in score.evidence)

    def test_moderate_interrupts_reduces_score(self):
        """Test moderate interrupts (6-15) reduces score by 1."""
        data = CollaborationEfficiencyData(has_agent_logs=True, human_interrupts=10)
        score = score_collaboration_efficiency(data)

        assert score.score == 3

    def test_high_interrupts_reduces_score_more(self):
        """Test high interrupts (> 15) reduces score by 2."""
        data = CollaborationEfficiencyData(has_agent_logs=True, human_interrupts=20)
        score = score_collaboration_efficiency(data)

        assert score.score == 2
        assert any("high" in e for e in score.evidence)

    def test_scope_drift_reduces_score(self):
        """Test scope drift incidents reduce the score."""
        data = CollaborationEfficiencyData(has_agent_logs=True, scope_drift_incidents=3)
        score = score_collaboration_efficiency(data)

        assert score.score <= 3
        assert any("scope drift" in e for e in score.evidence)

    def test_agent_commits_noted_in_evidence(self):
        """Test agent commit count is noted in evidence."""
        data = CollaborationEfficiencyData(has_agent_logs=True, agent_commit_count=15)
        score = score_collaboration_efficiency(data)

        assert any("agent commits" in e for e in score.evidence)


class TestScoreDecisionHygiene:
    """Tests for score_decision_hygiene function."""

    def test_no_decision_logs_returns_none(self):
        """Test without decision logs returns None score."""
        data = DecisionHygieneData(has_decision_logs=False)
        score = score_decision_hygiene(data)

        assert score.score is None
        assert "No decision logs found" in (score.details or "")

    def test_no_decisions_returns_none(self):
        """Test with zero decisions returns None score."""
        data = DecisionHygieneData(has_decision_logs=True, total_decisions=0)
        score = score_decision_hygiene(data)

        assert score.score is None

    def test_100_percent_escalation_returns_score_5(self):
        """Test 100% escalation rate for one-way doors returns score of 5."""
        data = DecisionHygieneData(
            has_decision_logs=True,
            total_decisions=10,
            one_way_door_count=5,
            escalated_count=5,
        )
        score = score_decision_hygiene(data)

        assert score.score == 5
        assert any("5/5 one-way-doors escalated" in e for e in score.evidence)

    def test_80_percent_escalation_returns_score_4(self):
        """Test 80%+ escalation rate returns score of 4."""
        data = DecisionHygieneData(
            has_decision_logs=True,
            total_decisions=10,
            one_way_door_count=5,
            escalated_count=4,
        )
        score = score_decision_hygiene(data)

        assert score.score == 4
        assert any("80%" in e for e in score.evidence)

    def test_low_escalation_rate_returns_low_score(self):
        """Test low escalation rate returns low score."""
        data = DecisionHygieneData(
            has_decision_logs=True,
            total_decisions=10,
            one_way_door_count=10,
            escalated_count=2,
        )
        score = score_decision_hygiene(data)

        assert score.score <= 2
        assert any("Low escalation rate" in e for e in score.evidence)

    def test_missing_rationale_reduces_score(self):
        """Test high missing rationale (> 50%) reduces score."""
        data = DecisionHygieneData(
            has_decision_logs=True,
            total_decisions=10,
            one_way_door_count=0,
            missing_rationale=6,
        )
        score = score_decision_hygiene(data)

        assert any("missing rationale" in e for e in score.evidence)

    def test_no_one_way_doors_keeps_base_score(self):
        """Test with no one-way doors keeps base score of 4."""
        data = DecisionHygieneData(
            has_decision_logs=True,
            total_decisions=10,
            one_way_door_count=0,
        )
        score = score_decision_hygiene(data)

        assert score.score == 4


class TestDetermineConfidence:
    """Tests for determine_confidence function."""

    def test_no_direct_evidence_inferred_returns_low(self):
        """Test without direct evidence and inferred data returns LOW."""
        factors = ConfidenceFactors(
            has_direct_evidence=False, sample_size=10, data_quality="inferred"
        )
        confidence = determine_confidence(factors)

        assert confidence == ConfidenceLevel.LOW

    def test_no_direct_evidence_not_inferred_returns_none(self):
        """Test without direct evidence and non-inferred data returns NONE."""
        factors = ConfidenceFactors(
            has_direct_evidence=False, sample_size=10, data_quality="partial"
        )
        confidence = determine_confidence(factors)

        assert confidence == ConfidenceLevel.NONE

    def test_high_sample_good_quality_returns_high(self):
        """Test high sample size with good quality returns HIGH."""
        factors = ConfidenceFactors(has_direct_evidence=True, sample_size=25, data_quality="good")
        confidence = determine_confidence(factors)

        assert confidence == ConfidenceLevel.HIGH

    def test_medium_sample_returns_medium(self):
        """Test medium sample size (>= 5) returns MEDIUM."""
        factors = ConfidenceFactors(
            has_direct_evidence=True, sample_size=10, data_quality="partial"
        )
        confidence = determine_confidence(factors)

        assert confidence == ConfidenceLevel.MEDIUM

    def test_low_sample_returns_low(self):
        """Test low sample size (< 5) returns LOW."""
        factors = ConfidenceFactors(has_direct_evidence=True, sample_size=3, data_quality="good")
        confidence = determine_confidence(factors)

        assert confidence == ConfidenceLevel.LOW


class TestEdgeCases:
    """Tests for edge cases and error handling."""

    def test_delivery_with_zero_avg_size(self):
        """Test delivery predictability with zero average commit size."""
        data = DeliveryPredictabilityData(commit_count=5, avg_commit_size=0.0)
        score = score_delivery_predictability(data)

        assert score.score == 5  # < 50 threshold

    def test_quality_with_all_large_commits(self):
        """Test quality with 100% large commits."""
        data = QualityMaintainabilityData(commit_count=5, large_commit_count=5)
        score = score_quality_maintainability(data)

        assert score.score >= 1
        assert score.score <= 3

    def test_decision_hygiene_with_null_values(self):
        """Test decision hygiene with null/None optional values."""
        data = DecisionHygieneData(
            has_decision_logs=True,
            total_decisions=5,
            one_way_door_count=None,
            escalated_count=None,
            missing_rationale=None,
        )
        score = score_decision_hygiene(data)

        assert score.score == 4  # Base score maintained

    def test_test_loop_with_zero_pass_rate(self):
        """Test test loop completeness with 0% pass rate."""
        data = TestLoopCompletenessData(has_test_results=True, pass_rate=0.0)
        score = score_test_loop_completeness(data)

        assert score.score == 2

    def test_collaboration_with_all_null_metrics(self):
        """Test collaboration efficiency with all null optional metrics."""
        data = CollaborationEfficiencyData(
            has_agent_logs=True,
            agent_commit_count=None,
            human_interrupts=None,
            scope_drift_incidents=None,
        )
        score = score_collaboration_efficiency(data)

        assert score.score == 4  # Base score maintained
        assert score.evidence == []

    def test_security_with_very_high_vulnerabilities(self):
        """Test security posture with very high vulnerability count."""
        data = SecurityPostureData(has_security_scans=True, vulnerabilities_found=100)
        score = score_security_posture(data)

        assert score.score >= 2  # Minimum score

    def test_priority_score_with_max_values(self):
        """Test priority score calculation with maximum values."""
        item = ActionItem(impact=5, risk_reduction=5, effort=5)
        priority = calculate_priority_score(item)

        assert priority == 2.0  # (5 + 5) / 5

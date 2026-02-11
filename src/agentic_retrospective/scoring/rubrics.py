"""Scoring rubrics for agentic retrospective dimensions.

This module contains scoring functions for evaluating various aspects of
agentic development workflows. Each scoring function assesses a specific
dimension and returns a Score with a value (1-5), confidence level, and
evidence supporting the assessment.

Scoring Dimensions:
    - Delivery Predictability: Consistency and size of commits
    - Test Loop Completeness: Test coverage and pass rates
    - Quality & Maintainability: Code quality indicators
    - Security Posture: Security scanning and vulnerability management
    - Collaboration Efficiency: Human-agent interaction patterns
    - Decision Hygiene: Quality of decision documentation
"""

from enum import Enum
from typing import Literal

from pydantic import BaseModel, Field


class ConfidenceLevel(str, Enum):
    """Confidence level for a score assessment.

    Attributes:
        NONE: No data available to make an assessment.
        LOW: Limited or inferred data, low confidence in accuracy.
        MEDIUM: Partial data available, moderate confidence.
        HIGH: Strong direct evidence, high confidence in accuracy.
    """

    NONE = "none"
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


class Score(BaseModel):
    """A scored assessment with confidence and supporting evidence.

    Attributes:
        score: Numeric score from 1-5, or None if not assessable.
        confidence: Level of confidence in the assessment.
        evidence: List of evidence statements supporting the score.
        details: Optional additional context or explanation.
    """

    score: int | None = Field(default=None, ge=1, le=5)
    confidence: ConfidenceLevel = ConfidenceLevel.NONE
    evidence: list[str] = Field(default_factory=list)
    details: str | None = None


class ActionItem(BaseModel):
    """An action item with impact and effort metrics for prioritization.

    Attributes:
        impact: Expected positive impact (1-5 scale).
        risk_reduction: Risk reduction potential (1-5 scale).
        effort: Estimated effort required (1-5 scale, higher = more effort).
    """

    impact: int = Field(ge=1, le=5)
    risk_reduction: int = Field(ge=1, le=5)
    effort: int = Field(default=1, ge=1, le=5)


class DeliveryPredictabilityData(BaseModel):
    """Input data for delivery predictability scoring.

    Attributes:
        commit_count: Total number of commits in the period.
        avg_commit_size: Average lines changed per commit.
        scope_drift_incidents: Number of scope drift events detected.
    """

    commit_count: int = Field(ge=0)
    avg_commit_size: float = Field(ge=0)
    scope_drift_incidents: int = Field(default=0, ge=0)


class TestLoopCompletenessData(BaseModel):
    """Input data for test loop completeness scoring.

    Attributes:
        has_test_results: Whether test result artifacts were found.
        pass_rate: Percentage of tests passing (0-100).
        test_related_commits: Number of commits related to tests.
        human_debug_events: Number of human debugging interventions.
    """

    has_test_results: bool = False
    pass_rate: float | None = Field(default=None, ge=0, le=100)
    test_related_commits: int = Field(default=0, ge=0)
    human_debug_events: int | None = Field(default=None, ge=0)


class QualityMaintainabilityData(BaseModel):
    """Input data for quality and maintainability scoring.

    Attributes:
        commit_count: Total number of commits.
        large_commit_count: Number of commits exceeding size threshold.
        docs_commit_count: Number of documentation-related commits.
        test_commit_count: Number of test-related commits.
    """

    commit_count: int = Field(ge=0)
    large_commit_count: int = Field(default=0, ge=0)
    docs_commit_count: int = Field(default=0, ge=0)
    test_commit_count: int = Field(default=0, ge=0)


class SecurityPostureData(BaseModel):
    """Input data for security posture scoring.

    Attributes:
        has_security_scans: Whether security scans were executed.
        new_deps_count: Number of new dependencies added.
        security_decisions_logged: Number of security decisions documented.
        vulnerabilities_found: Number of vulnerabilities detected.
    """

    has_security_scans: bool = False
    new_deps_count: int | None = Field(default=None, ge=0)
    security_decisions_logged: int | None = Field(default=None, ge=0)
    vulnerabilities_found: int | None = Field(default=None, ge=0)


class CollaborationEfficiencyData(BaseModel):
    """Input data for collaboration efficiency scoring.

    Attributes:
        has_agent_logs: Whether agent activity logs are available.
        agent_commit_count: Number of commits made by agents.
        human_interrupts: Number of human interruptions to agent work.
        scope_drift_incidents: Number of scope drift events.
    """

    has_agent_logs: bool = False
    agent_commit_count: int | None = Field(default=None, ge=0)
    human_interrupts: int | None = Field(default=None, ge=0)
    scope_drift_incidents: int | None = Field(default=None, ge=0)


class DecisionHygieneData(BaseModel):
    """Input data for decision hygiene scoring.

    Attributes:
        has_decision_logs: Whether decision logs are available.
        total_decisions: Total number of decisions logged.
        one_way_door_count: Number of irreversible decisions.
        escalated_count: Number of decisions escalated to humans.
        missing_rationale: Number of decisions without rationale.
    """

    has_decision_logs: bool = False
    total_decisions: int | None = Field(default=None, ge=0)
    one_way_door_count: int | None = Field(default=None, ge=0)
    escalated_count: int | None = Field(default=None, ge=0)
    missing_rationale: int | None = Field(default=None, ge=0)


class ConfidenceFactors(BaseModel):
    """Factors used to determine confidence level.

    Attributes:
        has_direct_evidence: Whether direct evidence exists.
        sample_size: Number of data points available.
        data_quality: Quality of the available data.
    """

    has_direct_evidence: bool = False
    sample_size: int = Field(default=0, ge=0)
    data_quality: Literal["good", "partial", "inferred"] = "inferred"


def calculate_score(
    value: int | None,
    confidence: ConfidenceLevel,
    evidence: list[str],
    details: str | None = None,
) -> Score:
    """Create a Score object with the given values.

    Args:
        value: Numeric score from 1-5, or None if not assessable.
        confidence: Level of confidence in the assessment.
        evidence: List of evidence statements supporting the score.
        details: Optional additional context or explanation.

    Returns:
        A Score object with the provided values.
    """
    return Score(score=value, confidence=confidence, evidence=evidence, details=details)


def calculate_priority_score(item: ActionItem) -> float:
    """Calculate priority score for an action item.

    Priority is calculated as (impact + risk_reduction) / effort,
    giving higher priority to high-impact, low-effort items.

    Args:
        item: Action item with impact, risk_reduction, and effort values.

    Returns:
        Priority score as a float. Higher values indicate higher priority.
    """
    numerator = item.impact + item.risk_reduction
    denominator = item.effort or 1
    return numerator / denominator


def score_delivery_predictability(data: DeliveryPredictabilityData) -> Score:
    """Score delivery predictability based on commit patterns.

    Evaluates how predictable delivery is based on commit frequency,
    commit size consistency, and scope drift incidents. Smaller, more
    frequent commits indicate better predictability.

    Scoring:
        - 5: Small commits (avg < 50 lines)
        - 4: Reasonable commits (avg 50-100 lines)
        - 3: Medium commits (avg 100-200 lines)
        - 1-2: Large commits (avg > 200 lines)
        - Penalty for scope drift incidents

    Args:
        data: Delivery predictability input data.

    Returns:
        Score with assessment of delivery predictability.
    """
    if data.commit_count == 0:
        return calculate_score(None, ConfidenceLevel.NONE, ["No commits found"])

    score = 3
    evidence: list[str] = []

    if data.avg_commit_size < 50:
        score = 5
        evidence.append(f"Small commits (avg {data.avg_commit_size:.0f} lines)")
    elif data.avg_commit_size < 100:
        score = 4
        evidence.append(f"Reasonable commit size (avg {data.avg_commit_size:.0f} lines)")
    elif data.avg_commit_size < 200:
        score = 3
        evidence.append(f"Medium commits (avg {data.avg_commit_size:.0f} lines)")
    else:
        score = max(1, score - 2)
        evidence.append(f"Large commits (avg {data.avg_commit_size:.0f} lines)")

    if data.scope_drift_incidents > 0:
        score = max(1, score - 1)
        evidence.append(f"{data.scope_drift_incidents} scope drift incidents")

    return calculate_score(score, ConfidenceLevel.HIGH, evidence)


def score_test_loop_completeness(data: TestLoopCompletenessData) -> Score:
    """Score test loop completeness based on test results and coverage.

    Evaluates the completeness of the test feedback loop including
    test pass rates and human debugging interventions.

    Scoring:
        - 5: Pass rate >= 95%
        - 4: Pass rate 85-95%
        - 3: Pass rate 70-85%
        - 2: Pass rate < 70%
        - Penalty for excessive human debug events

    Args:
        data: Test loop completeness input data.

    Returns:
        Score with assessment of test loop completeness.
    """
    if not data.has_test_results:
        if data.test_related_commits > 0:
            return calculate_score(
                3,
                ConfidenceLevel.LOW,
                [f"Inferred {data.test_related_commits} test-related commits"],
                "No test result artifacts found",
            )
        return calculate_score(None, ConfidenceLevel.NONE, [], "No test data available")

    score = 4
    evidence: list[str] = []

    if data.pass_rate is not None:
        if data.pass_rate >= 95:
            score = 5
            evidence.append(f"{data.pass_rate:.1f}% pass rate")
        elif data.pass_rate >= 85:
            score = 4
            evidence.append(f"{data.pass_rate:.1f}% pass rate")
        elif data.pass_rate >= 70:
            score = 3
            evidence.append(f"{data.pass_rate:.1f}% pass rate")
        else:
            score = 2
            evidence.append(f"Low pass rate: {data.pass_rate:.1f}%")

    if data.human_debug_events is not None and data.human_debug_events > 5:
        score = max(1, score - 1)
        evidence.append(f"{data.human_debug_events} human debug interventions")

    return calculate_score(score, ConfidenceLevel.MEDIUM, evidence)


def score_quality_maintainability(data: QualityMaintainabilityData) -> Score:
    """Score code quality and maintainability indicators.

    Evaluates maintainability based on commit patterns, documentation
    efforts, and test coverage improvements.

    Scoring:
        - Bonus for low percentage of large commits (< 5%)
        - Penalty for high percentage of large commits (> 30%)
        - Bonus for test-related commits
        - Documentation commits noted as evidence

    Args:
        data: Quality maintainability input data.

    Returns:
        Score with assessment of code quality and maintainability.
    """
    if data.commit_count == 0:
        return calculate_score(None, ConfidenceLevel.NONE, ["No commits found"])

    score = 3
    evidence: list[str] = []

    large_pct = (data.large_commit_count / data.commit_count) * 100

    if large_pct < 5:
        score = min(5, score + 1)
    elif large_pct > 30:
        score = max(1, score - 1)
        evidence.append(f"{large_pct:.0f}% large commits")

    if data.docs_commit_count > 0:
        evidence.append(f"{data.docs_commit_count} documentation commits")

    if data.test_commit_count > 0:
        evidence.append(f"{data.test_commit_count} test commits")
        score = min(5, score + 1)

    return calculate_score(score, ConfidenceLevel.MEDIUM, evidence)


def score_security_posture(data: SecurityPostureData) -> Score:
    """Score security posture based on security practices.

    Evaluates security practices including security scanning,
    vulnerability management, and security decision documentation.

    Scoring:
        - 5: No vulnerabilities found
        - 4: 1-3 vulnerabilities found
        - 2-3: More than 3 vulnerabilities (scaled)
        - Bonus for logged security decisions

    Args:
        data: Security posture input data.

    Returns:
        Score with assessment of security posture.
    """
    if not data.has_security_scans:
        return calculate_score(
            None, ConfidenceLevel.NONE, [], "No security scan data available"
        )

    score = 4
    evidence: list[str] = ["Security scans executed"]

    if data.vulnerabilities_found is not None:
        if data.vulnerabilities_found == 0:
            score = 5
            evidence.append("No vulnerabilities found")
        elif data.vulnerabilities_found <= 3:
            score = 4
            evidence.append(f"{data.vulnerabilities_found} vulnerabilities found")
        else:
            score = max(2, 4 - data.vulnerabilities_found // 3)
            evidence.append(f"{data.vulnerabilities_found} vulnerabilities found")

    if data.security_decisions_logged and data.security_decisions_logged > 0:
        evidence.append(f"{data.security_decisions_logged} security decisions logged")

    return calculate_score(score, ConfidenceLevel.MEDIUM, evidence)


def score_collaboration_efficiency(data: CollaborationEfficiencyData) -> Score:
    """Score human-agent collaboration efficiency.

    Evaluates the efficiency of collaboration between humans and agents
    based on interrupt frequency and scope management.

    Scoring:
        - Base score of 4 with agent logs
        - Efficient: <= 5 human interrupts
        - Moderate penalty: 6-15 human interrupts
        - High penalty: > 15 human interrupts
        - Additional penalty for scope drift

    Args:
        data: Collaboration efficiency input data.

    Returns:
        Score with assessment of collaboration efficiency.
    """
    if not data.has_agent_logs:
        return calculate_score(None, ConfidenceLevel.NONE, [], "No agent logs available")

    score = 4
    evidence: list[str] = []

    if data.agent_commit_count is not None:
        evidence.append(f"{data.agent_commit_count} agent commits")

    if data.human_interrupts is not None:
        if data.human_interrupts <= 5:
            evidence.append(f"{data.human_interrupts} human interrupts (efficient)")
        elif data.human_interrupts <= 15:
            score = max(3, score - 1)
            evidence.append(f"{data.human_interrupts} human interrupts")
        else:
            score = max(2, score - 2)
            evidence.append(f"{data.human_interrupts} human interrupts (high)")

    if data.scope_drift_incidents is not None and data.scope_drift_incidents > 0:
        score = max(2, score - 1)
        evidence.append(f"{data.scope_drift_incidents} scope drift incidents")

    return calculate_score(score, ConfidenceLevel.MEDIUM, evidence)


def score_decision_hygiene(data: DecisionHygieneData) -> Score:
    """Score decision documentation and escalation practices.

    Evaluates the quality of decision logging including escalation
    of irreversible decisions and rationale documentation.

    Scoring:
        - 5: 100% escalation rate for one-way-door decisions
        - 4: 80%+ escalation rate
        - 1-3: Lower escalation rates (scaled by 25%)
        - Penalty for missing rationale (> 50%)

    Args:
        data: Decision hygiene input data.

    Returns:
        Score with assessment of decision hygiene.
    """
    if not data.has_decision_logs or data.total_decisions == 0:
        return calculate_score(None, ConfidenceLevel.NONE, [], "No decision logs found")

    score = 4
    evidence: list[str] = [f"{data.total_decisions} decisions logged"]

    if data.one_way_door_count is not None and data.one_way_door_count > 0:
        escalated = data.escalated_count or 0
        escalation_rate = (escalated / data.one_way_door_count) * 100

        if escalation_rate == 100:
            score = 5
            evidence.append(
                f"{data.one_way_door_count}/{data.one_way_door_count} one-way-doors escalated"
            )
        elif escalation_rate >= 80:
            score = 4
            evidence.append(f"{escalation_rate:.0f}% escalation rate")
        else:
            score = max(2, int(escalation_rate / 25))
            evidence.append(f"Low escalation rate: {escalation_rate:.0f}%")

    if data.missing_rationale is not None and data.missing_rationale > 0:
        total = data.total_decisions or 1
        missing_pct = (data.missing_rationale / total) * 100
        if missing_pct > 50:
            score = max(2, score - 1)
            evidence.append(f"{missing_pct:.0f}% missing rationale")

    return calculate_score(score, ConfidenceLevel.HIGH, evidence)


def determine_confidence(factors: ConfidenceFactors) -> ConfidenceLevel:
    """Determine confidence level based on evidence factors.

    Calculates an appropriate confidence level based on whether
    direct evidence exists, the sample size, and data quality.

    Args:
        factors: Confidence factors including evidence availability,
            sample size, and data quality.

    Returns:
        Appropriate ConfidenceLevel based on the factors.
    """
    if not factors.has_direct_evidence:
        if factors.data_quality == "inferred":
            return ConfidenceLevel.LOW
        return ConfidenceLevel.NONE

    if factors.sample_size >= 20 and factors.data_quality == "good":
        return ConfidenceLevel.HIGH

    if factors.sample_size >= 5:
        return ConfidenceLevel.MEDIUM

    return ConfidenceLevel.LOW

"""Pydantic models for telemetry data and retrospective reports."""

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


# -----------------------------------------------------------------------------
# Telemetry Models (existing)
# -----------------------------------------------------------------------------


class ComplexitySignals(BaseModel):
    """Complexity signals extracted from prompts."""

    has_constraints: bool = False
    has_examples: bool = False
    has_acceptance_criteria: bool = False
    file_references: int = 0
    ambiguity_score: float = Field(default=0.0, ge=0.0, le=1.0)


class PromptEntry(BaseModel):
    """A logged user prompt."""

    timestamp: datetime
    session_id: str = "unknown"
    prompt: str = ""
    prompt_length: int = 0
    complexity_signals: ComplexitySignals = Field(default_factory=ComplexitySignals)


class ToolEntry(BaseModel):
    """A logged tool call."""

    timestamp: datetime
    session_id: str = "unknown"
    tool: str = "unknown"
    input: dict[str, Any] = Field(default_factory=dict)


class DecisionEntry(BaseModel):
    """A logged architectural decision."""

    timestamp: datetime
    decision: str
    rationale: str
    decision_type: str = "two_way_door"  # one_way_door | two_way_door
    actor: str = "agent"  # human | agent


class FeedbackEntry(BaseModel):
    """Session feedback from micro-retrospective."""

    timestamp: datetime
    session_id: str
    alignment: int = Field(ge=1, le=5)
    rework_needed: str = "none"  # none | minor | significant
    revision_cycles: int | None = None
    improvement_suggestion: str = ""
    worked_well: str = ""


# -----------------------------------------------------------------------------
# Type Aliases
# -----------------------------------------------------------------------------

Actor = Literal["human", "agent", "system"]
DecisionCategory = Literal[
    "architecture",
    "security",
    "api",
    "data",
    "deps",
    "ux",
    "delivery",
    "process",
    "naming",
    "quality",
    "testing",
    "documentation",
    "performance",
    "infrastructure",
    "other",
]
DecisionType = Literal["one_way_door", "two_way_door", "reversible", "unknown"]
RiskLevel = Literal["low", "medium", "high"]
ConfidenceLevel = Literal["high", "medium", "low", "none"]
FindingSeverity = Literal["critical", "high", "medium", "low", "info"]
FindingCategory = Literal[
    "scope_drift",
    "decision_gap",
    "agent_behavior",
    "quality",
    "security",
    "inner_loop",
    "collaboration",
    "telemetry_gap",
]
ActionPriority = Literal["must_do", "next_sprint", "backlog"]
ChangeType = Literal["add", "modify", "delete", "rename"]


# -----------------------------------------------------------------------------
# Decision Log Types
# -----------------------------------------------------------------------------


class OptionConsidered(BaseModel):
    """An option considered during decision making."""

    option: str
    pros: list[str] | None = None
    cons: list[str] | None = None


class DecisionRecord(BaseModel):
    """A decision record from the decision log."""

    id: str | None = None
    ts: str
    timestamp: str | None = None
    sprint_id: str | None = None
    actor: Actor | None = None
    category: DecisionCategory | None = None
    decision_type: DecisionType | None = None
    decision: str | None = None
    summary: str | None = None
    title: str | None = None
    context: str | dict[str, Any] | None = None
    options_considered: list[OptionConsidered] | None = None
    chosen_option: str | None = None
    chosen: str | None = None
    rationale: str | None = None
    reasoning: str | None = None
    risk_level: RiskLevel | None = None
    risk_notes: str | None = None
    reversibility_plan: str | None = None
    owner: str | None = None
    followups: list[str] | None = None
    evidence_refs: list[str] | None = None


# -----------------------------------------------------------------------------
# Git/Commit Types
# -----------------------------------------------------------------------------


class FileChange(BaseModel):
    """A file change in a commit."""

    path: str
    additions: int
    deletions: int
    change_type: ChangeType


class CommitInfo(BaseModel):
    """Information about a git commit."""

    hash: str
    short_hash: str
    author: str
    email: str
    date: str
    subject: str
    body: str
    files: list[FileChange]
    lines_added: int
    lines_removed: int


# -----------------------------------------------------------------------------
# Scoring Types
# -----------------------------------------------------------------------------


class Score(BaseModel):
    """A score with confidence and evidence."""

    score: float | None = None
    confidence: ConfidenceLevel
    evidence: list[str] = Field(default_factory=list)
    details: str | None = None


class Scores(BaseModel):
    """All scoring dimensions for a retrospective."""

    delivery_predictability: Score
    test_loop_completeness: Score
    quality_maintainability: Score
    security_posture: Score
    collaboration_efficiency: Score
    decision_hygiene: Score


# -----------------------------------------------------------------------------
# Findings Types
# -----------------------------------------------------------------------------


class Finding(BaseModel):
    """A finding from the retrospective analysis."""

    id: str
    severity: FindingSeverity
    category: FindingCategory
    title: str
    summary: str
    evidence: list[str] = Field(default_factory=list)
    confidence: ConfidenceLevel
    impact: str | None = None
    recommendation: str | None = None


class TelemetryGap(BaseModel):
    """A gap in telemetry coverage."""

    gap_type: str
    severity: Literal["high", "medium", "low"]
    impact: str
    recommendation: str


# -----------------------------------------------------------------------------
# Action Items
# -----------------------------------------------------------------------------


class ActionItem(BaseModel):
    """An action item from the retrospective."""

    id: str
    priority: ActionPriority
    action: str
    rationale: str
    owner: str | None = None
    success_metric: str
    effort: int
    impact: int
    risk_reduction: int


# -----------------------------------------------------------------------------
# Human Insights Types
# -----------------------------------------------------------------------------


class PromptPattern(BaseModel):
    """A pattern detected in human prompts."""

    pattern: str
    description: str
    frequency: int
    avg_alignment_score: float
    avg_rework_level: float
    examples: list[str] = Field(default_factory=list)
    recommendation: str | None = None


class ReworkDistribution(BaseModel):
    """Distribution of rework levels."""

    none: int = 0
    minor: int = 0
    significant: int = 0


class FeedbackSummary(BaseModel):
    """Summary of feedback data."""

    avg_alignment: float
    total_sessions: int
    rework_distribution: ReworkDistribution
    avg_revision_cycles: float


class PromptPatterns(BaseModel):
    """Effective and problematic prompt patterns."""

    effective: list[PromptPattern] = Field(default_factory=list)
    problematic: list[PromptPattern] = Field(default_factory=list)


class HumanInsights(BaseModel):
    """Insights derived from human interaction patterns."""

    prompt_patterns: PromptPatterns
    feedback_summary: FeedbackSummary
    claude_md_suggestions: list[str] = Field(default_factory=list)
    top_improvements: list[str] = Field(default_factory=list)
    top_successes: list[str] = Field(default_factory=list)


# -----------------------------------------------------------------------------
# Metrics Types
# -----------------------------------------------------------------------------


class FixToFeatureRatio(BaseModel):
    """Ratio of fix commits to feature commits."""

    ratio: float
    fix_commits: int
    feature_commits: int
    is_healthy: bool
    threshold: float


# -----------------------------------------------------------------------------
# Evidence Map Types
# -----------------------------------------------------------------------------


class CommitEvidence(BaseModel):
    """Evidence linked to a commit."""

    decisions: list[str] = Field(default_factory=list)
    findings: list[str] = Field(default_factory=list)
    tool_calls: list[str] | None = None
    category: str | None = None


class DecisionEvidence(BaseModel):
    """Evidence linked to a decision."""

    commits: list[str] = Field(default_factory=list)
    type: str
    escalated: bool
    category: str


class Orphans(BaseModel):
    """Orphaned commits and decisions without links."""

    commits_without_context: list[str] = Field(default_factory=list)
    decisions_without_implementation: list[str] = Field(default_factory=list)


class EvidenceMap(BaseModel):
    """Map linking commits, decisions, and findings."""

    commits: dict[str, CommitEvidence] = Field(default_factory=dict)
    decisions: dict[str, DecisionEvidence] = Field(default_factory=dict)
    orphans: Orphans = Field(default_factory=Orphans)


# -----------------------------------------------------------------------------
# Data Completeness
# -----------------------------------------------------------------------------


class DataSources(BaseModel):
    """Available data sources."""

    git: bool = False
    decisions: bool = False
    agent_logs: bool = False
    ci: bool = False
    tests: bool = False


class DataCompleteness(BaseModel):
    """Data completeness assessment."""

    percentage: float
    sources: DataSources
    gaps: list[TelemetryGap] = Field(default_factory=list)


# -----------------------------------------------------------------------------
# Summary Types
# -----------------------------------------------------------------------------


class SprintSummary(BaseModel):
    """Summary statistics for a sprint."""

    commits: int
    contributors: int
    human_contributors: int
    agent_contributors: int
    lines_added: int
    lines_removed: int
    decisions_logged: int
    agent_commits: int
    agent_commit_percentage: float


class Win(BaseModel):
    """A win/success from the sprint."""

    title: str
    description: str
    evidence: list[str] = Field(default_factory=list)


class Risk(BaseModel):
    """A risk identified in the sprint."""

    title: str
    description: str
    evidence: list[str] = Field(default_factory=list)
    mitigation: str


# -----------------------------------------------------------------------------
# Report Metadata
# -----------------------------------------------------------------------------


class ReportMetadata(BaseModel):
    """Metadata about the generated report."""

    tool_version: str
    schema_version: str
    generated_by: str


class Period(BaseModel):
    """Time period for the report."""

    model_config = ConfigDict(populate_by_name=True)

    from_date: str = Field(alias="from")
    to_date: str = Field(alias="to")


# -----------------------------------------------------------------------------
# Main Report Type
# -----------------------------------------------------------------------------


class RetroReport(BaseModel):
    """The complete retrospective report."""

    sprint_id: str
    period: Period
    generated_at: str
    data_completeness: DataCompleteness
    summary: SprintSummary
    scores: Scores
    findings: list[Finding] = Field(default_factory=list)
    wins: list[Win] = Field(default_factory=list)
    risks: list[Risk] = Field(default_factory=list)
    action_items: list[ActionItem] = Field(default_factory=list)
    evidence_map: EvidenceMap
    human_insights: HumanInsights | None = None
    fix_to_feature_ratio: FixToFeatureRatio | None = None
    metadata: ReportMetadata


# -----------------------------------------------------------------------------
# Configuration Types
# -----------------------------------------------------------------------------


class RetroConfig(BaseModel):
    """Configuration for running a retrospective."""

    from_ref: str
    to_ref: str
    sprint_id: str
    decisions_path: str
    agent_logs_path: str
    ci_path: str | None = None
    output_dir: str


# -----------------------------------------------------------------------------
# Alert Types
# -----------------------------------------------------------------------------


class Alert(BaseModel):
    """An alert for critical issues."""

    id: str
    severity: Literal["critical", "high"]
    type: str
    title: str
    description: str
    evidence: list[str] = Field(default_factory=list)
    recommended_action: str


class AlertsOutput(BaseModel):
    """Output containing alerts."""

    alerts: list[Alert] = Field(default_factory=list)
    generated_at: str


# -----------------------------------------------------------------------------
# Exports
# -----------------------------------------------------------------------------

__all__ = [
    # Type aliases
    "Actor",
    "DecisionCategory",
    "DecisionType",
    "RiskLevel",
    "ConfidenceLevel",
    "FindingSeverity",
    "FindingCategory",
    "ActionPriority",
    "ChangeType",
    # Telemetry models (existing)
    "ComplexitySignals",
    "PromptEntry",
    "ToolEntry",
    "DecisionEntry",
    "FeedbackEntry",
    # Decision log types
    "OptionConsidered",
    "DecisionRecord",
    # Git/commit types
    "FileChange",
    "CommitInfo",
    # Scoring types
    "Score",
    "Scores",
    # Findings types
    "Finding",
    "TelemetryGap",
    # Action items
    "ActionItem",
    # Human insights types
    "PromptPattern",
    "ReworkDistribution",
    "FeedbackSummary",
    "PromptPatterns",
    "HumanInsights",
    # Metrics types
    "FixToFeatureRatio",
    # Evidence map types
    "CommitEvidence",
    "DecisionEvidence",
    "Orphans",
    "EvidenceMap",
    # Data completeness
    "DataSources",
    "DataCompleteness",
    # Summary types
    "SprintSummary",
    "Win",
    "Risk",
    # Report metadata
    "ReportMetadata",
    "Period",
    # Main report type
    "RetroReport",
    # Configuration types
    "RetroConfig",
    # Alert types
    "Alert",
    "AlertsOutput",
]

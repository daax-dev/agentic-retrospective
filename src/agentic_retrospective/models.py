"""Pydantic models for telemetry data."""

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


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
    """Session feedback from micro-retro."""

    timestamp: datetime
    session_id: str
    alignment: int = Field(ge=1, le=5)
    rework_needed: str = "none"  # none | minor | significant
    revision_cycles: int | None = None
    improvement_suggestion: str = ""
    worked_well: str = ""

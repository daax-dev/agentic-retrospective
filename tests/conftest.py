"""Pytest fixtures for agentic-retrospective tests."""

import json
import os
import tempfile
from datetime import datetime, timedelta
from pathlib import Path
from typing import Generator

import pytest

from agentic_retrospective.models import (
    CommitInfo,
    ComplexitySignals,
    DecisionRecord,
    FeedbackEntry,
    FileChange,
    PromptEntry,
    RetroConfig,
)


@pytest.fixture
def temp_project_dir() -> Generator[Path, None, None]:
    """Create a temporary directory with .git and .logs structure.

    Yields:
        Path to the temporary project directory.
    """
    with tempfile.TemporaryDirectory() as tmpdir:
        project_dir = Path(tmpdir)

        # Create .git directory structure
        git_dir = project_dir / ".git"
        git_dir.mkdir()
        (git_dir / "HEAD").write_text("ref: refs/heads/main\n")
        (git_dir / "config").write_text("[core]\n\trepositoryformatversion = 0\n")

        # Create .logs directory structure
        logs_dir = project_dir / ".logs"
        logs_dir.mkdir()
        (logs_dir / "prompts").mkdir()
        (logs_dir / "feedback").mkdir()
        (logs_dir / "tools").mkdir()

        # Create decisions directory
        decisions_dir = project_dir / "decisions"
        decisions_dir.mkdir()

        # Create output directory
        output_dir = project_dir / "output"
        output_dir.mkdir()

        yield project_dir


@pytest.fixture
def sample_commits() -> list[CommitInfo]:
    """Create a list of sample CommitInfo objects for testing.

    Returns:
        List of CommitInfo objects with various commit types.
    """
    now = datetime.now()

    return [
        CommitInfo(
            hash="abc123def456789012345678901234567890abcd",
            short_hash="abc123d",
            author="Human Developer",
            email="dev@example.com",
            date=(now - timedelta(days=5)).isoformat(),
            subject="feat: add user authentication",
            body="Implemented JWT-based auth\n\nCo-authored-by: claude",
            files=[
                FileChange(path="src/auth.py", additions=150, deletions=0, change_type="add"),
                FileChange(path="tests/test_auth.py", additions=80, deletions=0, change_type="add"),
            ],
            lines_added=230,
            lines_removed=0,
        ),
        CommitInfo(
            hash="bcd234567890123456789012345678901234bcde",
            short_hash="bcd2345",
            author="Claude",
            email="claude@anthropic.com",
            date=(now - timedelta(days=4)).isoformat(),
            subject="fix: resolve login validation bug",
            body="Fixed email validation regex",
            files=[
                FileChange(path="src/auth.py", additions=5, deletions=3, change_type="modify"),
            ],
            lines_added=5,
            lines_removed=3,
        ),
        CommitInfo(
            hash="cde345678901234567890123456789012345cdef",
            short_hash="cde3456",
            author="Human Developer",
            email="dev@example.com",
            date=(now - timedelta(days=3)).isoformat(),
            subject="docs: add API documentation",
            body="Added README and API docs",
            files=[
                FileChange(path="README.md", additions=100, deletions=10, change_type="modify"),
                FileChange(path="docs/api.md", additions=200, deletions=0, change_type="add"),
            ],
            lines_added=300,
            lines_removed=10,
        ),
        CommitInfo(
            hash="def456789012345678901234567890123456defg",
            short_hash="def4567",
            author="Bot",
            email="bot[bot]@github.com",
            date=(now - timedelta(days=2)).isoformat(),
            subject="chore: update dependencies",
            body="Bump pydantic from 2.0 to 2.1",
            files=[
                FileChange(path="pyproject.toml", additions=2, deletions=2, change_type="modify"),
                FileChange(path="poetry.lock", additions=50, deletions=50, change_type="modify"),
            ],
            lines_added=52,
            lines_removed=52,
        ),
        CommitInfo(
            hash="efg567890123456789012345678901234567efgh",
            short_hash="efg5678",
            author="Human Developer",
            email="dev@example.com",
            date=(now - timedelta(days=1)).isoformat(),
            subject="test: add integration tests",
            body="Added comprehensive integration test suite",
            files=[
                FileChange(
                    path="tests/integration/test_api.py", additions=250, deletions=0, change_type="add"
                ),
            ],
            lines_added=250,
            lines_removed=0,
        ),
        CommitInfo(
            hash="fgh678901234567890123456789012345678fghi",
            short_hash="fgh6789",
            author="Human Developer",
            email="dev@example.com",
            date=now.isoformat(),
            subject="refactor: simplify authentication flow",
            body="Reduced complexity of auth middleware",
            files=[
                FileChange(path="src/auth.py", additions=30, deletions=80, change_type="modify"),
                FileChange(path="src/middleware.py", additions=20, deletions=10, change_type="modify"),
            ],
            lines_added=50,
            lines_removed=90,
        ),
    ]


@pytest.fixture
def sample_decisions() -> list[DecisionRecord]:
    """Create a list of sample DecisionRecord objects for testing.

    Returns:
        List of DecisionRecord objects with various decision types.
    """
    now = datetime.now()

    return [
        DecisionRecord(
            id="DEC-001",
            ts=(now - timedelta(days=6)).isoformat(),
            actor="human",
            category="architecture",
            decision_type="one_way_door",
            decision="Use PostgreSQL as primary database",
            rationale="Need ACID compliance and complex queries",
            risk_level="high",
            evidence_refs=["abc123d"],
        ),
        DecisionRecord(
            id="DEC-002",
            ts=(now - timedelta(days=5)).isoformat(),
            actor="agent",
            category="api",
            decision_type="two_way_door",
            decision="Implement REST API endpoints first",
            rationale="Faster iteration for MVP",
            risk_level="low",
            evidence_refs=["bcd2345"],
        ),
        DecisionRecord(
            id="DEC-003",
            ts=(now - timedelta(days=4)).isoformat(),
            actor="human",
            category="security",
            decision_type="one_way_door",
            decision="Use JWT for authentication",
            rationale="Stateless auth for scalability",
            risk_level="medium",
            evidence_refs=["abc123d", "bcd2345"],
        ),
        DecisionRecord(
            id="DEC-004",
            ts=(now - timedelta(days=3)).isoformat(),
            actor="agent",
            category="deps",
            decision_type="two_way_door",
            decision="Add pydantic for data validation",
            rationale="Strong typing and validation",
            risk_level="low",
        ),
        DecisionRecord(
            id="DEC-005",
            ts=(now - timedelta(days=2)).isoformat(),
            actor="agent",
            category="process",
            decision_type="one_way_door",
            decision="Migrate to async database driver",
            rationale="Better performance under load",
            risk_level="high",
        ),
    ]


@pytest.fixture
def sample_prompts() -> list[PromptEntry]:
    """Create a list of sample PromptEntry objects for testing.

    Returns:
        List of PromptEntry objects with various complexity signals.
    """
    now = datetime.now()

    return [
        PromptEntry(
            timestamp=now - timedelta(hours=10),
            session_id="session-001",
            prompt="Please implement user authentication in src/auth.py with JWT tokens",
            prompt_length=68,
            complexity_signals=ComplexitySignals(
                has_constraints=True,
                has_examples=False,
                has_acceptance_criteria=True,
                file_references=1,
                ambiguity_score=0.2,
            ),
        ),
        PromptEntry(
            timestamp=now - timedelta(hours=8),
            session_id="session-001",
            prompt="Fix the login bug",
            prompt_length=17,
            complexity_signals=ComplexitySignals(
                has_constraints=False,
                has_examples=False,
                has_acceptance_criteria=False,
                file_references=0,
                ambiguity_score=0.8,
            ),
        ),
        PromptEntry(
            timestamp=now - timedelta(hours=6),
            session_id="session-002",
            prompt="Add API documentation to docs/api.md following the existing format in README.md",
            prompt_length=78,
            complexity_signals=ComplexitySignals(
                has_constraints=True,
                has_examples=True,
                has_acceptance_criteria=False,
                file_references=2,
                ambiguity_score=0.3,
            ),
        ),
        PromptEntry(
            timestamp=now - timedelta(hours=4),
            session_id="session-002",
            prompt="Do something with the tests",
            prompt_length=27,
            complexity_signals=ComplexitySignals(
                has_constraints=False,
                has_examples=False,
                has_acceptance_criteria=False,
                file_references=0,
                ambiguity_score=0.9,
            ),
        ),
        PromptEntry(
            timestamp=now - timedelta(hours=2),
            session_id="session-003",
            prompt="Refactor src/auth.py to reduce complexity. Acceptance criteria: cyclomatic complexity < 10",
            prompt_length=88,
            complexity_signals=ComplexitySignals(
                has_constraints=True,
                has_examples=False,
                has_acceptance_criteria=True,
                file_references=1,
                ambiguity_score=0.1,
            ),
        ),
    ]


@pytest.fixture
def sample_feedback() -> list[FeedbackEntry]:
    """Create a list of sample FeedbackEntry objects for testing.

    Returns:
        List of FeedbackEntry objects with various feedback types.
    """
    now = datetime.now()

    return [
        FeedbackEntry(
            timestamp=now - timedelta(hours=9),
            session_id="session-001",
            alignment=5,
            rework_needed="none",
            revision_cycles=1,
            improvement_suggestion="",
            worked_well="Clear implementation with good test coverage",
        ),
        FeedbackEntry(
            timestamp=now - timedelta(hours=7),
            session_id="session-001",
            alignment=2,
            rework_needed="significant",
            revision_cycles=4,
            improvement_suggestion="Be more specific about the bug location",
            worked_well="",
        ),
        FeedbackEntry(
            timestamp=now - timedelta(hours=5),
            session_id="session-002",
            alignment=4,
            rework_needed="minor",
            revision_cycles=2,
            improvement_suggestion="Include more examples in prompts",
            worked_well="Good at following existing patterns",
        ),
        FeedbackEntry(
            timestamp=now - timedelta(hours=3),
            session_id="session-002",
            alignment=1,
            rework_needed="significant",
            revision_cycles=5,
            improvement_suggestion="Provide clear acceptance criteria",
            worked_well="",
        ),
        FeedbackEntry(
            timestamp=now - timedelta(hours=1),
            session_id="session-003",
            alignment=5,
            rework_needed="none",
            revision_cycles=1,
            improvement_suggestion="",
            worked_well="Excellent refactoring with metrics validation",
        ),
    ]


@pytest.fixture
def sample_retro_config(temp_project_dir: Path) -> RetroConfig:
    """Create a sample RetroConfig for testing.

    Args:
        temp_project_dir: Temporary project directory from fixture.

    Returns:
        RetroConfig configured for the temporary directory.
    """
    return RetroConfig(
        from_ref="HEAD~10",
        to_ref="HEAD",
        sprint_id="sprint-2024-01",
        decisions_path=str(temp_project_dir / "decisions"),
        agent_logs_path=str(temp_project_dir / ".logs"),
        ci_path=None,
        output_dir=str(temp_project_dir / "output"),
    )


@pytest.fixture
def decisions_jsonl_file(temp_project_dir: Path, sample_decisions: list[DecisionRecord]) -> Path:
    """Create a JSONL file with sample decisions.

    Args:
        temp_project_dir: Temporary project directory.
        sample_decisions: List of sample decision records.

    Returns:
        Path to the created JSONL file.
    """
    decisions_dir = temp_project_dir / "decisions"
    decisions_file = decisions_dir / "decisions.jsonl"

    with decisions_file.open("w", encoding="utf-8") as f:
        for decision in sample_decisions:
            f.write(json.dumps(decision.model_dump()) + "\n")

    return decisions_file


@pytest.fixture
def prompts_jsonl_file(temp_project_dir: Path, sample_prompts: list[PromptEntry]) -> Path:
    """Create a JSONL file with sample prompts.

    Args:
        temp_project_dir: Temporary project directory.
        sample_prompts: List of sample prompt entries.

    Returns:
        Path to the created JSONL file.
    """
    prompts_dir = temp_project_dir / ".logs" / "prompts"
    prompts_file = prompts_dir / "prompts.jsonl"

    with prompts_file.open("w", encoding="utf-8") as f:
        for prompt in sample_prompts:
            data = prompt.model_dump()
            data["timestamp"] = prompt.timestamp.isoformat()
            f.write(json.dumps(data) + "\n")

    return prompts_file


@pytest.fixture
def feedback_jsonl_file(temp_project_dir: Path, sample_feedback: list[FeedbackEntry]) -> Path:
    """Create a JSONL file with sample feedback.

    Args:
        temp_project_dir: Temporary project directory.
        sample_feedback: List of sample feedback entries.

    Returns:
        Path to the created JSONL file.
    """
    feedback_dir = temp_project_dir / ".logs" / "feedback"
    feedback_file = feedback_dir / "feedback.jsonl"

    with feedback_file.open("w", encoding="utf-8") as f:
        for feedback in sample_feedback:
            data = feedback.model_dump()
            data["timestamp"] = feedback.timestamp.isoformat()
            f.write(json.dumps(data) + "\n")

    return feedback_file


@pytest.fixture
def empty_decisions_dir(temp_project_dir: Path) -> Path:
    """Return path to empty decisions directory.

    Args:
        temp_project_dir: Temporary project directory.

    Returns:
        Path to the empty decisions directory.
    """
    return temp_project_dir / "decisions"


@pytest.fixture
def mock_git_repo(temp_project_dir: Path) -> Path:
    """Create a mock git repository structure.

    Args:
        temp_project_dir: Temporary project directory.

    Returns:
        Path to the mock git repository.
    """
    # Git directory is already created by temp_project_dir fixture
    # Add refs structure
    refs_dir = temp_project_dir / ".git" / "refs" / "heads"
    refs_dir.mkdir(parents=True, exist_ok=True)

    # Create a dummy main branch ref
    (refs_dir / "main").write_text("abc123def456789012345678901234567890abcd\n")

    return temp_project_dir

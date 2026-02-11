"""Human insights analyzer for extracting patterns from prompts and feedback."""

import json
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import TypeVar

from ..models import (
    CommitInfo,
    FeedbackEntry,
    FeedbackSummary,
    FixToFeatureRatio,
    HumanInsights,
    PromptEntry,
    PromptPattern,
    PromptPatterns,
    ReworkDistribution,
)

T = TypeVar("T")


@dataclass
class DataStatus:
    """Status of available data for analysis.

    Attributes:
        prompts: Number of prompt log entries loaded.
        feedback: Number of feedback log entries loaded.
        has_complexity_signals: Whether complexity signals are present in prompts.
    """

    prompts: int = 0
    feedback: int = 0
    has_complexity_signals: bool = False


class HumanInsightsAnalyzer:
    """Analyzer for human interaction patterns.

    Extracts insights from prompt logs and feedback to identify
    effective and problematic patterns, generate CLAUDE.md suggestions,
    and summarize human-agent collaboration quality.

    Attributes:
        prompts_path: Path to the prompts log directory.
        feedback_path: Path to the feedback log directory.
    """

    # Regex patterns for fix commits
    FIX_PATTERNS: list[re.Pattern[str]] = [
        re.compile(r"^fix[:\s]", re.IGNORECASE),
        re.compile(r"^bugfix[:\s]", re.IGNORECASE),
        re.compile(r"^hotfix[:\s]", re.IGNORECASE),
        re.compile(r"\bfix\b", re.IGNORECASE),
        re.compile(r"\bfixes\b", re.IGNORECASE),
        re.compile(r"\bfixed\b", re.IGNORECASE),
        re.compile(r"\brevert\b", re.IGNORECASE),
        re.compile(r"\bpatch\b", re.IGNORECASE),
    ]

    # Regex patterns for feature commits
    FEATURE_PATTERNS: list[re.Pattern[str]] = [
        re.compile(r"^feat[:\s]", re.IGNORECASE),
        re.compile(r"^feature[:\s]", re.IGNORECASE),
        re.compile(r"^add[:\s]", re.IGNORECASE),
        re.compile(r"^implement[:\s]", re.IGNORECASE),
        re.compile(r"\badd(s|ed)?\b", re.IGNORECASE),
        re.compile(r"\bimplement(s|ed)?\b", re.IGNORECASE),
        re.compile(r"\bnew\b", re.IGNORECASE),
    ]

    def __init__(self, logs_base_path: str | Path) -> None:
        """Initialize the analyzer with paths to log directories.

        Args:
            logs_base_path: Base path containing 'prompts' and 'feedback' subdirectories.
        """
        base_path = Path(logs_base_path)
        self.prompts_path = base_path / "prompts"
        self.feedback_path = base_path / "feedback"
        self._prompt_logs: list[PromptEntry] = []
        self._feedback_logs: list[FeedbackEntry] = []
        self._logs_loaded = False

    def load_logs(self) -> None:
        """Load prompt and feedback logs from JSONL files.

        Reads all .jsonl files from the prompts and feedback directories.
        Each file should contain one JSON object per line.
        """
        self._prompt_logs = self._load_jsonl_files(self.prompts_path, PromptEntry)
        self._feedback_logs = self._load_jsonl_files(self.feedback_path, FeedbackEntry)
        self._logs_loaded = True

    def _load_jsonl_files(
        self, directory: Path, model_class: type[T]
    ) -> list[T]:
        """Load and parse JSONL files from a directory.

        Args:
            directory: Path to directory containing .jsonl files.
            model_class: Pydantic model class to parse entries into.

        Returns:
            List of parsed model instances.
        """
        entries: list[T] = []

        if not directory.exists() or not directory.is_dir():
            return entries

        for jsonl_file in sorted(directory.glob("*.jsonl")):
            try:
                with jsonl_file.open("r", encoding="utf-8") as f:
                    for line_num, line in enumerate(f, 1):
                        line = line.strip()
                        if not line:
                            continue
                        try:
                            data = json.loads(line)
                            entry = model_class.model_validate(data)
                            entries.append(entry)
                        except (json.JSONDecodeError, ValueError) as e:
                            # Skip malformed lines but continue processing
                            print(
                                f"Warning: Skipping malformed line {line_num} "
                                f"in {jsonl_file}: {e}"
                            )
            except OSError as e:
                print(f"Warning: Could not read file {jsonl_file}: {e}")

        return entries

    def analyze_prompt_patterns(self) -> PromptPatterns:
        """Analyze prompts to identify effective and problematic patterns.

        Detects patterns based on:
        - File references: Prompts referencing specific files
        - Constraints: Prompts with explicit constraints
        - High ambiguity: Prompts with unclear requirements
        - Missing acceptance criteria: Prompts without clear success criteria

        Returns:
            PromptPatterns containing lists of effective and problematic patterns.
        """
        effective: list[PromptPattern] = []
        problematic: list[PromptPattern] = []

        if not self._prompt_logs:
            return PromptPatterns(effective=effective, problematic=problematic)

        # Track pattern occurrences
        with_file_refs: list[PromptEntry] = []
        with_constraints: list[PromptEntry] = []
        high_ambiguity: list[PromptEntry] = []
        missing_criteria: list[PromptEntry] = []

        for prompt in self._prompt_logs:
            signals = prompt.complexity_signals

            # File references correlate with better outcomes
            if signals.file_references > 0:
                with_file_refs.append(prompt)

            # Constraints correlate with better outcomes
            if signals.has_constraints:
                with_constraints.append(prompt)

            # High ambiguity prompts cause issues
            if signals.ambiguity_score > 0.7:
                high_ambiguity.append(prompt)

            # Missing acceptance criteria
            if not signals.has_acceptance_criteria:
                missing_criteria.append(prompt)

        # Calculate average alignment and rework for patterns
        # (using feedback correlation if available)
        avg_alignment_with_refs = self._calculate_pattern_alignment(with_file_refs)
        avg_alignment_with_constraints = self._calculate_pattern_alignment(
            with_constraints
        )
        avg_alignment_high_ambiguity = self._calculate_pattern_alignment(high_ambiguity)
        avg_alignment_missing_criteria = self._calculate_pattern_alignment(
            missing_criteria
        )

        avg_rework_with_refs = self._calculate_pattern_rework(with_file_refs)
        avg_rework_with_constraints = self._calculate_pattern_rework(with_constraints)
        avg_rework_high_ambiguity = self._calculate_pattern_rework(high_ambiguity)
        avg_rework_missing_criteria = self._calculate_pattern_rework(missing_criteria)

        # Build effective patterns
        if with_file_refs:
            effective.append(
                PromptPattern(
                    pattern="file_references",
                    description="Prompts that reference specific files or paths",
                    frequency=len(with_file_refs),
                    avg_alignment_score=avg_alignment_with_refs,
                    avg_rework_level=avg_rework_with_refs,
                    examples=self._get_prompt_examples(with_file_refs, max_examples=3),
                    recommendation="Continue including specific file paths in prompts",
                )
            )

        if with_constraints:
            effective.append(
                PromptPattern(
                    pattern="explicit_constraints",
                    description="Prompts with explicit constraints or requirements",
                    frequency=len(with_constraints),
                    avg_alignment_score=avg_alignment_with_constraints,
                    avg_rework_level=avg_rework_with_constraints,
                    examples=self._get_prompt_examples(
                        with_constraints, max_examples=3
                    ),
                    recommendation="Always specify constraints upfront",
                )
            )

        # Build problematic patterns
        if high_ambiguity:
            problematic.append(
                PromptPattern(
                    pattern="high_ambiguity",
                    description="Prompts with unclear or ambiguous requirements",
                    frequency=len(high_ambiguity),
                    avg_alignment_score=avg_alignment_high_ambiguity,
                    avg_rework_level=avg_rework_high_ambiguity,
                    examples=self._get_prompt_examples(high_ambiguity, max_examples=3),
                    recommendation="Break down ambiguous requests into specific tasks",
                )
            )

        if missing_criteria:
            problematic.append(
                PromptPattern(
                    pattern="missing_acceptance_criteria",
                    description="Prompts without clear acceptance criteria",
                    frequency=len(missing_criteria),
                    avg_alignment_score=avg_alignment_missing_criteria,
                    avg_rework_level=avg_rework_missing_criteria,
                    examples=self._get_prompt_examples(
                        missing_criteria, max_examples=3
                    ),
                    recommendation="Include acceptance criteria in prompts",
                )
            )

        return PromptPatterns(effective=effective, problematic=problematic)

    def _calculate_pattern_alignment(self, prompts: list[PromptEntry]) -> float:
        """Calculate average alignment score for prompts matching a pattern.

        Correlates prompts with feedback by session_id to find alignment scores.

        Args:
            prompts: List of prompts matching a pattern.

        Returns:
            Average alignment score (1-5), or 3.0 if no correlation found.
        """
        if not prompts or not self._feedback_logs:
            return 3.0  # Default neutral alignment

        # Build session to alignment map
        session_alignment: dict[str, list[int]] = {}
        for feedback in self._feedback_logs:
            if feedback.session_id not in session_alignment:
                session_alignment[feedback.session_id] = []
            session_alignment[feedback.session_id].append(feedback.alignment)

        # Calculate average for matching sessions
        alignments: list[float] = []
        for prompt in prompts:
            if prompt.session_id in session_alignment:
                session_scores = session_alignment[prompt.session_id]
                alignments.append(sum(session_scores) / len(session_scores))

        if not alignments:
            return 3.0

        return sum(alignments) / len(alignments)

    def _calculate_pattern_rework(self, prompts: list[PromptEntry]) -> float:
        """Calculate average rework level for prompts matching a pattern.

        Correlates prompts with feedback by session_id to find rework levels.

        Args:
            prompts: List of prompts matching a pattern.

        Returns:
            Average rework level (0=none, 1=minor, 2=significant), or 0.0 default.
        """
        if not prompts or not self._feedback_logs:
            return 0.0

        # Map rework strings to numeric values
        rework_values = {"none": 0, "minor": 1, "significant": 2}

        # Build session to rework map
        session_rework: dict[str, list[int]] = {}
        for feedback in self._feedback_logs:
            rework_value = rework_values.get(feedback.rework_needed, 0)
            if feedback.session_id not in session_rework:
                session_rework[feedback.session_id] = []
            session_rework[feedback.session_id].append(rework_value)

        # Calculate average for matching sessions
        rework_levels: list[float] = []
        for prompt in prompts:
            if prompt.session_id in session_rework:
                session_scores = session_rework[prompt.session_id]
                rework_levels.append(sum(session_scores) / len(session_scores))

        if not rework_levels:
            return 0.0

        return sum(rework_levels) / len(rework_levels)

    def _get_prompt_examples(
        self, prompts: list[PromptEntry], max_examples: int = 3
    ) -> list[str]:
        """Get example prompt texts for a pattern.

        Args:
            prompts: List of prompts to extract examples from.
            max_examples: Maximum number of examples to return.

        Returns:
            List of prompt text examples, truncated to 200 chars each.
        """
        examples: list[str] = []
        for prompt in prompts[:max_examples]:
            text = prompt.prompt
            if len(text) > 200:
                text = text[:197] + "..."
            examples.append(text)
        return examples

    def analyze_feedback(self) -> FeedbackSummary:
        """Analyze feedback logs to generate summary statistics.

        Returns:
            FeedbackSummary with average alignment, rework distribution,
            and revision cycle statistics.
        """
        if not self._feedback_logs:
            return FeedbackSummary(
                avg_alignment=0.0,
                total_sessions=0,
                rework_distribution=ReworkDistribution(),
                avg_revision_cycles=0.0,
            )

        # Calculate average alignment
        total_alignment = sum(f.alignment for f in self._feedback_logs)
        avg_alignment = total_alignment / len(self._feedback_logs)

        # Calculate rework distribution
        rework_dist = ReworkDistribution()
        for feedback in self._feedback_logs:
            if feedback.rework_needed == "none":
                rework_dist.none += 1
            elif feedback.rework_needed == "minor":
                rework_dist.minor += 1
            elif feedback.rework_needed == "significant":
                rework_dist.significant += 1

        # Calculate average revision cycles
        revision_cycles = [
            f.revision_cycles
            for f in self._feedback_logs
            if f.revision_cycles is not None
        ]
        avg_revision_cycles = (
            sum(revision_cycles) / len(revision_cycles) if revision_cycles else 0.0
        )

        # Count unique sessions
        unique_sessions = {f.session_id for f in self._feedback_logs}

        return FeedbackSummary(
            avg_alignment=round(avg_alignment, 2),
            total_sessions=len(unique_sessions),
            rework_distribution=rework_dist,
            avg_revision_cycles=round(avg_revision_cycles, 2),
        )

    def generate_claude_md_suggestions(self) -> list[str]:
        """Generate CLAUDE.md suggestions based on patterns.

        Analyzes effective and problematic patterns to generate
        actionable suggestions for improving CLAUDE.md configuration.

        Returns:
            List of suggestion strings for CLAUDE.md improvements.
        """
        suggestions: list[str] = []
        patterns = self.analyze_prompt_patterns()

        # Suggestions from effective patterns
        for pattern in patterns.effective:
            if pattern.pattern == "file_references" and pattern.frequency >= 5:
                suggestions.append(
                    "Add a 'File Organization' section to CLAUDE.md with common file "
                    "paths and their purposes"
                )
            if pattern.pattern == "explicit_constraints" and pattern.frequency >= 3:
                suggestions.append(
                    "Document coding constraints and requirements in CLAUDE.md "
                    "to reduce repetition in prompts"
                )

        # Suggestions from problematic patterns
        for pattern in patterns.problematic:
            if pattern.pattern == "high_ambiguity" and pattern.frequency >= 3:
                suggestions.append(
                    "Add a 'Task Templates' section to CLAUDE.md with structured "
                    "formats for common request types"
                )
            if pattern.pattern == "missing_acceptance_criteria" and pattern.frequency >= 5:
                suggestions.append(
                    "Include an 'Acceptance Criteria Checklist' in CLAUDE.md "
                    "as a reminder for prompts"
                )

        # Feedback-based suggestions
        feedback_summary = self.analyze_feedback()
        if feedback_summary.avg_alignment < 3.5 and feedback_summary.total_sessions >= 5:
            suggestions.append(
                "Consider adding more context about project conventions and "
                "expected output formats to CLAUDE.md"
            )

        if feedback_summary.rework_distribution.significant >= 3:
            suggestions.append(
                "Document common error patterns and how to avoid them in CLAUDE.md"
            )

        if feedback_summary.avg_revision_cycles > 2.0:
            suggestions.append(
                "Add a 'Review Checklist' to CLAUDE.md to catch issues before "
                "submitting work"
            )

        return suggestions

    def extract_top_insights(self) -> dict[str, list[str]]:
        """Extract top improvements and successes from feedback.

        Returns:
            Dictionary with 'improvements' and 'successes' lists.
        """
        improvements: list[str] = []
        successes: list[str] = []

        for feedback in self._feedback_logs:
            # Extract improvement suggestions
            if feedback.improvement_suggestion:
                suggestion = feedback.improvement_suggestion.strip()
                if suggestion and suggestion not in improvements:
                    improvements.append(suggestion)

            # Extract what worked well
            if feedback.worked_well:
                success = feedback.worked_well.strip()
                if success and success not in successes:
                    successes.append(success)

        # Return top 5 of each
        return {
            "improvements": improvements[:5],
            "successes": successes[:5],
        }

    def analyze(self) -> HumanInsights:
        """Run full analysis and return human insights.

        Loads logs if not already loaded, then analyzes prompt patterns,
        feedback, and generates suggestions.

        Returns:
            HumanInsights containing all analysis results.
        """
        if not self._logs_loaded:
            self.load_logs()

        prompt_patterns = self.analyze_prompt_patterns()
        feedback_summary = self.analyze_feedback()
        claude_md_suggestions = self.generate_claude_md_suggestions()
        insights = self.extract_top_insights()

        return HumanInsights(
            prompt_patterns=prompt_patterns,
            feedback_summary=feedback_summary,
            claude_md_suggestions=claude_md_suggestions,
            top_improvements=insights["improvements"],
            top_successes=insights["successes"],
        )

    def has_data(self) -> bool:
        """Check if any log data is available.

        Returns:
            True if prompts or feedback logs exist, False otherwise.
        """
        if not self._logs_loaded:
            self.load_logs()
        return len(self._prompt_logs) > 0 or len(self._feedback_logs) > 0

    def get_data_status(self) -> DataStatus:
        """Get status of available data.

        Returns:
            DataStatus with counts and complexity signal availability.
        """
        if not self._logs_loaded:
            self.load_logs()

        has_complexity_signals = any(
            prompt.complexity_signals.has_constraints
            or prompt.complexity_signals.has_examples
            or prompt.complexity_signals.has_acceptance_criteria
            or prompt.complexity_signals.file_references > 0
            or prompt.complexity_signals.ambiguity_score > 0
            for prompt in self._prompt_logs
        )

        return DataStatus(
            prompts=len(self._prompt_logs),
            feedback=len(self._feedback_logs),
            has_complexity_signals=has_complexity_signals,
        )

    @staticmethod
    def calculate_fix_to_feature_ratio(commits: list[CommitInfo]) -> FixToFeatureRatio:
        """Calculate the ratio of fix commits to feature commits.

        Analyzes commit messages to categorize them as fixes or features
        based on conventional commit patterns and keywords.

        Args:
            commits: List of commit information to analyze.

        Returns:
            FixToFeatureRatio with ratio, counts, and health assessment.
        """
        fix_commits = 0
        feature_commits = 0

        for commit in commits:
            subject = commit.subject

            is_fix = any(
                pattern.search(subject)
                for pattern in HumanInsightsAnalyzer.FIX_PATTERNS
            )
            is_feature = any(
                pattern.search(subject)
                for pattern in HumanInsightsAnalyzer.FEATURE_PATTERNS
            )

            # Only count if clearly one or the other
            if is_fix and not is_feature:
                fix_commits += 1
            elif is_feature and not is_fix:
                feature_commits += 1

        # Calculate ratio
        if feature_commits > 0:
            ratio = fix_commits / feature_commits
        elif fix_commits > 0:
            ratio = float("inf")
        else:
            ratio = 0.0

        threshold = 0.1
        is_healthy = ratio <= threshold

        return FixToFeatureRatio(
            ratio=ratio,
            fix_commits=fix_commits,
            feature_commits=feature_commits,
            is_healthy=is_healthy,
            threshold=threshold,
        )

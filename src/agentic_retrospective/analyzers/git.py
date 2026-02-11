"""Git repository analyzer for extracting commit history and statistics."""

import subprocess
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Literal

from ..models import ChangeType, CommitInfo, FileChange


@dataclass
class GitAnalysisResult:
    """Result of analyzing a git repository.

    Attributes:
        commits: List of commit information objects.
        total_lines_added: Total lines added across all commits.
        total_lines_removed: Total lines removed across all commits.
        files_by_extension: Count of changes per file extension.
        hotspots: Files with the most changes, sorted by change count.
    """

    commits: list[CommitInfo] = field(default_factory=list)
    total_lines_added: int = 0
    total_lines_removed: int = 0
    files_by_extension: dict[str, int] = field(default_factory=dict)
    hotspots: list[dict[str, int | str]] = field(default_factory=list)


class GitAnalyzer:
    """Analyzer for git repositories.

    Extracts commit history, file changes, and calculates statistics
    like hotspots (frequently changed files) and lines added/removed.
    """

    def is_git_repository(self) -> bool:
        """Check if the current directory is a git repository.

        Returns:
            True if inside a git repository, False otherwise.
        """
        try:
            subprocess.run(
                ["git", "rev-parse", "--git-dir"],
                capture_output=True,
                check=True,
            )
            return True
        except subprocess.CalledProcessError:
            return False

    def analyze(self, from_ref: str, to_ref: str = "HEAD") -> GitAnalysisResult:
        """Analyze git history between two references or time periods.

        Args:
            from_ref: Starting commit reference, or a date string like "2 weeks ago".
            to_ref: Ending commit reference (inclusive). Defaults to HEAD.

        Returns:
            GitAnalysisResult containing commits, statistics, and hotspots.
        """
        # If from_ref looks like a date string, use --since instead of ref..ref
        if self._is_date_string(from_ref):
            commits = self._get_commits_since(from_ref, to_ref)
        else:
            resolved_from = from_ref or self._get_default_from_ref()
            commits = self._get_commits(resolved_from, to_ref)

        total_lines_added = 0
        total_lines_removed = 0
        file_change_counts: dict[str, int] = {}
        files_by_extension: dict[str, int] = {}

        for commit in commits:
            total_lines_added += commit.lines_added
            total_lines_removed += commit.lines_removed

            for file_change in commit.files:
                # Track file change counts for hotspot detection
                current = file_change_counts.get(file_change.path, 0)
                file_change_counts[file_change.path] = current + 1

                # Track changes by extension
                ext = self._get_extension(file_change.path)
                ext_count = files_by_extension.get(ext, 0)
                files_by_extension[ext] = ext_count + 1

        # Calculate hotspots: files changed 3+ times, sorted by change count
        hotspots = [
            {"path": path, "changes": count}
            for path, count in file_change_counts.items()
            if count >= 3
        ]
        hotspots.sort(key=lambda x: x["changes"], reverse=True)
        hotspots = hotspots[:10]

        return GitAnalysisResult(
            commits=commits,
            total_lines_added=total_lines_added,
            total_lines_removed=total_lines_removed,
            files_by_extension=files_by_extension,
            hotspots=hotspots,
        )

    def _get_default_from_ref(self) -> str:
        """Get the default starting reference (2 weeks ago or HEAD~100).

        Returns:
            Commit hash from 2 weeks ago, or HEAD~100 as fallback.
        """
        try:
            two_weeks_ago = datetime.now() - timedelta(days=14)
            date_str = two_weeks_ago.strftime("%Y-%m-%d")

            result = subprocess.run(
                ["git", "log", f"--since={date_str}", "--reverse", "--format=%H"],
                capture_output=True,
                text=True,
                check=True,
            )

            lines = result.stdout.strip().split("\n")
            if lines and lines[0]:
                return lines[0]
        except subprocess.CalledProcessError:
            pass

        return "HEAD~100"

    def _get_commits(self, from_ref: str, to_ref: str) -> list[CommitInfo]:
        """Get all commits between two references.

        Args:
            from_ref: Starting commit reference (exclusive).
            to_ref: Ending commit reference (inclusive).

        Returns:
            List of CommitInfo objects for each commit.
        """
        commits: list[CommitInfo] = []

        try:
            result = subprocess.run(
                ["git", "log", f"{from_ref}..{to_ref}", "--format=%H"],
                capture_output=True,
                text=True,
                check=True,
            )

            hashes_output = result.stdout.strip()
            if not hashes_output:
                return commits

            hashes = [h for h in hashes_output.split("\n") if h]

            for commit_hash in hashes:
                commit = self._get_commit_info(commit_hash)
                if commit:
                    commits.append(commit)

        except subprocess.CalledProcessError as e:
            print(f"Error getting commits: {e}")

        return commits

    def _is_date_string(self, ref: str) -> bool:
        """Check if a reference looks like a date string.

        Args:
            ref: The reference to check.

        Returns:
            True if ref appears to be a date string (e.g., "2 weeks ago").
        """
        if not ref:
            return False
        date_keywords = ["ago", "yesterday", "today", "week", "day", "month", "year"]
        ref_lower = ref.lower()
        return any(kw in ref_lower for kw in date_keywords)

    def _get_commits_since(self, since: str, to_ref: str) -> list[CommitInfo]:
        """Get all commits since a date string.

        Args:
            since: Date string like "2 weeks ago".
            to_ref: Ending commit reference.

        Returns:
            List of CommitInfo objects for each commit.
        """
        commits: list[CommitInfo] = []

        try:
            result = subprocess.run(
                ["git", "log", f"--since={since}", to_ref, "--format=%H"],
                capture_output=True,
                text=True,
                check=True,
            )

            hashes_output = result.stdout.strip()
            if not hashes_output:
                return commits

            hashes = [h for h in hashes_output.split("\n") if h]

            for commit_hash in hashes:
                commit = self._get_commit_info(commit_hash)
                if commit:
                    commits.append(commit)

        except subprocess.CalledProcessError as e:
            print(f"Error getting commits since {since}: {e}")

        return commits

    def _get_commit_info(self, commit_hash: str) -> CommitInfo | None:
        """Get detailed information about a specific commit.

        Args:
            commit_hash: The full commit hash.

        Returns:
            CommitInfo object with commit details, or None on error.
        """
        try:
            # Get commit metadata
            format_result = subprocess.run(
                [
                    "git",
                    "log",
                    "-1",
                    "--format=%H%n%h%n%an%n%ae%n%aI%n%s%n%b",
                    commit_hash,
                ],
                capture_output=True,
                text=True,
                check=True,
            )

            format_output = format_result.stdout.strip()
            lines = format_output.split("\n")

            # Get file statistics
            stats_result = subprocess.run(
                ["git", "diff-tree", "--no-commit-id", "--numstat", "-r", commit_hash],
                capture_output=True,
                text=True,
                check=True,
            )

            stats_output = stats_result.stdout.strip()
            files: list[FileChange] = []
            lines_added = 0
            lines_removed = 0

            if stats_output:
                for stat_line in stats_output.split("\n"):
                    if not stat_line:
                        continue

                    parts = stat_line.split("\t")
                    if len(parts) >= 3:
                        added_str, removed_str, path = parts[0], parts[1], parts[2]

                        # Binary files show '-' for stats
                        additions = 0 if added_str == "-" else int(added_str)
                        deletions = 0 if removed_str == "-" else int(removed_str)

                        lines_added += additions
                        lines_removed += deletions

                        change_type = self._determine_change_type(
                            additions, deletions, path
                        )
                        files.append(
                            FileChange(
                                path=path,
                                additions=additions,
                                deletions=deletions,
                                change_type=change_type,
                            )
                        )

            return CommitInfo(
                hash=lines[0] if len(lines) > 0 else "",
                short_hash=lines[1] if len(lines) > 1 else "",
                author=lines[2] if len(lines) > 2 else "",
                email=lines[3] if len(lines) > 3 else "",
                date=lines[4] if len(lines) > 4 else "",
                subject=lines[5] if len(lines) > 5 else "",
                body="\n".join(lines[6:]) if len(lines) > 6 else "",
                files=files,
                lines_added=lines_added,
                lines_removed=lines_removed,
            )

        except subprocess.CalledProcessError as e:
            print(f"Error getting commit info for {commit_hash}: {e}")
            return None

    def _determine_change_type(
        self, additions: int, deletions: int, _path: str
    ) -> ChangeType:
        """Determine the type of change based on additions and deletions.

        Args:
            additions: Number of lines added.
            deletions: Number of lines deleted.
            _path: File path (unused but kept for API compatibility).

        Returns:
            ChangeType literal: 'add', 'delete', or 'modify'.
        """
        if additions > 0 and deletions == 0:
            return "add"
        if additions == 0 and deletions > 0:
            return "delete"
        return "modify"

    def _get_extension(self, path: str) -> str:
        """Extract the file extension from a path.

        Args:
            path: File path to extract extension from.

        Returns:
            File extension with dot prefix, or '(none)' if no extension.
        """
        parts = path.split(".")
        if len(parts) > 1:
            return f".{parts[-1]}"
        return "(none)"

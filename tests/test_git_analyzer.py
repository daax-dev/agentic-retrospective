"""Tests for Git analyzer in agentic_retrospective.analyzers.git."""

import subprocess
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from agentic_retrospective.analyzers.git import GitAnalysisResult, GitAnalyzer
from agentic_retrospective.models import CommitInfo, FileChange


class TestGitAnalyzerIsGitRepository:
    """Tests for GitAnalyzer.is_git_repository method."""

    def test_is_git_repository_returns_true_in_git_repo(self):
        """Test is_git_repository returns True when inside a git repo."""
        with patch("subprocess.run") as mock_run:
            mock_run.return_value = MagicMock(returncode=0)
            analyzer = GitAnalyzer()

            result = analyzer.is_git_repository()

            assert result is True
            mock_run.assert_called_once()

    def test_is_git_repository_returns_false_outside_git_repo(self):
        """Test is_git_repository returns False when not in a git repo."""
        with patch("subprocess.run") as mock_run:
            mock_run.side_effect = subprocess.CalledProcessError(128, "git")
            analyzer = GitAnalyzer()

            result = analyzer.is_git_repository()

            assert result is False

    def test_is_git_repository_calls_correct_command(self):
        """Test is_git_repository calls git rev-parse --git-dir."""
        with patch("subprocess.run") as mock_run:
            mock_run.return_value = MagicMock(returncode=0)
            analyzer = GitAnalyzer()
            analyzer.is_git_repository()

            call_args = mock_run.call_args
            assert call_args[0][0] == ["git", "rev-parse", "--git-dir"]


class TestGitAnalyzerAnalyze:
    """Tests for GitAnalyzer.analyze method."""

    @pytest.fixture
    def mock_git_log_output(self) -> str:
        """Mock output for git log command."""
        return "abc123\nbcd234\ncde345"

    @pytest.fixture
    def mock_commit_info_output(self) -> str:
        """Mock output for git log -1 --format command."""
        return (
            "abc123def456789012345678901234567890abcd\n"
            "abc123d\n"
            "Developer\n"
            "dev@example.com\n"
            "2024-01-15T10:30:00+00:00\n"
            "feat: add feature\n"
            "Body text"
        )

    @pytest.fixture
    def mock_numstat_output(self) -> str:
        """Mock output for git diff-tree --numstat command."""
        return "10\t5\tsrc/main.py\n20\t0\tsrc/new.py"

    def test_analyze_with_no_commits(self):
        """Test analyze returns empty result when no commits found."""
        with patch("subprocess.run") as mock_run:
            # Mock git log to return empty output
            mock_run.return_value = MagicMock(stdout="", returncode=0)
            analyzer = GitAnalyzer()

            result = analyzer.analyze("HEAD~10", "HEAD")

            assert isinstance(result, GitAnalysisResult)
            assert result.commits == []
            assert result.total_lines_added == 0
            assert result.total_lines_removed == 0

    def test_analyze_with_commits(
        self, mock_git_log_output: str, mock_commit_info_output: str, mock_numstat_output: str
    ):
        """Test analyze processes commits correctly."""
        with patch("subprocess.run") as mock_run:

            def side_effect(*args, **kwargs):
                cmd = args[0]
                result = MagicMock()
                result.returncode = 0

                if "log" in cmd and "--format=%H" in cmd:
                    # git log for getting commit hashes
                    result.stdout = mock_git_log_output
                elif "log" in cmd and "-1" in cmd:
                    # git log -1 for commit details
                    result.stdout = mock_commit_info_output
                elif "diff-tree" in cmd:
                    # git diff-tree for file stats
                    result.stdout = mock_numstat_output
                else:
                    result.stdout = ""

                return result

            mock_run.side_effect = side_effect
            analyzer = GitAnalyzer()

            result = analyzer.analyze("HEAD~10", "HEAD")

            assert isinstance(result, GitAnalysisResult)
            # Should have 3 commits based on mock output
            assert len(result.commits) == 3
            assert result.total_lines_added > 0

    def test_analyze_calculates_total_lines(self):
        """Test analyze correctly calculates total lines added/removed."""
        with patch.object(GitAnalyzer, "_get_commits") as mock_get_commits:
            mock_get_commits.return_value = [
                CommitInfo(
                    hash="abc123",
                    short_hash="abc1",
                    author="Dev",
                    email="dev@test.com",
                    date="2024-01-15",
                    subject="test",
                    body="",
                    files=[
                        FileChange(path="a.py", additions=10, deletions=5, change_type="modify")
                    ],
                    lines_added=10,
                    lines_removed=5,
                ),
                CommitInfo(
                    hash="bcd234",
                    short_hash="bcd2",
                    author="Dev",
                    email="dev@test.com",
                    date="2024-01-16",
                    subject="test2",
                    body="",
                    files=[FileChange(path="b.py", additions=20, deletions=3, change_type="add")],
                    lines_added=20,
                    lines_removed=3,
                ),
            ]
            analyzer = GitAnalyzer()

            result = analyzer.analyze("HEAD~10", "HEAD")

            assert result.total_lines_added == 30
            assert result.total_lines_removed == 8

    def test_analyze_detects_hotspots(self):
        """Test analyze correctly identifies hotspot files."""
        with patch.object(GitAnalyzer, "_get_commits") as mock_get_commits:
            # Create commits where src/main.py is changed 5 times
            commits = []
            for i in range(5):
                commits.append(
                    CommitInfo(
                        hash=f"abc{i}",
                        short_hash=f"abc{i}",
                        author="Dev",
                        email="dev@test.com",
                        date="2024-01-15",
                        subject=f"change {i}",
                        body="",
                        files=[
                            FileChange(
                                path="src/main.py", additions=5, deletions=2, change_type="modify"
                            )
                        ],
                        lines_added=5,
                        lines_removed=2,
                    )
                )

            mock_get_commits.return_value = commits
            analyzer = GitAnalyzer()

            result = analyzer.analyze("HEAD~10", "HEAD")

            assert len(result.hotspots) > 0
            assert result.hotspots[0]["path"] == "src/main.py"
            assert result.hotspots[0]["changes"] == 5

    def test_analyze_counts_files_by_extension(self):
        """Test analyze correctly counts files by extension."""
        with patch.object(GitAnalyzer, "_get_commits") as mock_get_commits:
            mock_get_commits.return_value = [
                CommitInfo(
                    hash="abc123",
                    short_hash="abc1",
                    author="Dev",
                    email="dev@test.com",
                    date="2024-01-15",
                    subject="test",
                    body="",
                    files=[
                        FileChange(path="main.py", additions=10, deletions=0, change_type="add"),
                        FileChange(path="utils.py", additions=5, deletions=0, change_type="add"),
                        FileChange(path="config.json", additions=2, deletions=0, change_type="add"),
                    ],
                    lines_added=17,
                    lines_removed=0,
                ),
            ]
            analyzer = GitAnalyzer()

            result = analyzer.analyze("HEAD~10", "HEAD")

            assert ".py" in result.files_by_extension
            assert result.files_by_extension[".py"] == 2
            assert result.files_by_extension[".json"] == 1

    def test_analyze_limits_hotspots_to_10(self):
        """Test analyze limits hotspots to top 10 files."""
        with patch.object(GitAnalyzer, "_get_commits") as mock_get_commits:
            # Create commits where 15 different files are each changed 5 times
            commits = []
            for i in range(5):
                files = [
                    FileChange(
                        path=f"src/file{j}.py", additions=1, deletions=0, change_type="modify"
                    )
                    for j in range(15)
                ]
                commits.append(
                    CommitInfo(
                        hash=f"abc{i}",
                        short_hash=f"abc{i}",
                        author="Dev",
                        email="dev@test.com",
                        date="2024-01-15",
                        subject=f"change {i}",
                        body="",
                        files=files,
                        lines_added=15,
                        lines_removed=0,
                    )
                )

            mock_get_commits.return_value = commits
            analyzer = GitAnalyzer()

            result = analyzer.analyze("HEAD~10", "HEAD")

            assert len(result.hotspots) <= 10

    def test_analyze_hotspots_require_3_changes(self):
        """Test analyze only includes files with 3+ changes as hotspots."""
        with patch.object(GitAnalyzer, "_get_commits") as mock_get_commits:
            commits = [
                CommitInfo(
                    hash="abc1",
                    short_hash="abc1",
                    author="Dev",
                    email="dev@test.com",
                    date="2024-01-15",
                    subject="test",
                    body="",
                    files=[
                        FileChange(
                            path="once.py", additions=1, deletions=0, change_type="modify"
                        ),  # Changed once
                        FileChange(
                            path="twice.py", additions=1, deletions=0, change_type="modify"
                        ),  # Changed twice
                    ],
                    lines_added=2,
                    lines_removed=0,
                ),
                CommitInfo(
                    hash="abc2",
                    short_hash="abc2",
                    author="Dev",
                    email="dev@test.com",
                    date="2024-01-16",
                    subject="test2",
                    body="",
                    files=[
                        FileChange(path="twice.py", additions=1, deletions=0, change_type="modify")
                    ],
                    lines_added=1,
                    lines_removed=0,
                ),
            ]

            mock_get_commits.return_value = commits
            analyzer = GitAnalyzer()

            result = analyzer.analyze("HEAD~10", "HEAD")

            # Neither file has 3+ changes, so no hotspots
            assert len(result.hotspots) == 0


class TestGitAnalyzerHelperMethods:
    """Tests for GitAnalyzer helper methods."""

    def test_get_extension_with_extension(self):
        """Test _get_extension extracts extension correctly."""
        analyzer = GitAnalyzer()

        assert analyzer._get_extension("main.py") == ".py"
        assert analyzer._get_extension("config.json") == ".json"
        assert analyzer._get_extension("path/to/file.ts") == ".ts"

    def test_get_extension_without_extension(self):
        """Test _get_extension returns (none) for files without extension."""
        analyzer = GitAnalyzer()

        assert analyzer._get_extension("Makefile") == "(none)"
        assert analyzer._get_extension("Dockerfile") == "(none)"

    def test_get_extension_with_multiple_dots(self):
        """Test _get_extension handles files with multiple dots."""
        analyzer = GitAnalyzer()

        assert analyzer._get_extension("file.test.py") == ".py"
        assert analyzer._get_extension("archive.tar.gz") == ".gz"

    def test_determine_change_type_add(self):
        """Test _determine_change_type identifies additions."""
        analyzer = GitAnalyzer()

        change_type = analyzer._determine_change_type(50, 0, "new_file.py")

        assert change_type == "add"

    def test_determine_change_type_delete(self):
        """Test _determine_change_type identifies deletions."""
        analyzer = GitAnalyzer()

        change_type = analyzer._determine_change_type(0, 30, "old_file.py")

        assert change_type == "delete"

    def test_determine_change_type_modify(self):
        """Test _determine_change_type identifies modifications."""
        analyzer = GitAnalyzer()

        change_type = analyzer._determine_change_type(10, 5, "existing_file.py")

        assert change_type == "modify"


class TestGitAnalyzerGetDefaultFromRef:
    """Tests for GitAnalyzer._get_default_from_ref method."""

    def test_get_default_from_ref_returns_commit_from_two_weeks_ago(self):
        """Test _get_default_from_ref returns commit from 2 weeks ago."""
        with patch("subprocess.run") as mock_run:
            mock_run.return_value = MagicMock(
                stdout="abc123def456\nbcd234567890\n", returncode=0
            )
            analyzer = GitAnalyzer()

            result = analyzer._get_default_from_ref()

            # Should return first commit from the list
            assert result == "abc123def456"

    def test_get_default_from_ref_falls_back_to_head_100(self):
        """Test _get_default_from_ref falls back to HEAD~100 on error."""
        with patch("subprocess.run") as mock_run:
            mock_run.side_effect = subprocess.CalledProcessError(128, "git")
            analyzer = GitAnalyzer()

            result = analyzer._get_default_from_ref()

            assert result == "HEAD~100"

    def test_get_default_from_ref_falls_back_on_empty_output(self):
        """Test _get_default_from_ref falls back when no commits found."""
        with patch("subprocess.run") as mock_run:
            mock_run.return_value = MagicMock(stdout="", returncode=0)
            analyzer = GitAnalyzer()

            result = analyzer._get_default_from_ref()

            assert result == "HEAD~100"


class TestGitAnalyzerGetCommitInfo:
    """Tests for GitAnalyzer._get_commit_info method."""

    def test_get_commit_info_parses_output_correctly(self):
        """Test _get_commit_info parses git output correctly."""
        with patch("subprocess.run") as mock_run:

            def side_effect(*args, **kwargs):
                cmd = args[0]
                result = MagicMock()
                result.returncode = 0

                if "log" in cmd:
                    result.stdout = (
                        "abc123def456789012345678901234567890abcd\n"
                        "abc123d\n"
                        "John Doe\n"
                        "john@example.com\n"
                        "2024-01-15T10:30:00+00:00\n"
                        "feat: add feature\n"
                        "This is the body"
                    )
                elif "diff-tree" in cmd:
                    result.stdout = "10\t5\tsrc/main.py"
                else:
                    result.stdout = ""

                return result

            mock_run.side_effect = side_effect
            analyzer = GitAnalyzer()

            commit = analyzer._get_commit_info("abc123def456789012345678901234567890abcd")

            assert commit is not None
            assert commit.author == "John Doe"
            assert commit.email == "john@example.com"
            assert commit.subject == "feat: add feature"
            assert commit.lines_added == 10
            assert commit.lines_removed == 5

    def test_get_commit_info_handles_binary_files(self):
        """Test _get_commit_info handles binary files in numstat."""
        with patch("subprocess.run") as mock_run:

            def side_effect(*args, **kwargs):
                cmd = args[0]
                result = MagicMock()
                result.returncode = 0

                if "log" in cmd:
                    result.stdout = (
                        "abc123def456789012345678901234567890abcd\n"
                        "abc123d\n"
                        "Dev\n"
                        "dev@test.com\n"
                        "2024-01-15\n"
                        "test\n"
                        ""
                    )
                elif "diff-tree" in cmd:
                    # Binary files show '-' for additions/deletions
                    result.stdout = "-\t-\timage.png\n10\t5\tsrc/main.py"
                else:
                    result.stdout = ""

                return result

            mock_run.side_effect = side_effect
            analyzer = GitAnalyzer()

            commit = analyzer._get_commit_info("abc123")

            assert commit is not None
            assert len(commit.files) == 2
            # Binary file should have 0 additions/deletions
            binary_file = next(f for f in commit.files if f.path == "image.png")
            assert binary_file.additions == 0
            assert binary_file.deletions == 0

    def test_get_commit_info_returns_none_on_error(self):
        """Test _get_commit_info returns None on subprocess error."""
        with patch("subprocess.run") as mock_run:
            mock_run.side_effect = subprocess.CalledProcessError(128, "git")
            analyzer = GitAnalyzer()

            commit = analyzer._get_commit_info("nonexistent")

            assert commit is None


class TestGitAnalysisResult:
    """Tests for GitAnalysisResult dataclass."""

    def test_git_analysis_result_defaults(self):
        """Test GitAnalysisResult has correct default values."""
        result = GitAnalysisResult()

        assert result.commits == []
        assert result.total_lines_added == 0
        assert result.total_lines_removed == 0
        assert result.files_by_extension == {}
        assert result.hotspots == []

    def test_git_analysis_result_with_data(self):
        """Test GitAnalysisResult with provided data."""
        result = GitAnalysisResult(
            commits=[],
            total_lines_added=100,
            total_lines_removed=50,
            files_by_extension={".py": 10, ".json": 2},
            hotspots=[{"path": "main.py", "changes": 5}],
        )

        assert result.total_lines_added == 100
        assert result.files_by_extension[".py"] == 10
        assert len(result.hotspots) == 1

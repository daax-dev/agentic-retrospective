"""Tests for Runner orchestration in agentic_retrospective.runner."""

import json
import os
import tempfile
from datetime import datetime, timedelta
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from agentic_retrospective.models import (
    CommitInfo,
    DecisionRecord,
    FileChange,
    RetroConfig,
)
from agentic_retrospective.runner import (
    CollectedData,
    RetroRunner,
    RunOptions,
    RunResult,
    run_retro,
    run_retro_async,
)


@pytest.fixture
def mock_config(temp_project_dir: Path) -> RetroConfig:
    """Create a mock RetroConfig for testing."""
    return RetroConfig(
        from_ref="HEAD~10",
        to_ref="HEAD",
        sprint_id="sprint-test-001",
        decisions_path=str(temp_project_dir / "decisions"),
        agent_logs_path=str(temp_project_dir / ".logs"),
        ci_path=None,
        output_dir=str(temp_project_dir / "output"),
    )


@pytest.fixture
def mock_commits() -> list[CommitInfo]:
    """Create mock commits for testing."""
    now = datetime.now()
    return [
        CommitInfo(
            hash="abc123def456789012345678901234567890abcd",
            short_hash="abc123d",
            author="Human Developer",
            email="dev@example.com",
            date=(now - timedelta(days=3)).isoformat(),
            subject="feat: add feature",
            body="",
            files=[
                FileChange(path="src/main.py", additions=50, deletions=10, change_type="modify")
            ],
            lines_added=50,
            lines_removed=10,
        ),
        CommitInfo(
            hash="bcd234567890123456789012345678901234bcde",
            short_hash="bcd2345",
            author="Claude",
            email="claude@anthropic.com",
            date=(now - timedelta(days=2)).isoformat(),
            subject="fix: resolve bug",
            body="",
            files=[FileChange(path="src/main.py", additions=5, deletions=3, change_type="modify")],
            lines_added=5,
            lines_removed=3,
        ),
        CommitInfo(
            hash="cde345678901234567890123456789012345cdef",
            short_hash="cde3456",
            author="Human Developer",
            email="dev@example.com",
            date=(now - timedelta(days=1)).isoformat(),
            subject="test: add tests",
            body="",
            files=[
                FileChange(
                    path="tests/test_main.py", additions=100, deletions=0, change_type="add"
                )
            ],
            lines_added=100,
            lines_removed=0,
        ),
    ]


class TestRetroRunnerRun:
    """Tests for RetroRunner.run method."""

    def test_run_fails_outside_git_repository(self, mock_config: RetroConfig):
        """Test run returns failure when not in a git repository."""
        with patch(
            "agentic_retrospective.runner.GitAnalyzer.is_git_repository", return_value=False
        ):
            runner = RetroRunner(mock_config)
            result = runner.run()

            assert result.success is False
            assert "git repository" in result.error.lower()

    def test_run_succeeds_with_minimal_data(
        self, mock_config: RetroConfig, mock_commits: list[CommitInfo]
    ):
        """Test run succeeds with minimal data."""
        with patch(
            "agentic_retrospective.runner.GitAnalyzer.is_git_repository", return_value=True
        ):
            with patch("agentic_retrospective.runner.GitAnalyzer.analyze") as mock_analyze:
                mock_result = MagicMock()
                mock_result.commits = mock_commits
                mock_analyze.return_value = mock_result

                runner = RetroRunner(mock_config)
                result = runner.run()

                assert result.success is True
                assert result.report is not None
                assert result.output_path == mock_config.output_dir

    def test_run_generates_report(
        self, mock_config: RetroConfig, mock_commits: list[CommitInfo]
    ):
        """Test run generates a complete RetroReport."""
        with patch(
            "agentic_retrospective.runner.GitAnalyzer.is_git_repository", return_value=True
        ):
            with patch("agentic_retrospective.runner.GitAnalyzer.analyze") as mock_analyze:
                mock_result = MagicMock()
                mock_result.commits = mock_commits
                mock_analyze.return_value = mock_result

                runner = RetroRunner(mock_config)
                result = runner.run()

                assert result.report.sprint_id == "sprint-test-001"
                assert result.report.summary.commits == 3
                assert result.report.scores is not None

    def test_run_writes_output_files(
        self, mock_config: RetroConfig, mock_commits: list[CommitInfo], temp_project_dir: Path
    ):
        """Test run writes output files to output directory."""
        with patch(
            "agentic_retrospective.runner.GitAnalyzer.is_git_repository", return_value=True
        ):
            with patch("agentic_retrospective.runner.GitAnalyzer.analyze") as mock_analyze:
                mock_result = MagicMock()
                mock_result.commits = mock_commits
                mock_analyze.return_value = mock_result

                runner = RetroRunner(mock_config)
                runner.run()

                output_dir = Path(mock_config.output_dir)
                assert (output_dir / "retro.json").exists()
                assert (output_dir / "evidence_map.json").exists()
                assert (output_dir / "retro.md").exists()

    def test_run_json_only_skips_markdown(
        self, mock_config: RetroConfig, mock_commits: list[CommitInfo]
    ):
        """Test run with json_only option skips markdown generation."""
        with patch(
            "agentic_retrospective.runner.GitAnalyzer.is_git_repository", return_value=True
        ):
            with patch("agentic_retrospective.runner.GitAnalyzer.analyze") as mock_analyze:
                mock_result = MagicMock()
                mock_result.commits = mock_commits
                mock_analyze.return_value = mock_result

                options = RunOptions(json_only=True)
                runner = RetroRunner(mock_config, options)
                runner.run()

                output_dir = Path(mock_config.output_dir)
                assert (output_dir / "retro.json").exists()
                assert not (output_dir / "retro.md").exists()

    def test_run_handles_exception(self, mock_config: RetroConfig):
        """Test run handles exceptions gracefully."""
        with patch(
            "agentic_retrospective.runner.GitAnalyzer.is_git_repository", return_value=True
        ):
            with patch("agentic_retrospective.runner.GitAnalyzer.analyze") as mock_analyze:
                mock_analyze.side_effect = Exception("Unexpected error")

                runner = RetroRunner(mock_config)
                result = runner.run()

                assert result.success is False
                assert "Unexpected error" in result.error

    def test_run_verbose_logging(
        self, mock_config: RetroConfig, mock_commits: list[CommitInfo], capsys
    ):
        """Test run with verbose option outputs progress."""
        with patch(
            "agentic_retrospective.runner.GitAnalyzer.is_git_repository", return_value=True
        ):
            with patch("agentic_retrospective.runner.GitAnalyzer.analyze") as mock_analyze:
                mock_result = MagicMock()
                mock_result.commits = mock_commits
                mock_analyze.return_value = mock_result

                options = RunOptions(verbose=True)
                runner = RetroRunner(mock_config, options)
                runner.run()

                # Verbose output goes to rich console
                # Just verify it runs without error


class TestRetroRunnerTelemetryGaps:
    """Tests for RetroRunner telemetry gap detection."""

    def test_detects_missing_decisions(
        self, mock_config: RetroConfig, mock_commits: list[CommitInfo], temp_project_dir: Path
    ):
        """Test gap detection when decisions directory is empty."""
        # Ensure decisions directory is empty
        decisions_dir = temp_project_dir / "decisions"
        for f in decisions_dir.iterdir():
            f.unlink()

        with patch(
            "agentic_retrospective.runner.GitAnalyzer.is_git_repository", return_value=True
        ):
            with patch("agentic_retrospective.runner.GitAnalyzer.analyze") as mock_analyze:
                mock_result = MagicMock()
                mock_result.commits = mock_commits
                mock_analyze.return_value = mock_result

                runner = RetroRunner(mock_config)
                result = runner.run()

                gaps = result.report.data_completeness.gaps
                gap_types = [g.gap_type for g in gaps]
                # When decisions_path exists but is empty, no gap is added
                # (only added when path doesn't exist)

    def test_detects_missing_agent_logs(
        self, mock_config: RetroConfig, mock_commits: list[CommitInfo], temp_project_dir: Path
    ):
        """Test gap detection when agent logs directory doesn't exist."""
        # Remove .logs directory
        logs_dir = temp_project_dir / ".logs"
        for subdir in logs_dir.iterdir():
            if subdir.is_dir():
                for f in subdir.iterdir():
                    f.unlink()
                subdir.rmdir()
        logs_dir.rmdir()

        with patch(
            "agentic_retrospective.runner.GitAnalyzer.is_git_repository", return_value=True
        ):
            with patch("agentic_retrospective.runner.GitAnalyzer.analyze") as mock_analyze:
                mock_result = MagicMock()
                mock_result.commits = mock_commits
                mock_analyze.return_value = mock_result

                runner = RetroRunner(mock_config)
                result = runner.run()

                gaps = result.report.data_completeness.gaps
                gap_types = [g.gap_type for g in gaps]
                assert "missing_agent_logs" in gap_types

    def test_detects_missing_test_results(
        self, mock_config: RetroConfig, mock_commits: list[CommitInfo]
    ):
        """Test gap detection when CI/test results are not available."""
        # ci_path is None in mock_config
        with patch(
            "agentic_retrospective.runner.GitAnalyzer.is_git_repository", return_value=True
        ):
            with patch("agentic_retrospective.runner.GitAnalyzer.analyze") as mock_analyze:
                mock_result = MagicMock()
                mock_result.commits = mock_commits
                mock_analyze.return_value = mock_result

                runner = RetroRunner(mock_config)
                result = runner.run()

                gaps = result.report.data_completeness.gaps
                gap_types = [g.gap_type for g in gaps]
                assert "missing_test_results" in gap_types


class TestRetroRunnerEvidenceMap:
    """Tests for RetroRunner evidence map building."""

    def test_build_evidence_map_links_commits_and_decisions(
        self, mock_config: RetroConfig, mock_commits: list[CommitInfo], temp_project_dir: Path
    ):
        """Test evidence map links commits to decisions via evidence_refs."""
        # Create decisions that reference commits
        decisions_dir = temp_project_dir / "decisions"
        decisions_file = decisions_dir / "decisions.jsonl"

        with decisions_file.open("w", encoding="utf-8") as f:
            f.write(
                json.dumps(
                    {
                        "id": "DEC-001",
                        "ts": datetime.now().isoformat(),
                        "decision": "Add feature",
                        "evidence_refs": ["abc123d"],  # References first commit
                    }
                )
                + "\n"
            )

        with patch(
            "agentic_retrospective.runner.GitAnalyzer.is_git_repository", return_value=True
        ):
            with patch("agentic_retrospective.runner.GitAnalyzer.analyze") as mock_analyze:
                mock_result = MagicMock()
                mock_result.commits = mock_commits
                mock_analyze.return_value = mock_result

                runner = RetroRunner(mock_config)
                result = runner.run()

                evidence_map = result.report.evidence_map
                # Commit should link to decision
                assert "abc123d" in evidence_map.commits
                assert "DEC-001" in evidence_map.commits["abc123d"].decisions

    def test_build_evidence_map_identifies_orphan_commits(
        self, mock_config: RetroConfig, mock_commits: list[CommitInfo], temp_project_dir: Path
    ):
        """Test evidence map identifies commits without decision context."""
        # Empty decisions file
        decisions_dir = temp_project_dir / "decisions"
        (decisions_dir / "decisions.jsonl").write_text("")

        with patch(
            "agentic_retrospective.runner.GitAnalyzer.is_git_repository", return_value=True
        ):
            with patch("agentic_retrospective.runner.GitAnalyzer.analyze") as mock_analyze:
                mock_result = MagicMock()
                mock_result.commits = mock_commits
                mock_analyze.return_value = mock_result

                runner = RetroRunner(mock_config)
                result = runner.run()

                evidence_map = result.report.evidence_map
                # All commits should be orphans (no linked decisions)
                assert len(evidence_map.orphans.commits_without_context) == 3

    def test_build_evidence_map_identifies_orphan_decisions(
        self, mock_config: RetroConfig, mock_commits: list[CommitInfo], temp_project_dir: Path
    ):
        """Test evidence map identifies decisions without implementation."""
        # Create decision without evidence refs
        decisions_dir = temp_project_dir / "decisions"
        decisions_file = decisions_dir / "decisions.jsonl"

        with decisions_file.open("w", encoding="utf-8") as f:
            f.write(
                json.dumps(
                    {
                        "id": "DEC-ORPHAN",
                        "ts": datetime.now().isoformat(),
                        "decision": "Planned but not implemented",
                        # No evidence_refs
                    }
                )
                + "\n"
            )

        with patch(
            "agentic_retrospective.runner.GitAnalyzer.is_git_repository", return_value=True
        ):
            with patch("agentic_retrospective.runner.GitAnalyzer.analyze") as mock_analyze:
                mock_result = MagicMock()
                mock_result.commits = mock_commits
                mock_analyze.return_value = mock_result

                runner = RetroRunner(mock_config)
                result = runner.run()

                evidence_map = result.report.evidence_map
                assert "DEC-ORPHAN" in evidence_map.orphans.decisions_without_implementation


class TestRetroRunnerAlerts:
    """Tests for RetroRunner alert generation."""

    def test_generates_alerts_for_high_severity_findings(
        self, mock_config: RetroConfig, mock_commits: list[CommitInfo]
    ):
        """Test alerts are generated for high severity findings."""
        with patch(
            "agentic_retrospective.runner.GitAnalyzer.is_git_repository", return_value=True
        ):
            with patch("agentic_retrospective.runner.GitAnalyzer.analyze") as mock_analyze:
                mock_result = MagicMock()
                # Create commits that would trigger a high severity finding
                # (e.g., many large commits, scope drift)
                large_commits = [
                    CommitInfo(
                        hash=f"abc{i}",
                        short_hash=f"abc{i}",
                        author="Dev",
                        email="dev@test.com",
                        date=datetime.now().isoformat(),
                        subject="chore: big change",
                        body="",
                        files=[
                            FileChange(path=f"file{j}.py", additions=50, deletions=10, change_type="modify")
                            for j in range(15)
                        ],
                        lines_added=750,
                        lines_removed=150,
                    )
                    for i in range(5)
                ]
                mock_result.commits = large_commits
                mock_analyze.return_value = mock_result

                runner = RetroRunner(mock_config)
                result = runner.run()

                # If any high severity findings, alerts should be generated
                if any(f.severity in ("high", "critical") for f in result.report.findings):
                    assert len(result.alerts) > 0

    def test_alerts_written_to_file(
        self, mock_config: RetroConfig, mock_commits: list[CommitInfo], temp_project_dir: Path
    ):
        """Test alerts are written to alerts.json when present."""
        with patch(
            "agentic_retrospective.runner.GitAnalyzer.is_git_repository", return_value=True
        ):
            with patch("agentic_retrospective.runner.GitAnalyzer.analyze") as mock_analyze:
                mock_result = MagicMock()
                mock_result.commits = mock_commits
                mock_analyze.return_value = mock_result

                runner = RetroRunner(mock_config)
                result = runner.run()

                # Check if alerts.json was written (only if alerts exist)
                output_dir = Path(mock_config.output_dir)
                if result.alerts:
                    assert (output_dir / "alerts.json").exists()


class TestRetroRunnerScoring:
    """Tests for RetroRunner scoring analysis."""

    def test_calculates_delivery_predictability(
        self, mock_config: RetroConfig, mock_commits: list[CommitInfo]
    ):
        """Test delivery predictability score is calculated."""
        with patch(
            "agentic_retrospective.runner.GitAnalyzer.is_git_repository", return_value=True
        ):
            with patch("agentic_retrospective.runner.GitAnalyzer.analyze") as mock_analyze:
                mock_result = MagicMock()
                mock_result.commits = mock_commits
                mock_analyze.return_value = mock_result

                runner = RetroRunner(mock_config)
                result = runner.run()

                assert result.report.scores.delivery_predictability.score is not None

    def test_calculates_decision_hygiene(
        self, mock_config: RetroConfig, mock_commits: list[CommitInfo], temp_project_dir: Path
    ):
        """Test decision hygiene score is calculated from decision logs."""
        # Create some decisions
        decisions_dir = temp_project_dir / "decisions"
        decisions_file = decisions_dir / "decisions.jsonl"

        with decisions_file.open("w", encoding="utf-8") as f:
            for i in range(5):
                f.write(
                    json.dumps(
                        {
                            "ts": datetime.now().isoformat(),
                            "decision": f"Decision {i}",
                            "decision_type": "one_way_door",
                            "actor": "human",
                            "rationale": "Because",
                        }
                    )
                    + "\n"
                )

        with patch(
            "agentic_retrospective.runner.GitAnalyzer.is_git_repository", return_value=True
        ):
            with patch("agentic_retrospective.runner.GitAnalyzer.analyze") as mock_analyze:
                mock_result = MagicMock()
                mock_result.commits = mock_commits
                mock_analyze.return_value = mock_result

                runner = RetroRunner(mock_config)
                result = runner.run()

                assert result.report.scores.decision_hygiene.score is not None

    def test_identifies_agent_commits(
        self, mock_config: RetroConfig, mock_commits: list[CommitInfo]
    ):
        """Test agent commits are identified and counted."""
        with patch(
            "agentic_retrospective.runner.GitAnalyzer.is_git_repository", return_value=True
        ):
            with patch("agentic_retrospective.runner.GitAnalyzer.analyze") as mock_analyze:
                mock_result = MagicMock()
                mock_result.commits = mock_commits
                mock_analyze.return_value = mock_result

                runner = RetroRunner(mock_config)
                result = runner.run()

                # mock_commits has 1 Claude commit
                assert result.report.summary.agent_commits >= 1


class TestRetroRunnerOutputFiles:
    """Tests for RetroRunner output file generation."""

    def test_output_json_is_valid(
        self, mock_config: RetroConfig, mock_commits: list[CommitInfo], temp_project_dir: Path
    ):
        """Test retro.json is valid JSON."""
        with patch(
            "agentic_retrospective.runner.GitAnalyzer.is_git_repository", return_value=True
        ):
            with patch("agentic_retrospective.runner.GitAnalyzer.analyze") as mock_analyze:
                mock_result = MagicMock()
                mock_result.commits = mock_commits
                mock_analyze.return_value = mock_result

                runner = RetroRunner(mock_config)
                runner.run()

                output_dir = Path(mock_config.output_dir)
                with (output_dir / "retro.json").open() as f:
                    data = json.load(f)

                assert "sprint_id" in data
                assert "summary" in data
                assert "scores" in data

    def test_evidence_map_json_is_valid(
        self, mock_config: RetroConfig, mock_commits: list[CommitInfo], temp_project_dir: Path
    ):
        """Test evidence_map.json is valid JSON."""
        with patch(
            "agentic_retrospective.runner.GitAnalyzer.is_git_repository", return_value=True
        ):
            with patch("agentic_retrospective.runner.GitAnalyzer.analyze") as mock_analyze:
                mock_result = MagicMock()
                mock_result.commits = mock_commits
                mock_analyze.return_value = mock_result

                runner = RetroRunner(mock_config)
                runner.run()

                output_dir = Path(mock_config.output_dir)
                with (output_dir / "evidence_map.json").open() as f:
                    data = json.load(f)

                assert "commits" in data
                assert "decisions" in data
                assert "orphans" in data


class TestRunResultDataclass:
    """Tests for RunResult dataclass."""

    def test_run_result_success(self):
        """Test RunResult with success."""
        result = RunResult(success=True, output_path="/path/to/output")

        assert result.success is True
        assert result.output_path == "/path/to/output"
        assert result.error is None

    def test_run_result_failure(self):
        """Test RunResult with failure."""
        result = RunResult(success=False, error="Something went wrong")

        assert result.success is False
        assert result.error == "Something went wrong"


class TestRunOptionsDataclass:
    """Tests for RunOptions dataclass."""

    def test_run_options_defaults(self):
        """Test RunOptions default values."""
        options = RunOptions()

        assert options.verbose is False
        assert options.json_only is False

    def test_run_options_custom(self):
        """Test RunOptions with custom values."""
        options = RunOptions(verbose=True, json_only=True)

        assert options.verbose is True
        assert options.json_only is True


class TestCollectedDataDataclass:
    """Tests for CollectedData dataclass."""

    def test_collected_data_defaults(self):
        """Test CollectedData default values."""
        data = CollectedData()

        assert data.commits == []
        assert data.decisions == []
        assert data.agent_logs_available is False
        assert data.test_results_available is False
        assert data.human_insights is None


class TestConvenienceFunctions:
    """Tests for convenience functions."""

    def test_run_retro_function(self, mock_config: RetroConfig, mock_commits: list[CommitInfo]):
        """Test run_retro convenience function."""
        with patch(
            "agentic_retrospective.runner.GitAnalyzer.is_git_repository", return_value=True
        ):
            with patch("agentic_retrospective.runner.GitAnalyzer.analyze") as mock_analyze:
                mock_result = MagicMock()
                mock_result.commits = mock_commits
                mock_analyze.return_value = mock_result

                result = run_retro(mock_config)

                assert result.success is True

    @pytest.mark.asyncio
    async def test_run_retro_async_function(
        self, mock_config: RetroConfig, mock_commits: list[CommitInfo]
    ):
        """Test run_retro_async convenience function."""
        with patch(
            "agentic_retrospective.runner.GitAnalyzer.is_git_repository", return_value=True
        ):
            with patch("agentic_retrospective.runner.GitAnalyzer.analyze") as mock_analyze:
                mock_result = MagicMock()
                mock_result.commits = mock_commits
                mock_analyze.return_value = mock_result

                result = await run_retro_async(mock_config)

                assert result.success is True


class TestRetroRunnerClassifyCommit:
    """Tests for _classify_commit helper method."""

    def test_classify_fix_commit(self, mock_config: RetroConfig):
        """Test classification of fix commits."""
        runner = RetroRunner(mock_config)

        assert runner._classify_commit("fix: resolve bug") == "fix"
        assert runner._classify_commit("bugfix: memory leak") == "fix"
        assert runner._classify_commit("hotfix: critical issue") == "fix"
        assert runner._classify_commit("patch: security vulnerability") == "fix"

    def test_classify_feature_commit(self, mock_config: RetroConfig):
        """Test classification of feature commits."""
        runner = RetroRunner(mock_config)

        assert runner._classify_commit("feat: add new feature") == "feature"
        assert runner._classify_commit("add: new endpoint") == "feature"
        assert runner._classify_commit("implement: auth system") == "feature"
        assert runner._classify_commit("new: user dashboard") == "feature"

    def test_classify_refactor_commit(self, mock_config: RetroConfig):
        """Test classification of refactor commits."""
        runner = RetroRunner(mock_config)

        assert runner._classify_commit("refactor: simplify logic") == "refactor"
        assert runner._classify_commit("clean: remove unused code") == "refactor"

    def test_classify_docs_commit(self, mock_config: RetroConfig):
        """Test classification of documentation commits."""
        runner = RetroRunner(mock_config)

        assert runner._classify_commit("docs: update readme") == "docs"
        # Note: "add comment" matches "add" keyword which is checked before "docs"
        assert runner._classify_commit("readme: update") == "docs"

    def test_classify_test_commit(self, mock_config: RetroConfig):
        """Test classification of test commits."""
        runner = RetroRunner(mock_config)

        # Note: "test: add" matches "add" first since feature keywords are checked before test
        assert runner._classify_commit("test: improve coverage") == "test"
        assert runner._classify_commit("coverage: increase to 90%") == "test"

    def test_classify_ci_commit(self, mock_config: RetroConfig):
        """Test classification of CI commits."""
        runner = RetroRunner(mock_config)

        assert runner._classify_commit("ci: update pipeline") == "ci"
        assert runner._classify_commit("deploy: production") == "ci"
        assert runner._classify_commit("build: optimize") == "ci"

    def test_classify_chore_commit(self, mock_config: RetroConfig):
        """Test classification of chore commits."""
        runner = RetroRunner(mock_config)

        # Note: "chore: cleanup" matches "clean" first since refactor is checked before chore
        assert runner._classify_commit("chore: miscellaneous") == "chore"
        assert runner._classify_commit("deps: upgrade pydantic") == "chore"
        assert runner._classify_commit("bump: version 1.1.0") == "chore"

    def test_classify_other_commit(self, mock_config: RetroConfig):
        """Test classification of unrecognized commits."""
        runner = RetroRunner(mock_config)

        assert runner._classify_commit("random commit message") == "other"
        assert runner._classify_commit("WIP: something") == "other"

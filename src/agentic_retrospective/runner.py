"""Runner orchestration for agentic retrospectives.

This module provides the main orchestration for running retrospective analysis.
It coordinates all analyzers, scoring functions, and report generation to
produce comprehensive retrospective reports.
"""

from __future__ import annotations

import json
import os
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

from rich.console import Console

from .analyzers import DecisionAnalyzer, GitAnalyzer, HumanInsightsAnalyzer
from .models import (
    ActionItem,
    Alert,
    AlertsOutput,
    CommitEvidence,
    CommitInfo,
    DataCompleteness,
    DataSources,
    DecisionEvidence,
    DecisionRecord,
    EvidenceMap,
    Finding,
    FixToFeatureRatio,
    HumanInsights,
    Orphans,
    Period,
    ReportMetadata,
    RetroConfig,
    RetroReport,
    Risk,
    Score,
    Scores,
    SprintSummary,
    TelemetryGap,
    Win,
)
from .scoring import (
    CollaborationEfficiencyData,
    DecisionHygieneData,
    DeliveryPredictabilityData,
    QualityMaintainabilityData,
    SecurityPostureData,
    TestLoopCompletenessData,
    score_collaboration_efficiency,
    score_decision_hygiene,
    score_delivery_predictability,
    score_quality_maintainability,
    score_security_posture,
    score_test_loop_completeness,
)

# Package version
__version__ = "0.1.0"
SCHEMA_VERSION = "1.0.0"

# Console for verbose output
console = Console()


@dataclass
class RunOptions:
    """Options for running a retrospective.

    Attributes:
        verbose: Enable verbose logging output.
        json_only: Only output JSON, no markdown report.
    """

    verbose: bool = False
    json_only: bool = False


@dataclass
class RunResult:
    """Result of running a retrospective.

    Attributes:
        success: Whether the retrospective completed successfully.
        output_path: Path to the output directory.
        report: The generated retrospective report.
        alerts: List of alerts for critical issues.
        error: Error message if the run failed.
    """

    success: bool
    output_path: str | None = None
    report: RetroReport | None = None
    alerts: list[Alert] = field(default_factory=list)
    error: str | None = None


@dataclass
class CollectedData:
    """Data collected for retrospective analysis.

    Attributes:
        commits: List of git commits.
        decisions: List of decision records.
        agent_logs_available: Whether agent logs are available.
        test_results_available: Whether test results are available.
        human_insights: Human insights analysis results.
        prompt_count: Number of prompts logged.
        tool_count: Number of tool calls logged.
        fix_to_feature_ratio: Ratio of fix to feature commits.
    """

    commits: list[CommitInfo] = field(default_factory=list)
    decisions: list[DecisionRecord] = field(default_factory=list)
    agent_logs_available: bool = False
    test_results_available: bool = False
    human_insights: HumanInsights | None = None
    prompt_count: int = 0
    tool_count: int = 0
    fix_to_feature_ratio: FixToFeatureRatio | None = None


class RetroRunner:
    """Main runner for agentic retrospectives.

    Orchestrates the entire retrospective process:
    1. Validates the environment (git repo check)
    2. Collects data from all sources
    3. Builds evidence map linking commits and decisions
    4. Analyzes sprint using scoring rubrics
    5. Generates the report
    6. Writes output files

    Attributes:
        config: Configuration for the retrospective.
        options: Run options for output control.
    """

    def __init__(self, config: RetroConfig, options: RunOptions | None = None) -> None:
        """Initialize the runner.

        Args:
            config: Configuration for the retrospective.
            options: Run options. Defaults to RunOptions().
        """
        self.config = config
        self.options = options or RunOptions()
        self._gaps: list[TelemetryGap] = []
        self._findings: list[Finding] = []

    def run(self) -> RunResult:
        """Execute the full retrospective analysis.

        Returns:
            RunResult containing success status, report, and any alerts.
        """
        try:
            # Phase 0: Validate environment
            if self.options.verbose:
                console.print("[bold blue]Phase 0:[/bold blue] Validating environment...")

            git_analyzer = GitAnalyzer()
            if not git_analyzer.is_git_repository():
                return RunResult(
                    success=False,
                    error="Not inside a git repository. Run from a git project directory.",
                )

            # Phase 1: Collect data
            if self.options.verbose:
                console.print("[bold blue]Phase 1:[/bold blue] Collecting data...")

            collected_data = self._collect_data(git_analyzer)

            # Phase 2: Build evidence map
            if self.options.verbose:
                console.print("[bold blue]Phase 2:[/bold blue] Building evidence map...")

            evidence_map = self._build_evidence_map(
                collected_data.commits, collected_data.decisions
            )

            # Phase 3: Analyze sprint
            if self.options.verbose:
                console.print("[bold blue]Phase 3:[/bold blue] Analyzing sprint...")

            scores = self._analyze_sprint(collected_data)

            # Phase 4: Generate report
            if self.options.verbose:
                console.print("[bold blue]Phase 4:[/bold blue] Generating report...")

            report = self._generate_report(collected_data, scores, evidence_map)

            # Phase 5: Write outputs
            if self.options.verbose:
                console.print("[bold blue]Phase 5:[/bold blue] Writing outputs...")

            self._write_outputs(report)

            # Generate alerts
            alerts = self._generate_alerts(report)

            return RunResult(
                success=True,
                output_path=self.config.output_dir,
                report=report,
                alerts=alerts,
            )

        except Exception as e:
            return RunResult(
                success=False,
                error=f"Retrospective failed: {e!s}",
            )

    def _collect_data(self, git_analyzer: GitAnalyzer) -> CollectedData:
        """Collect data from all sources.

        Args:
            git_analyzer: GitAnalyzer instance for git data.

        Returns:
            CollectedData containing all collected information.
        """
        # Collect git data
        git_result = git_analyzer.analyze(self.config.from_ref, self.config.to_ref)
        commits = git_result.commits

        if self.options.verbose:
            console.print(f"  Found {len(commits)} commits")

        # Collect decision data
        decisions: list[DecisionRecord] = []
        decisions_path = Path(self.config.decisions_path)
        if decisions_path.exists():
            decision_analyzer = DecisionAnalyzer(decisions_path)
            decision_result = decision_analyzer.analyze()
            decisions = decision_result.records

            if self.options.verbose:
                console.print(f"  Found {len(decisions)} decisions")
        else:
            self._add_telemetry_gap(
                TelemetryGap(
                    gap_type="missing_decisions",
                    severity="medium",
                    impact="Cannot analyze decision quality or escalation patterns",
                    recommendation="Use `agentic-retro decision` to log decisions",
                )
            )

        # Check agent logs availability
        agent_logs_path = Path(self.config.agent_logs_path)
        agent_logs_available = agent_logs_path.exists()
        prompt_count = 0
        tool_count = 0

        if agent_logs_available:
            # Count prompts
            prompts_path = agent_logs_path / "prompts"
            if prompts_path.exists():
                prompt_count = self._count_jsonl_entries(prompts_path)
                if self.options.verbose:
                    console.print(f"  Found {prompt_count} prompts")

            # Count tool calls
            tools_path = agent_logs_path / "tools"
            if tools_path.exists():
                tool_count = self._count_jsonl_entries(tools_path)
                if self.options.verbose:
                    console.print(f"  Found {tool_count} tool calls")

            # Check Claude watch hook status
            self._check_claude_watch_status(agent_logs_path)
            self._check_data_freshness(agent_logs_path)
        else:
            self._add_telemetry_gap(
                TelemetryGap(
                    gap_type="missing_agent_logs",
                    severity="high",
                    impact="Cannot analyze agent behavior or collaboration patterns",
                    recommendation="Run `agentic-retro setup` to enable telemetry hooks",
                )
            )

        # Collect human insights
        human_insights: HumanInsights | None = None
        if agent_logs_available:
            insights_analyzer = HumanInsightsAnalyzer(agent_logs_path)
            if insights_analyzer.has_data():
                human_insights = insights_analyzer.analyze()
                if self.options.verbose:
                    console.print("  Analyzed human interaction patterns")

        # Calculate fix-to-feature ratio
        fix_to_feature_ratio: FixToFeatureRatio | None = None
        if commits:
            fix_to_feature_ratio = HumanInsightsAnalyzer.calculate_fix_to_feature_ratio(
                commits
            )
            if self.options.verbose:
                console.print(
                    f"  Fix-to-feature ratio: {fix_to_feature_ratio.ratio:.2f}"
                )

        # Check test results availability
        test_results_available = False
        if self.config.ci_path:
            ci_path = Path(self.config.ci_path)
            test_results_available = ci_path.exists()

        if not test_results_available:
            self._add_telemetry_gap(
                TelemetryGap(
                    gap_type="missing_test_results",
                    severity="medium",
                    impact="Cannot assess test loop completeness with high confidence",
                    recommendation="Configure CI path to include test result artifacts",
                )
            )

        return CollectedData(
            commits=commits,
            decisions=decisions,
            agent_logs_available=agent_logs_available,
            test_results_available=test_results_available,
            human_insights=human_insights,
            prompt_count=prompt_count,
            tool_count=tool_count,
            fix_to_feature_ratio=fix_to_feature_ratio,
        )

    def _build_evidence_map(
        self, commits: list[CommitInfo], decisions: list[DecisionRecord]
    ) -> EvidenceMap:
        """Build an evidence map linking commits, decisions, and findings.

        Args:
            commits: List of commits to index.
            decisions: List of decisions to link.

        Returns:
            EvidenceMap with linked commits and decisions.
        """
        commit_evidence: dict[str, CommitEvidence] = {}
        decision_evidence: dict[str, DecisionEvidence] = {}
        commits_without_context: list[str] = []
        decisions_without_implementation: list[str] = []

        # Build decision lookup by evidence_refs
        decision_by_ref: dict[str, list[str]] = {}
        for decision in decisions:
            decision_id = decision.id or decision.ts
            if decision.evidence_refs:
                for ref in decision.evidence_refs:
                    if ref not in decision_by_ref:
                        decision_by_ref[ref] = []
                    decision_by_ref[ref].append(decision_id)

        # Index commits
        for commit in commits:
            short_hash = commit.short_hash
            linked_decisions: list[str] = []

            # Check if any decisions reference this commit
            if short_hash in decision_by_ref:
                linked_decisions = decision_by_ref[short_hash]
            if commit.hash in decision_by_ref:
                linked_decisions.extend(decision_by_ref[commit.hash])

            # Classify commit category based on subject
            category = self._classify_commit(commit.subject)

            commit_evidence[short_hash] = CommitEvidence(
                decisions=linked_decisions,
                findings=[],
                category=category,
            )

            # Track orphan commits (no context from decisions)
            if not linked_decisions:
                commits_without_context.append(short_hash)

        # Index decisions
        for decision in decisions:
            decision_id = decision.id or decision.ts
            linked_commits: list[str] = []

            # Find commits linked to this decision
            if decision.evidence_refs:
                for ref in decision.evidence_refs:
                    # Check if ref matches any commit hash
                    for commit in commits:
                        if ref in (commit.short_hash, commit.hash):
                            linked_commits.append(commit.short_hash)

            decision_evidence[decision_id] = DecisionEvidence(
                commits=linked_commits,
                type=decision.decision_type or "unknown",
                escalated=decision.actor == "human",
                category=decision.category or "other",
            )

            # Track orphan decisions (no implementation evidence)
            if not linked_commits:
                decisions_without_implementation.append(decision_id)

        return EvidenceMap(
            commits=commit_evidence,
            decisions=decision_evidence,
            orphans=Orphans(
                commits_without_context=commits_without_context,
                decisions_without_implementation=decisions_without_implementation,
            ),
        )

    def _analyze_sprint(self, data: CollectedData) -> Scores:
        """Analyze the sprint and generate scores.

        Args:
            data: Collected data for analysis.

        Returns:
            Scores for all dimensions.
        """
        # Calculate average commit size
        avg_commit_size = 0.0
        if data.commits:
            total_changes = sum(
                c.lines_added + c.lines_removed for c in data.commits
            )
            avg_commit_size = total_changes / len(data.commits)

        # Detect scope drift incidents (commits with multiple unrelated changes)
        scope_drift_incidents = sum(
            1 for c in data.commits if len(c.files) > 10 and c.lines_added > 500
        )

        # Score delivery predictability
        delivery_data = DeliveryPredictabilityData(
            commit_count=len(data.commits),
            avg_commit_size=avg_commit_size,
            scope_drift_incidents=scope_drift_incidents,
        )
        delivery_score = score_delivery_predictability(delivery_data)

        # Count test-related commits
        test_related_commits = sum(
            1
            for c in data.commits
            if "test" in c.subject.lower()
            or any("test" in f.path.lower() for f in c.files)
        )

        # Score test loop completeness
        test_data = TestLoopCompletenessData(
            has_test_results=data.test_results_available,
            pass_rate=None,  # Would need CI integration
            test_related_commits=test_related_commits,
            human_debug_events=None,  # Would need log analysis
        )
        test_score = score_test_loop_completeness(test_data)

        # Count large commits and doc commits
        large_commit_count = sum(
            1 for c in data.commits if c.lines_added + c.lines_removed > 500
        )
        docs_commit_count = sum(
            1
            for c in data.commits
            if "doc" in c.subject.lower()
            or any(".md" in f.path.lower() for f in c.files)
        )

        # Score quality/maintainability
        quality_data = QualityMaintainabilityData(
            commit_count=len(data.commits),
            large_commit_count=large_commit_count,
            docs_commit_count=docs_commit_count,
            test_commit_count=test_related_commits,
        )
        quality_score = score_quality_maintainability(quality_data)

        # Score security posture (limited without CI integration)
        security_decisions = sum(
            1 for d in data.decisions if d.category == "security"
        )
        security_data = SecurityPostureData(
            has_security_scans=False,  # Would need CI integration
            new_deps_count=None,
            security_decisions_logged=security_decisions,
            vulnerabilities_found=None,
        )
        security_score = score_security_posture(security_data)

        # Count agent commits (look for common agent patterns)
        agent_commit_count = sum(
            1
            for c in data.commits
            if "claude" in c.author.lower()
            or "copilot" in c.author.lower()
            or "bot" in c.author.lower()
            or "[bot]" in c.email.lower()
        )

        # Score collaboration efficiency
        collab_data = CollaborationEfficiencyData(
            has_agent_logs=data.agent_logs_available,
            agent_commit_count=agent_commit_count,
            human_interrupts=None,  # Would need prompt analysis
            scope_drift_incidents=scope_drift_incidents,
        )
        collab_score = score_collaboration_efficiency(collab_data)

        # Analyze decision hygiene
        one_way_doors = sum(
            1 for d in data.decisions if d.decision_type == "one_way_door"
        )
        escalated = sum(
            1
            for d in data.decisions
            if d.decision_type == "one_way_door" and d.actor == "human"
        )
        missing_rationale = sum(
            1 for d in data.decisions if not d.rationale and not d.reasoning
        )

        decision_data = DecisionHygieneData(
            has_decision_logs=len(data.decisions) > 0,
            total_decisions=len(data.decisions),
            one_way_door_count=one_way_doors,
            escalated_count=escalated,
            missing_rationale=missing_rationale,
        )
        decision_score = score_decision_hygiene(decision_data)

        # Convert rubric Scores to model Scores
        return Scores(
            delivery_predictability=self._convert_score(delivery_score),
            test_loop_completeness=self._convert_score(test_score),
            quality_maintainability=self._convert_score(quality_score),
            security_posture=self._convert_score(security_score),
            collaboration_efficiency=self._convert_score(collab_score),
            decision_hygiene=self._convert_score(decision_score),
        )

    def _convert_score(self, rubric_score: Any) -> Score:
        """Convert a rubric score to a model Score.

        Args:
            rubric_score: Score from scoring.rubrics module.

        Returns:
            Score model instance.
        """
        return Score(
            score=float(rubric_score.score) if rubric_score.score is not None else None,
            confidence=rubric_score.confidence.value,
            evidence=rubric_score.evidence,
            details=rubric_score.details,
        )

    def _generate_report(
        self, data: CollectedData, scores: Scores, evidence_map: EvidenceMap
    ) -> RetroReport:
        """Generate the complete retrospective report.

        Args:
            data: Collected data.
            scores: Calculated scores.
            evidence_map: Evidence linking map.

        Returns:
            Complete RetroReport.
        """
        # Calculate summary statistics
        contributors = {c.author for c in data.commits}
        agent_commits = sum(
            1
            for c in data.commits
            if "claude" in c.author.lower()
            or "copilot" in c.author.lower()
            or "bot" in c.author.lower()
        )
        human_contributors = len(
            [
                a
                for a in contributors
                if "claude" not in a.lower()
                and "copilot" not in a.lower()
                and "bot" not in a.lower()
            ]
        )
        agent_contributors = len(contributors) - human_contributors

        summary = SprintSummary(
            commits=len(data.commits),
            contributors=len(contributors),
            human_contributors=human_contributors,
            agent_contributors=agent_contributors,
            lines_added=sum(c.lines_added for c in data.commits),
            lines_removed=sum(c.lines_removed for c in data.commits),
            decisions_logged=len(data.decisions),
            agent_commits=agent_commits,
            agent_commit_percentage=(
                (agent_commits / len(data.commits) * 100) if data.commits else 0.0
            ),
        )

        # Calculate data completeness
        sources = DataSources(
            git=True,
            decisions=len(data.decisions) > 0,
            agent_logs=data.agent_logs_available,
            ci=self.config.ci_path is not None,
            tests=data.test_results_available,
        )

        # Calculate completeness percentage
        source_weights = {
            "git": 25,
            "decisions": 20,
            "agent_logs": 30,
            "ci": 15,
            "tests": 10,
        }
        completeness_score = sum(
            source_weights[k] for k, v in sources.model_dump().items() if v
        )

        data_completeness = DataCompleteness(
            percentage=completeness_score,
            sources=sources,
            gaps=self._gaps,
        )

        # Generate findings from analysis
        findings = self._generate_findings(data, scores, evidence_map)

        # Generate wins
        wins = self._generate_wins(data, scores)

        # Generate risks
        risks = self._generate_risks(data, scores)

        # Generate action items
        action_items = self._generate_action_items(findings, risks)

        # Calculate period
        if data.commits:
            dates = [c.date for c in data.commits]
            from_date = min(dates)
            to_date = max(dates)
        else:
            now = datetime.now()
            to_date = now.isoformat()
            from_date = (now - timedelta(days=14)).isoformat()

        period = Period(**{"from": from_date, "to": to_date})

        return RetroReport(
            sprint_id=self.config.sprint_id,
            period=period,
            generated_at=datetime.now().isoformat(),
            data_completeness=data_completeness,
            summary=summary,
            scores=scores,
            findings=findings,
            wins=wins,
            risks=risks,
            action_items=action_items,
            evidence_map=evidence_map,
            human_insights=data.human_insights,
            fix_to_feature_ratio=data.fix_to_feature_ratio,
            metadata=ReportMetadata(
                tool_version=__version__,
                schema_version=SCHEMA_VERSION,
                generated_by="agentic-retrospective",
            ),
        )

    def _generate_findings(
        self, data: CollectedData, scores: Scores, evidence_map: EvidenceMap
    ) -> list[Finding]:
        """Generate findings based on analysis.

        Args:
            data: Collected data.
            scores: Calculated scores.
            evidence_map: Evidence map.

        Returns:
            List of findings.
        """
        findings: list[Finding] = []

        # Check for orphan commits (scope drift indicator)
        orphan_commit_count = len(evidence_map.orphans.commits_without_context)
        if orphan_commit_count > len(data.commits) * 0.3 and orphan_commit_count >= 3:
            findings.append(
                Finding(
                    id=f"F-{uuid.uuid4().hex[:8]}",
                    severity="medium",
                    category="scope_drift",
                    title="High number of commits without decision context",
                    summary=(
                        f"{orphan_commit_count} commits ({orphan_commit_count / len(data.commits) * 100:.0f}%) "
                        "have no linked decisions"
                    ),
                    evidence=evidence_map.orphans.commits_without_context[:5],
                    confidence="medium",
                    impact="May indicate ad-hoc work or missing decision documentation",
                    recommendation="Ensure significant changes are preceded by logged decisions",
                )
            )

        # Check for orphan decisions (planning without execution)
        orphan_decision_count = len(evidence_map.orphans.decisions_without_implementation)
        if orphan_decision_count >= 3:
            findings.append(
                Finding(
                    id=f"F-{uuid.uuid4().hex[:8]}",
                    severity="low",
                    category="decision_gap",
                    title="Decisions without implementation evidence",
                    summary=(
                        f"{orphan_decision_count} decisions have no linked commits"
                    ),
                    evidence=evidence_map.orphans.decisions_without_implementation[:5],
                    confidence="medium",
                    impact="May indicate incomplete work or missing evidence links",
                    recommendation="Link decisions to implementing commits via evidence_refs",
                )
            )

        # Check for low scores
        if scores.decision_hygiene.score is not None and scores.decision_hygiene.score <= 2:
            findings.append(
                Finding(
                    id=f"F-{uuid.uuid4().hex[:8]}",
                    severity="high",
                    category="decision_gap",
                    title="Poor decision documentation hygiene",
                    summary="Decision logging quality is below acceptable threshold",
                    evidence=scores.decision_hygiene.evidence,
                    confidence=scores.decision_hygiene.confidence,
                    impact="Critical decisions may be made without proper review",
                    recommendation="Establish decision logging as part of workflow",
                )
            )

        # Check fix-to-feature ratio
        if data.fix_to_feature_ratio and not data.fix_to_feature_ratio.is_healthy:
            findings.append(
                Finding(
                    id=f"F-{uuid.uuid4().hex[:8]}",
                    severity="medium",
                    category="quality",
                    title="Unhealthy fix-to-feature ratio",
                    summary=(
                        f"Fix commits ({data.fix_to_feature_ratio.fix_commits}) exceed "
                        f"{data.fix_to_feature_ratio.threshold * 100:.0f}% of feature commits "
                        f"({data.fix_to_feature_ratio.feature_commits})"
                    ),
                    evidence=[
                        f"Ratio: {data.fix_to_feature_ratio.ratio:.2f}",
                        f"Threshold: {data.fix_to_feature_ratio.threshold}",
                    ],
                    confidence="high",
                    impact="High rework indicates quality issues in initial implementation",
                    recommendation="Improve upfront specifications and review processes",
                )
            )

        # Add telemetry gap findings
        for gap in self._gaps:
            findings.append(
                Finding(
                    id=f"F-{uuid.uuid4().hex[:8]}",
                    severity=gap.severity if gap.severity != "high" else "medium",
                    category="telemetry_gap",
                    title=f"Missing telemetry: {gap.gap_type.replace('_', ' ')}",
                    summary=gap.impact,
                    evidence=[],
                    confidence="high",
                    impact=gap.impact,
                    recommendation=gap.recommendation,
                )
            )

        return findings

    def _generate_wins(self, data: CollectedData, scores: Scores) -> list[Win]:
        """Generate wins/successes from the analysis.

        Args:
            data: Collected data.
            scores: Calculated scores.

        Returns:
            List of wins.
        """
        wins: list[Win] = []

        # High delivery predictability
        if (
            scores.delivery_predictability.score is not None
            and scores.delivery_predictability.score >= 4
        ):
            wins.append(
                Win(
                    title="Strong delivery predictability",
                    description="Commits are well-sized and consistent",
                    evidence=scores.delivery_predictability.evidence,
                )
            )

        # Good decision hygiene
        if (
            scores.decision_hygiene.score is not None
            and scores.decision_hygiene.score >= 4
        ):
            wins.append(
                Win(
                    title="Excellent decision documentation",
                    description="Decisions are well-documented with proper escalation",
                    evidence=scores.decision_hygiene.evidence,
                )
            )

        # Healthy fix-to-feature ratio
        if data.fix_to_feature_ratio and data.fix_to_feature_ratio.is_healthy:
            wins.append(
                Win(
                    title="Healthy fix-to-feature ratio",
                    description="Low rework indicates good initial quality",
                    evidence=[
                        f"Ratio: {data.fix_to_feature_ratio.ratio:.2f}",
                        f"Below threshold: {data.fix_to_feature_ratio.threshold}",
                    ],
                )
            )

        # Good test coverage
        if (
            scores.test_loop_completeness.score is not None
            and scores.test_loop_completeness.score >= 4
        ):
            wins.append(
                Win(
                    title="Strong test loop",
                    description="Good test coverage and pass rates",
                    evidence=scores.test_loop_completeness.evidence,
                )
            )

        # Add human insights successes
        if data.human_insights and data.human_insights.top_successes:
            for success in data.human_insights.top_successes[:2]:
                wins.append(
                    Win(
                        title="Human feedback: What worked well",
                        description=success,
                        evidence=[],
                    )
                )

        return wins

    def _generate_risks(self, data: CollectedData, scores: Scores) -> list[Risk]:
        """Generate risks from the analysis.

        Args:
            data: Collected data.
            scores: Calculated scores.

        Returns:
            List of risks.
        """
        risks: list[Risk] = []

        # Low security score
        if (
            scores.security_posture.score is not None
            and scores.security_posture.score <= 2
        ):
            risks.append(
                Risk(
                    title="Weak security posture",
                    description="Limited security scanning and vulnerability management",
                    evidence=scores.security_posture.evidence,
                    mitigation="Implement security scans in CI pipeline",
                )
            )

        # Low collaboration efficiency
        if (
            scores.collaboration_efficiency.score is not None
            and scores.collaboration_efficiency.score <= 2
        ):
            risks.append(
                Risk(
                    title="Collaboration inefficiency",
                    description="Human-agent collaboration needs improvement",
                    evidence=scores.collaboration_efficiency.evidence,
                    mitigation="Review and optimize agent prompting patterns",
                )
            )

        # Missing agent logs
        if not data.agent_logs_available:
            risks.append(
                Risk(
                    title="Limited observability",
                    description="Agent telemetry is not being captured",
                    evidence=["No agent logs found in .logs directory"],
                    mitigation="Run `agentic-retro setup` to enable telemetry",
                )
            )

        return risks

    def _generate_action_items(
        self, findings: list[Finding], risks: list[Risk]
    ) -> list[ActionItem]:
        """Generate prioritized action items.

        Args:
            findings: List of findings.
            risks: List of risks.

        Returns:
            Prioritized list of action items.
        """
        action_items: list[ActionItem] = []
        item_id = 1

        # Generate actions from critical/high findings
        for finding in findings:
            if finding.severity in ("critical", "high"):
                priority = "must_do" if finding.severity == "critical" else "next_sprint"
                action_items.append(
                    ActionItem(
                        id=f"A-{item_id:03d}",
                        priority=priority,
                        action=finding.recommendation or f"Address: {finding.title}",
                        rationale=finding.summary,
                        owner=None,
                        success_metric=f"Finding {finding.id} resolved",
                        effort=3,
                        impact=4 if finding.severity == "critical" else 3,
                        risk_reduction=4,
                    )
                )
                item_id += 1

        # Generate actions from risks
        for risk in risks:
            action_items.append(
                ActionItem(
                    id=f"A-{item_id:03d}",
                    priority="next_sprint",
                    action=risk.mitigation,
                    rationale=risk.description,
                    owner=None,
                    success_metric=f"Risk '{risk.title}' mitigated",
                    effort=3,
                    impact=3,
                    risk_reduction=4,
                )
            )
            item_id += 1

        # Generate actions from medium findings
        for finding in findings:
            if finding.severity == "medium":
                action_items.append(
                    ActionItem(
                        id=f"A-{item_id:03d}",
                        priority="backlog",
                        action=finding.recommendation or f"Address: {finding.title}",
                        rationale=finding.summary,
                        owner=None,
                        success_metric=f"Finding {finding.id} resolved",
                        effort=2,
                        impact=2,
                        risk_reduction=2,
                    )
                )
                item_id += 1

        return action_items

    def _generate_alerts(self, report: RetroReport) -> list[Alert]:
        """Generate alerts for critical/high issues.

        Args:
            report: The generated report.

        Returns:
            List of alerts.
        """
        alerts: list[Alert] = []

        for finding in report.findings:
            if finding.severity in ("critical", "high"):
                alerts.append(
                    Alert(
                        id=f"ALERT-{finding.id}",
                        severity=finding.severity,
                        type=finding.category,
                        title=finding.title,
                        description=finding.summary,
                        evidence=finding.evidence,
                        recommended_action=finding.recommendation or "Review and address this finding",
                    )
                )

        return alerts

    def _write_outputs(self, report: RetroReport) -> None:
        """Write output files.

        Args:
            report: The report to write.
        """
        output_dir = Path(self.config.output_dir)
        output_dir.mkdir(parents=True, exist_ok=True)

        # Write retro.json
        retro_json_path = output_dir / "retro.json"
        with retro_json_path.open("w", encoding="utf-8") as f:
            json.dump(report.model_dump(by_alias=True), f, indent=2, default=str)

        if self.options.verbose:
            console.print(f"  Wrote {retro_json_path}")

        # Write evidence_map.json
        evidence_map_path = output_dir / "evidence_map.json"
        with evidence_map_path.open("w", encoding="utf-8") as f:
            json.dump(report.evidence_map.model_dump(), f, indent=2)

        if self.options.verbose:
            console.print(f"  Wrote {evidence_map_path}")

        # Write alerts.json if there are alerts
        alerts = self._generate_alerts(report)
        if alerts:
            alerts_path = output_dir / "alerts.json"
            alerts_output = AlertsOutput(
                alerts=alerts,
                generated_at=datetime.now().isoformat(),
            )
            with alerts_path.open("w", encoding="utf-8") as f:
                json.dump(alerts_output.model_dump(), f, indent=2)

            if self.options.verbose:
                console.print(f"  Wrote {alerts_path}")

        # Write retro.md unless json_only
        if not self.options.json_only:
            self._write_markdown_report(report, output_dir)

    def _write_markdown_report(self, report: RetroReport, output_dir: Path) -> None:
        """Write markdown report.

        Args:
            report: The report to write.
            output_dir: Output directory.
        """
        md_path = output_dir / "retro.md"

        lines: list[str] = []
        lines.append(f"# Sprint Retrospective: {report.sprint_id}")
        lines.append("")
        lines.append(f"Generated: {report.generated_at}")
        lines.append(f"Period: {report.period.from_date} to {report.period.to_date}")
        lines.append("")

        # Summary
        lines.append("## Summary")
        lines.append("")
        lines.append(f"- **Commits**: {report.summary.commits}")
        lines.append(f"- **Contributors**: {report.summary.contributors} ({report.summary.human_contributors} human, {report.summary.agent_contributors} agent)")
        lines.append(f"- **Lines Changed**: +{report.summary.lines_added} / -{report.summary.lines_removed}")
        lines.append(f"- **Decisions Logged**: {report.summary.decisions_logged}")
        lines.append(f"- **Agent Commits**: {report.summary.agent_commits} ({report.summary.agent_commit_percentage:.1f}%)")
        lines.append(f"- **Data Completeness**: {report.data_completeness.percentage}%")
        lines.append("")

        # Scores
        lines.append("## Scores")
        lines.append("")
        lines.append("| Dimension | Score | Confidence | Evidence |")
        lines.append("|-----------|-------|------------|----------|")

        score_items = [
            ("Delivery Predictability", report.scores.delivery_predictability),
            ("Test Loop Completeness", report.scores.test_loop_completeness),
            ("Quality & Maintainability", report.scores.quality_maintainability),
            ("Security Posture", report.scores.security_posture),
            ("Collaboration Efficiency", report.scores.collaboration_efficiency),
            ("Decision Hygiene", report.scores.decision_hygiene),
        ]

        for name, score in score_items:
            score_val = f"{score.score:.1f}" if score.score is not None else "N/A"
            evidence_str = "; ".join(score.evidence[:2]) if score.evidence else "-"
            lines.append(f"| {name} | {score_val}/5 | {score.confidence} | {evidence_str} |")

        lines.append("")

        # Wins
        if report.wins:
            lines.append("## Wins")
            lines.append("")
            for win in report.wins:
                lines.append(f"### {win.title}")
                lines.append(f"{win.description}")
                if win.evidence:
                    lines.append(f"- Evidence: {', '.join(win.evidence[:3])}")
                lines.append("")

        # Findings
        if report.findings:
            lines.append("## Findings")
            lines.append("")
            for finding in report.findings:
                lines.append(f"### [{finding.severity.upper()}] {finding.title}")
                lines.append(f"{finding.summary}")
                if finding.recommendation:
                    lines.append(f"- **Recommendation**: {finding.recommendation}")
                lines.append("")

        # Risks
        if report.risks:
            lines.append("## Risks")
            lines.append("")
            for risk in report.risks:
                lines.append(f"### {risk.title}")
                lines.append(f"{risk.description}")
                lines.append(f"- **Mitigation**: {risk.mitigation}")
                lines.append("")

        # Action Items
        if report.action_items:
            lines.append("## Action Items")
            lines.append("")
            lines.append("| ID | Priority | Action | Effort | Impact |")
            lines.append("|----|----------|--------|--------|--------|")
            for item in report.action_items[:10]:
                lines.append(f"| {item.id} | {item.priority} | {item.action[:50]}... | {item.effort}/5 | {item.impact}/5 |")
            lines.append("")

        # Data Gaps
        if report.data_completeness.gaps:
            lines.append("## Data Gaps")
            lines.append("")
            for gap in report.data_completeness.gaps:
                lines.append(f"- **{gap.gap_type}** ({gap.severity}): {gap.impact}")
                lines.append(f"  - Recommendation: {gap.recommendation}")
            lines.append("")

        # Human Insights
        if report.human_insights:
            lines.append("## Human Insights")
            lines.append("")

            feedback = report.human_insights.feedback_summary
            lines.append(f"- **Sessions Analyzed**: {feedback.total_sessions}")
            lines.append(f"- **Average Alignment**: {feedback.avg_alignment:.1f}/5")
            lines.append(f"- **Average Revision Cycles**: {feedback.avg_revision_cycles:.1f}")
            lines.append("")

            if report.human_insights.claude_md_suggestions:
                lines.append("### CLAUDE.md Suggestions")
                lines.append("")
                for suggestion in report.human_insights.claude_md_suggestions:
                    lines.append(f"- {suggestion}")
                lines.append("")

        # Footer
        lines.append("---")
        lines.append(f"*Generated by agentic-retrospective v{report.metadata.tool_version}*")

        with md_path.open("w", encoding="utf-8") as f:
            f.write("\n".join(lines))

        if self.options.verbose:
            console.print(f"  Wrote {md_path}")

    def _check_claude_watch_status(self, logs_base_path: Path) -> None:
        """Check if Claude watch hooks are active.

        Args:
            logs_base_path: Base path for log files.
        """
        prompts_path = logs_base_path / "prompts"
        tools_path = logs_base_path / "tools"

        if not prompts_path.exists() and not tools_path.exists():
            self._add_telemetry_gap(
                TelemetryGap(
                    gap_type="inactive_claude_watch",
                    severity="high",
                    impact="Agent activity is not being tracked",
                    recommendation="Verify claude-watch hooks are installed in .claude/settings.json",
                )
            )

    def _check_data_freshness(self, logs_base_path: Path) -> None:
        """Check if log files are stale.

        Args:
            logs_base_path: Base path for log files.
        """
        stale_threshold = timedelta(days=7)
        now = datetime.now()

        for subdir in ["prompts", "tools", "feedback"]:
            dir_path = logs_base_path / subdir
            if not dir_path.exists():
                continue

            jsonl_files = list(dir_path.glob("*.jsonl"))
            if not jsonl_files:
                continue

            # Check most recent file
            newest_file = max(jsonl_files, key=lambda f: f.stat().st_mtime)
            file_mtime = datetime.fromtimestamp(newest_file.stat().st_mtime)

            if now - file_mtime > stale_threshold:
                self._add_telemetry_gap(
                    TelemetryGap(
                        gap_type=f"stale_{subdir}_data",
                        severity="low",
                        impact=f"{subdir.capitalize()} data is more than 7 days old",
                        recommendation=f"Ensure {subdir} logging is active during sessions",
                    )
                )

    def _add_telemetry_gap(self, gap: TelemetryGap) -> None:
        """Add a telemetry gap.

        Args:
            gap: The gap to add.
        """
        self._gaps.append(gap)

    def _count_jsonl_entries(self, directory: Path) -> int:
        """Count entries in JSONL files.

        Args:
            directory: Directory containing JSONL files.

        Returns:
            Total entry count.
        """
        count = 0
        for jsonl_file in directory.glob("*.jsonl"):
            try:
                content = jsonl_file.read_text(encoding="utf-8")
                count += sum(1 for line in content.split("\n") if line.strip())
            except OSError:
                pass
        return count

    def _classify_commit(self, subject: str) -> str:
        """Classify a commit based on its subject.

        Args:
            subject: Commit subject line.

        Returns:
            Category string.
        """
        subject_lower = subject.lower()

        if any(kw in subject_lower for kw in ["fix", "bug", "patch", "hotfix"]):
            return "fix"
        if any(kw in subject_lower for kw in ["feat", "add", "implement", "new"]):
            return "feature"
        if any(kw in subject_lower for kw in ["refactor", "clean", "reorganize"]):
            return "refactor"
        if any(kw in subject_lower for kw in ["doc", "readme", "comment"]):
            return "docs"
        if any(kw in subject_lower for kw in ["test", "spec", "coverage"]):
            return "test"
        if any(kw in subject_lower for kw in ["ci", "pipeline", "deploy", "build"]):
            return "ci"
        if any(kw in subject_lower for kw in ["chore", "deps", "update", "bump"]):
            return "chore"

        return "other"


async def run_retro_async(
    config: RetroConfig, options: RunOptions | None = None
) -> RunResult:
    """Run a retrospective asynchronously.

    This is an async wrapper for the synchronous runner.

    Args:
        config: Configuration for the retrospective.
        options: Run options.

    Returns:
        RunResult from the retrospective.
    """
    runner = RetroRunner(config, options)
    return runner.run()


def run_retro(config: RetroConfig, options: RunOptions | None = None) -> RunResult:
    """Run a retrospective.

    Convenience function for running a retrospective with a config.

    Args:
        config: Configuration for the retrospective.
        options: Run options.

    Returns:
        RunResult from the retrospective.
    """
    runner = RetroRunner(config, options)
    return runner.run()


__all__ = [
    "CollectedData",
    "RetroRunner",
    "RunOptions",
    "RunResult",
    "run_retro",
    "run_retro_async",
]

"""Run agentic retrospective analysis."""

import os
from pathlib import Path

from rich.console import Console
from rich.panel import Panel
from rich.table import Table

from ..models import RetroConfig
from ..runner import RetroRunner, RunOptions

console = Console()


def run_retrospective(
    since: str = "2 weeks ago",
    verbose: bool = False,
    project_dir: Path | None = None,
) -> None:
    """Run retrospective analysis using the full runner."""
    project_dir = project_dir or Path(os.environ.get("CLAUDE_PROJECT_DIR", os.getcwd()))
    project_dir = Path(project_dir)

    console.print()
    console.rule("[bold blue]Agentic Retrospective[/bold blue]")
    console.print()
    console.print(f"[dim]Analysis period: since {since}[/dim]")
    console.print(f"[dim]Project directory: {project_dir}[/dim]")
    console.print()

    # Create configuration
    config = RetroConfig(
        from_ref=since,
        to_ref="HEAD",
        agent_logs_path=str(project_dir / ".logs"),
        decisions_path=str(project_dir / ".logs" / "decisions"),
        output_dir=str(project_dir / ".logs" / "retrospectives"),
        sprint_id=f"sprint-{since.replace(' ', '-')}",
    )

    options = RunOptions(verbose=verbose)

    # Run the retrospective
    runner = RetroRunner(config, options)
    result = runner.run()

    if not result.success:
        console.print(f"[red]Error:[/red] {result.error}")
        return

    # Display the report
    report = result.report
    if not report:
        console.print("[red]Error:[/red] No report generated")
        return

    # TL;DR Section
    _print_tldr(report)

    # Summary Section
    console.print("\n[bold]Summary[/bold]")
    console.print(f"  Commits: {report.summary.commits}")
    console.print(
        f"  Contributors: {report.summary.contributors} "
        f"({report.summary.human_contributors} human, {report.summary.agent_contributors} agent)"
    )
    console.print(f"  Lines changed: +{report.summary.lines_added} / -{report.summary.lines_removed}")
    console.print(f"  Decisions logged: {report.summary.decisions_logged}")
    console.print(f"  Agent commits: {report.summary.agent_commits} ({report.summary.agent_commit_percentage:.1f}%)")
    console.print(f"  Data completeness: {report.data_completeness.percentage}%")

    # Scores Table
    console.print("\n[bold]Scores[/bold]")
    scores_table = Table(show_header=True, header_style="bold")
    scores_table.add_column("Dimension")
    scores_table.add_column("Score", justify="center")
    scores_table.add_column("Confidence")
    scores_table.add_column("Evidence")

    score_items = [
        ("Delivery Predictability", report.scores.delivery_predictability),
        ("Test Loop Completeness", report.scores.test_loop_completeness),
        ("Quality & Maintainability", report.scores.quality_maintainability),
        ("Security Posture", report.scores.security_posture),
        ("Collaboration Efficiency", report.scores.collaboration_efficiency),
        ("Decision Hygiene", report.scores.decision_hygiene),
    ]

    for name, score in score_items:
        score_val = f"{score.score:.1f}/5" if score.score is not None else "N/A"
        evidence_str = "; ".join(score.evidence[:2]) if score.evidence else "-"
        scores_table.add_row(name, score_val, score.confidence, evidence_str[:50])

    console.print(scores_table)

    # Wins
    if report.wins:
        console.print("\n[bold green]Wins[/bold green]")
        for win in report.wins[:3]:
            console.print(f"  [green]+[/green] {win.title}: {win.description}")

    # Findings
    if report.findings:
        console.print("\n[bold yellow]Findings[/bold yellow]")
        for finding in report.findings[:5]:
            severity_color = {
                "critical": "red",
                "high": "red",
                "medium": "yellow",
                "low": "dim",
            }.get(finding.severity, "white")
            console.print(
                f"  [{severity_color}][{finding.severity.upper()}][/{severity_color}] "
                f"{finding.title}"
            )

    # Risks
    if report.risks:
        console.print("\n[bold red]Risks[/bold red]")
        for risk in report.risks[:3]:
            console.print(f"  [red]![/red] {risk.title}: {risk.description}")

    # Action Items
    if report.action_items:
        console.print("\n[bold]Action Items[/bold]")
        for item in report.action_items[:5]:
            priority_color = {
                "must_do": "red",
                "next_sprint": "yellow",
                "backlog": "dim",
            }.get(item.priority, "white")
            console.print(f"  [{priority_color}]{item.priority}[/{priority_color}] {item.action[:60]}...")

    # Output location
    console.print()
    console.rule()
    console.print(f"\n[bold]Output files:[/bold]")
    console.print(f"  {result.output_path}/retro.json")
    console.print(f"  {result.output_path}/retro.md")
    console.print(f"  {result.output_path}/evidence_map.json")

    # Alerts
    if result.alerts:
        console.print(f"\n[bold red]Alerts ({len(result.alerts)}):[/bold red]")
        for alert in result.alerts:
            console.print(f"  [red]{alert.severity.upper()}:[/red] {alert.title}")

    console.print()


def _print_tldr(report) -> None:
    """Print a TL;DR summary panel."""
    # Calculate average score
    scores = [
        report.scores.delivery_predictability.score,
        report.scores.test_loop_completeness.score,
        report.scores.quality_maintainability.score,
        report.scores.security_posture.score,
        report.scores.collaboration_efficiency.score,
        report.scores.decision_hygiene.score,
    ]
    valid_scores = [s for s in scores if s is not None]
    avg_score = sum(valid_scores) / len(valid_scores) if valid_scores else 0

    # Health indicator
    if avg_score >= 4:
        health = "[green]Healthy[/green]"
    elif avg_score >= 3:
        health = "[yellow]Needs Attention[/yellow]"
    else:
        health = "[red]At Risk[/red]"

    # Build TL;DR content
    lines = [
        f"Sprint Health: {health} (avg score: {avg_score:.1f}/5)",
        f"Commits: {report.summary.commits} | Contributors: {report.summary.contributors}",
        f"Data Completeness: {report.data_completeness.percentage}%",
    ]

    if report.wins:
        lines.append(f"Top Win: {report.wins[0].title}")

    if report.findings:
        critical_count = sum(1 for f in report.findings if f.severity in ("critical", "high"))
        if critical_count > 0:
            lines.append(f"[red]Critical/High Findings: {critical_count}[/red]")

    if report.action_items:
        must_do = sum(1 for a in report.action_items if a.priority == "must_do")
        if must_do > 0:
            lines.append(f"[red]Must-Do Actions: {must_do}[/red]")

    console.print(Panel("\n".join(lines), title="[bold]TL;DR[/bold]", border_style="blue"))

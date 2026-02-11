"""CLI entry points for agentic-retrospective."""

from pathlib import Path

import click

from . import __version__


@click.group()
@click.version_option(version=__version__)
def cli() -> None:
    """Agentic Retrospective - Evidence-based sprint retrospectives."""
    pass


@cli.command()
@click.option("--project-dir", "-p", type=click.Path(exists=True, path_type=Path), default=None)
def setup(project_dir: Path | None) -> None:
    """Set up project for telemetry capture."""
    from .commands.setup import setup as do_setup

    do_setup(project_dir)


@cli.command()
@click.option("--project-dir", "-p", type=click.Path(exists=True, path_type=Path), default=None)
def status(project_dir: Path | None) -> None:
    """Check telemetry setup status."""
    from .commands.status import print_status

    print_status(project_dir, repair=False)


@cli.command()
@click.option("--project-dir", "-p", type=click.Path(exists=True, path_type=Path), default=None)
def repair(project_dir: Path | None) -> None:
    """Repair missing directories and configuration."""
    from .commands.status import print_status

    print_status(project_dir, repair=True)


@cli.command()
@click.option("--project-dir", "-p", type=click.Path(exists=True, path_type=Path), default=None)
def audit(project_dir: Path | None) -> None:
    """Audit Claude Code configuration against best practices."""
    from .commands.audit import audit as do_audit

    do_audit(project_dir)


@cli.command("feedback")
@click.option("--session-id", "-s", default=None, help="Session ID for feedback")
@click.option("--project-dir", "-p", type=click.Path(exists=True, path_type=Path), default=None)
def feedback(session_id: str | None, project_dir: Path | None) -> None:
    """Capture post-session feedback (30 seconds)."""
    from .commands.micro_retrospective import micro_retrospective as do_feedback

    do_feedback(session_id, project_dir)


@cli.command("conduct")
@click.option("--since", "-s", default="2 weeks ago", help="Analysis period (e.g., '1 week ago')")
@click.option("--verbose", "-v", is_flag=True, help="Show detailed output")
@click.option("--project-dir", "-p", type=click.Path(exists=True, path_type=Path), default=None)
@click.option("--output-dir", "-o", type=click.Path(path_type=Path), default=None, help="Output directory (default: docs/retrospectives/)")
def conduct(since: str, verbose: bool, project_dir: Path | None, output_dir: Path | None) -> None:
    """Conduct retrospective analysis."""
    from .commands.run_retrospective import run_retrospective

    run_retrospective(since, verbose, project_dir, output_dir)


@cli.command()
@click.argument("decision")
@click.option("--rationale", "-r", default="", help="Why this decision was made")
@click.option(
    "--type",
    "-t",
    "decision_type",
    type=click.Choice(["one_way_door", "two_way_door"]),
    default="two_way_door",
    help="Decision reversibility",
)
@click.option(
    "--actor",
    "-a",
    type=click.Choice(["human", "agent"]),
    default="agent",
    help="Who made the decision",
)
@click.option("--project-dir", "-p", type=click.Path(exists=True, path_type=Path), default=None)
def decision(
    decision: str,
    rationale: str,
    decision_type: str,
    actor: str,
    project_dir: Path | None,
) -> None:
    """Log an architectural decision."""
    from .commands.decision import log_decision

    log_decision(decision, rationale, decision_type, actor, project_dir)


if __name__ == "__main__":
    cli()

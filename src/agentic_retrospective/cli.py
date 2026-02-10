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


@cli.command("micro-retro")
@click.option("--session-id", "-s", default=None, help="Session ID for feedback")
@click.option("--project-dir", "-p", type=click.Path(exists=True, path_type=Path), default=None)
def micro_retro(session_id: str | None, project_dir: Path | None) -> None:
    """Capture post-session feedback (30 seconds)."""
    from .commands.micro_retro import micro_retro as do_micro_retro

    do_micro_retro(session_id, project_dir)


@cli.command("run")
@click.option("--since", "-s", default="2 weeks ago", help="Analysis period (e.g., '1 week ago')")
@click.option("--verbose", "-v", is_flag=True, help="Show detailed output")
@click.option("--project-dir", "-p", type=click.Path(exists=True, path_type=Path), default=None)
def run(since: str, verbose: bool, project_dir: Path | None) -> None:
    """Run retrospective analysis."""
    from .commands.run_retro import run_retro

    run_retro(since, verbose, project_dir)


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

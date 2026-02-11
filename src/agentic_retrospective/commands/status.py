"""Status and repair for agentic-retrospective."""

import json
import os
from pathlib import Path

from rich.console import Console
from rich.table import Table

console = Console()

REQUIRED_LOG_DIRS = ["prompts", "tools", "decisions", "feedback"]


def check_status(project_dir: Path | None = None, repair: bool = False) -> dict:
    """Check telemetry setup status and optionally repair."""
    project_dir = project_dir or Path(os.environ.get("CLAUDE_PROJECT_DIR", os.getcwd()))
    project_dir = Path(project_dir)

    status = {
        "logs_dir": False,
        "log_subdirs": {},
        "retrospectives_dir": False,
        "gitignore": False,
        "hooks_configured": False,
        "has_data": {},
        "warnings": [],
        "ready": False,
    }

    logs_dir = project_dir / ".logs"
    retro_dir = project_dir / "docs" / "retrospectives"

    # Check .logs directory
    if logs_dir.exists():
        status["logs_dir"] = True
    elif repair:
        logs_dir.mkdir(parents=True, exist_ok=True)
        status["logs_dir"] = True
        console.print("[green]Created .logs/[/green]")

    # Check log subdirectories
    for subdir in REQUIRED_LOG_DIRS:
        subdir_path = logs_dir / subdir
        if subdir_path.exists():
            status["log_subdirs"][subdir] = True
            # Check if there's actual data
            jsonl_files = list(subdir_path.glob("*.jsonl"))
            line_count = 0
            for f in jsonl_files:
                line_count += sum(1 for _ in open(f))
            status["has_data"][subdir] = line_count
        else:
            status["log_subdirs"][subdir] = False
            status["has_data"][subdir] = 0
            if repair:
                subdir_path.mkdir(parents=True, exist_ok=True)
                status["log_subdirs"][subdir] = True
                console.print(f"[green]Created .logs/{subdir}/[/green]")

    # Check retrospectives output directory
    if retro_dir.exists():
        status["retrospectives_dir"] = True
    elif repair:
        retro_dir.mkdir(parents=True, exist_ok=True)
        status["retrospectives_dir"] = True
        console.print("[green]Created docs/retrospectives/[/green]")

    # Check .gitignore
    gitignore = project_dir / ".gitignore"
    if gitignore.exists() and ".logs/" in gitignore.read_text():
        status["gitignore"] = True
    elif repair and gitignore.exists():
        with open(gitignore, "a") as f:
            f.write("\n.logs/\n")
        status["gitignore"] = True
        console.print("[green]Added .logs/ to .gitignore[/green]")

    # Check hooks configuration
    claude_settings = project_dir / ".claude" / "settings.json"
    if claude_settings.exists():
        try:
            settings = json.loads(claude_settings.read_text())
            if "hooks" in settings:
                status["hooks_configured"] = True
        except json.JSONDecodeError:
            pass

    # Generate warnings
    if not status["logs_dir"]:
        status["warnings"].append("Missing .logs/ directory - run /retrospective setup")

    for subdir in REQUIRED_LOG_DIRS:
        if not status["log_subdirs"].get(subdir):
            status["warnings"].append(f"Missing .logs/{subdir}/ directory")

    if not status["hooks_configured"]:
        status["warnings"].append("Hooks not configured - telemetry won't be captured automatically")

    total_data = sum(status["has_data"].values())
    if total_data == 0:
        status["warnings"].append("No telemetry data captured yet - work normally and data will accumulate")

    # Determine if ready for full retrospective
    status["ready"] = (
        status["logs_dir"]
        and all(status["log_subdirs"].values())
        and total_data > 0
    )

    return status


def print_status(project_dir: Path | None = None, repair: bool = False) -> None:
    """Print telemetry status."""
    status = check_status(project_dir, repair)

    console.print()
    console.rule("[bold blue]Retrospective Status[/bold blue]")
    console.print()

    # Directory status table
    table = Table(show_header=True, header_style="bold")
    table.add_column("Component")
    table.add_column("Status")
    table.add_column("Data")

    def status_icon(ok: bool) -> str:
        return "[green]OK[/green]" if ok else "[red]MISSING[/red]"

    table.add_row(".logs/", status_icon(status["logs_dir"]), "")

    for subdir in REQUIRED_LOG_DIRS:
        ok = status["log_subdirs"].get(subdir, False)
        data_count = status["has_data"].get(subdir, 0)
        data_str = f"{data_count} entries" if data_count > 0 else "[dim]empty[/dim]"
        table.add_row(f"  {subdir}/", status_icon(ok), data_str)

    table.add_row("docs/retrospectives/", status_icon(status["retrospectives_dir"]), "")
    table.add_row(".gitignore (.logs)", status_icon(status["gitignore"]), "")
    table.add_row("Hooks configured", status_icon(status["hooks_configured"]), "")

    console.print(table)

    # Warnings
    if status["warnings"]:
        console.print()
        console.print("[bold yellow]Warnings:[/bold yellow]")
        for warning in status["warnings"]:
            console.print(f"  [yellow]![/yellow] {warning}")

    # Ready status
    console.print()
    if status["ready"]:
        console.print("[bold green]Ready for retrospective[/bold green]")
    else:
        console.print("[bold red]Not ready for full retrospective[/bold red]")
        console.print("[dim]Run: /retrospective repair[/dim]")

    console.print()

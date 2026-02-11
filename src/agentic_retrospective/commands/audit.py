"""Audit Claude Code configuration against best practices."""

import os
from pathlib import Path

from rich.console import Console
from rich.table import Table

console = Console()


def audit(project_dir: Path | None = None) -> dict:
    """Audit Claude Code configuration."""
    project_dir = project_dir or Path(os.environ.get("CLAUDE_PROJECT_DIR", os.getcwd()))
    project_dir = Path(project_dir)

    results = {
        "errors": [],
        "warnings": [],
        "info": [],
    }

    console.print()
    console.rule("[bold blue]Claude Configuration Audit[/bold blue]")
    console.print()

    # Check CLAUDE.md
    claude_md = project_dir / "CLAUDE.md"
    if claude_md.exists():
        content = claude_md.read_text()
        lines = content.split("\n")
        line_count = len(lines)

        results["info"].append(f"CLAUDE.md found ({line_count} lines)")

        # Check size
        if line_count > 500:
            results["warnings"].append(f"CLAUDE.md is large ({line_count} lines) - consider splitting or condensing")
        elif line_count > 200:
            results["info"].append(f"CLAUDE.md size is moderate ({line_count} lines)")

        # Check for section headers
        headers = [l for l in lines if l.startswith("## ")]
        if not headers:
            results["warnings"].append("CLAUDE.md has no section headers (##)")
        else:
            results["info"].append(f"CLAUDE.md has {len(headers)} sections")

        # Check for common best practice sections
        content_lower = content.lower()
        if "## command" not in content_lower and "## script" not in content_lower:
            results["info"].append("Consider adding a Commands/Scripts section to CLAUDE.md")

    else:
        results["errors"].append("No CLAUDE.md found in project root")

    # Check .claude directory
    claude_dir = project_dir / ".claude"
    if claude_dir.exists():
        results["info"].append(".claude directory found")

        # Check for settings.json
        settings_file = claude_dir / "settings.json"
        if settings_file.exists():
            results["info"].append("settings.json configured")
        else:
            results["info"].append("No settings.json (using defaults)")

    # Check .logs directory
    logs_dir = project_dir / ".logs"
    if logs_dir.exists():
        results["info"].append(".logs directory found (telemetry enabled)")
    else:
        results["warnings"].append("No .logs directory - run /retrospective setup")

    # Check docs/retrospectives
    retro_dir = project_dir / "docs" / "retrospectives"
    if retro_dir.exists():
        results["info"].append("docs/retrospectives directory found")
    else:
        results["info"].append("No docs/retrospectives directory")

    # Print results
    table = Table(show_header=True, header_style="bold")
    table.add_column("Severity")
    table.add_column("Message")

    for error in results["errors"]:
        table.add_row("[red]ERROR[/red]", error)

    for warning in results["warnings"]:
        table.add_row("[yellow]WARNING[/yellow]", warning)

    for info in results["info"]:
        table.add_row("[dim]INFO[/dim]", info)

    console.print(table)

    # Summary
    console.print()
    console.print(f"[red]Errors: {len(results['errors'])}[/red]  "
                  f"[yellow]Warnings: {len(results['warnings'])}[/yellow]  "
                  f"[dim]Info: {len(results['info'])}[/dim]")

    if results["errors"]:
        console.print("\n[red]Fix errors before proceeding[/red]")
    elif results["warnings"]:
        console.print("\n[yellow]Consider addressing warnings[/yellow]")
    else:
        console.print("\n[green]Configuration looks good![/green]")

    console.print()

    return results

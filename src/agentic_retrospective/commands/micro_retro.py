"""Post-session micro-retro feedback capture."""

import json
import os
from datetime import datetime, timezone
from pathlib import Path

from rich.console import Console
from rich.prompt import IntPrompt, Prompt

console = Console()


def micro_retro(session_id: str | None = None, project_dir: Path | None = None) -> None:
    """Capture quick post-session feedback."""
    project_dir = project_dir or Path(os.environ.get("CLAUDE_PROJECT_DIR", os.getcwd()))
    project_dir = Path(project_dir)

    log_dir = project_dir / ".logs" / "feedback"
    log_dir.mkdir(parents=True, exist_ok=True)

    date_str = datetime.now().strftime("%Y-%m-%d")
    log_file = log_dir / f"{date_str}.jsonl"

    session_id = session_id or datetime.now().strftime("%Y%m%d-%H%M%S")

    console.print()
    console.rule("[blue]Session Feedback (30 seconds)[/blue]")
    console.print()

    # Question 1: Alignment (1-5)
    console.print("[yellow]1. How aligned was the agent with your intent?[/yellow]")
    console.print("   [1] Very misaligned  [2] Somewhat off  [3] Okay  [4] Good  [5] Excellent")
    alignment = IntPrompt.ask("   Your rating", choices=["1", "2", "3", "4", "5"], default="3")

    # Question 2: Rework needed
    console.print()
    console.print("[yellow]2. Any rework needed after the session?[/yellow]")
    console.print("   [1] Yes, significant  [2] Minor tweaks  [3] None")
    rework_choice = Prompt.ask("   Your choice", choices=["1", "2", "3"], default="3")
    rework_map = {"1": "significant", "2": "minor", "3": "none"}
    rework = rework_map.get(rework_choice, "none")

    # Question 3: Revision cycles
    console.print()
    console.print("[yellow]3. How many revision cycles occurred? (0-10, Enter to skip)[/yellow]")
    rev_input = Prompt.ask("   Revision cycles", default="")
    revision_cycles = int(rev_input) if rev_input.isdigit() else None

    # Question 4: Improvement suggestion
    console.print()
    console.print("[yellow]4. One thing to improve next time? (Enter to skip)[/yellow]")
    improvement = Prompt.ask("   Improvement", default="")

    # Question 5: What worked well
    console.print()
    console.print("[yellow]5. What worked well? (Enter to skip)[/yellow]")
    worked_well = Prompt.ask("   Worked well", default="")

    # Write log entry
    timestamp = datetime.now(timezone.utc).isoformat()
    entry = {
        "timestamp": timestamp,
        "session_id": session_id,
        "alignment": alignment,
        "rework_needed": rework,
        "revision_cycles": revision_cycles,
        "improvement_suggestion": improvement,
        "worked_well": worked_well,
    }

    with open(log_file, "a") as f:
        f.write(json.dumps(entry) + "\n")

    console.print()
    console.print(f"[green]Feedback logged to {log_file}[/green]")
    console.rule("[blue]Done[/blue]")
    console.print()

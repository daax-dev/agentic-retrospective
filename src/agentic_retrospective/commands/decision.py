"""Log architectural decisions."""

import json
import os
from datetime import datetime, timezone
from pathlib import Path

from rich.console import Console

console = Console()


def log_decision(
    decision: str,
    rationale: str = "",
    decision_type: str = "two_way_door",
    actor: str = "agent",
    project_dir: Path | None = None,
) -> None:
    """Log an architectural decision."""
    project_dir = project_dir or Path(os.environ.get("CLAUDE_PROJECT_DIR", os.getcwd()))
    project_dir = Path(project_dir)

    log_dir = project_dir / ".logs" / "decisions"
    log_dir.mkdir(parents=True, exist_ok=True)

    date_str = datetime.now().strftime("%Y-%m-%d")
    log_file = log_dir / f"{date_str}.jsonl"

    timestamp = datetime.now(timezone.utc).isoformat()

    entry = {
        "timestamp": timestamp,
        "decision": decision,
        "rationale": rationale,
        "decision_type": decision_type,
        "actor": actor,
    }

    with open(log_file, "a") as f:
        f.write(json.dumps(entry) + "\n")

    console.print(f"[green]Decision logged:[/green] {decision}")
    console.print(f"  Type: {decision_type}, Actor: {actor}")
    if rationale:
        console.print(f"  Rationale: {rationale}")

"""Log tool calls from Claude Code."""

import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path


def log_tool() -> None:
    """Log tool call from stdin to .logs/tools/."""
    project_dir = Path(os.environ.get("CLAUDE_PROJECT_DIR", os.getcwd()))
    log_dir = project_dir / ".logs" / "tools"
    log_dir.mkdir(parents=True, exist_ok=True)

    date_str = datetime.now().strftime("%Y-%m-%d")
    log_file = log_dir / f"{date_str}.jsonl"

    # Read hook input from stdin
    try:
        input_data = json.loads(sys.stdin.read())
    except json.JSONDecodeError:
        input_data = {}

    timestamp = datetime.now(timezone.utc).isoformat()

    entry = {
        "timestamp": timestamp,
        "session_id": input_data.get("session_id", "unknown"),
        "tool": input_data.get("tool_name", "unknown"),
        "input": input_data.get("tool_input", {}),
    }

    with open(log_file, "a") as f:
        f.write(json.dumps(entry) + "\n")


def main() -> None:
    """Entry point for hook script."""
    try:
        log_tool()
    except Exception:
        pass  # Never block tool execution
    sys.exit(0)


if __name__ == "__main__":
    main()

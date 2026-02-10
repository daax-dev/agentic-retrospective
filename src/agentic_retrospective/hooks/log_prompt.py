"""Log user prompts with complexity signals."""

import json
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path


def calculate_complexity_signals(prompt: str) -> dict:
    """Calculate complexity signals from prompt text."""
    prompt_lower = prompt.lower()
    prompt_length = len(prompt)

    has_constraints = bool(
        re.search(
            r"\b(only|must|don't|dont|do not|without|limit|never|always|exactly)\b",
            prompt_lower,
        )
    )
    has_examples = bool(
        re.search(r"(```|for example|e\.g\.|like this|such as)", prompt_lower)
    )
    has_acceptance_criteria = bool(
        re.search(
            r"(should return|expected|when .+ then|if .+ then|success.*(is|means)|done when|verify that)",
            prompt_lower,
        )
    )
    file_references = len(
        re.findall(
            r"[A-Za-z0-9_/-]+\.(ts|js|py|java|go|rs|md|json|yaml|yml|sh|css|html|tsx|jsx)",
            prompt,
        )
    )

    # Ambiguity score (0.0-1.0, lower is better)
    score = 0
    if prompt_length < 20:
        score += 30
    elif prompt_length < 50:
        score += 20
    elif prompt_length < 100:
        score += 10

    if not has_constraints:
        score += 15
    if not has_examples:
        score += 15
    if not has_acceptance_criteria:
        score += 20
    if file_references == 0:
        score += 10
    if re.search(
        r"\b(somehow|something|stuff|thing|maybe|probably|kind of|sort of|etc|whatever)\b",
        prompt_lower,
    ):
        score += 10

    ambiguity_score = round(min(score, 100) / 100.0, 2)

    return {
        "has_constraints": has_constraints,
        "has_examples": has_examples,
        "has_acceptance_criteria": has_acceptance_criteria,
        "file_references": file_references,
        "ambiguity_score": ambiguity_score,
    }


def log_prompt() -> None:
    """Log user prompt from stdin to .logs/prompts/."""
    project_dir = Path(os.environ.get("CLAUDE_PROJECT_DIR", os.getcwd()))
    log_dir = project_dir / ".logs" / "prompts"
    log_dir.mkdir(parents=True, exist_ok=True)

    date_str = datetime.now().strftime("%Y-%m-%d")
    log_file = log_dir / f"{date_str}.jsonl"

    # Read hook input from stdin
    try:
        input_data = json.loads(sys.stdin.read())
    except json.JSONDecodeError:
        input_data = {}

    timestamp = datetime.now(timezone.utc).isoformat()
    session_id = input_data.get("session_id", "unknown")
    prompt = input_data.get("prompt", "")
    prompt_length = len(prompt)

    entry = {
        "timestamp": timestamp,
        "session_id": session_id,
        "prompt": prompt,
        "prompt_length": prompt_length,
        "complexity_signals": calculate_complexity_signals(prompt),
    }

    with open(log_file, "a") as f:
        f.write(json.dumps(entry) + "\n")


def main() -> None:
    """Entry point for hook script."""
    try:
        log_prompt()
    except Exception:
        pass  # Never block prompt submission
    sys.exit(0)


if __name__ == "__main__":
    main()

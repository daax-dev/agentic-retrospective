"""Setup project for agentic-retrospective telemetry."""

import json
import os
from pathlib import Path

from rich.console import Console

console = Console()

DECISION_PROMPT = '''<!-- DECISION LOGGING START -->

## Decision Logging

When making significant decisions, log them:

```python
from agentic_retrospective.commands.decision import log_decision
log_decision("what", "why", "one_way_door|two_way_door", "human|agent")
```

Or via CLI:
```bash
agentic-retrospective decision "what" --rationale "why" --type two_way_door
```

**Log when:** Choosing architectures, selecting dependencies, making trade-offs.

<!-- DECISION LOGGING END -->'''


def setup(project_dir: Path | None = None) -> None:
    """Set up project for telemetry capture."""
    project_dir = project_dir or Path(os.environ.get("CLAUDE_PROJECT_DIR", os.getcwd()))
    project_dir = Path(project_dir)

    # 1. Create log directories
    console.print("[green][agentic-retrospective][/green] Creating log directories...")
    for subdir in ["prompts", "tools", "decisions", "feedback"]:
        (project_dir / ".logs" / subdir).mkdir(parents=True, exist_ok=True)

    # 2. Create retrospective output directory
    retro_dir = project_dir / "docs" / "retrospective"
    retro_dir.mkdir(parents=True, exist_ok=True)
    console.print("[green][agentic-retrospective][/green] Created docs/retrospectives/")

    # 2. Add .logs to gitignore
    gitignore = project_dir / ".gitignore"
    if gitignore.exists():
        content = gitignore.read_text()
        if ".logs/" not in content:
            with open(gitignore, "a") as f:
                f.write("\n.logs/\n")
            console.print("[green][agentic-retrospective][/green] Added .logs/ to .gitignore")
        else:
            console.print("[yellow][agentic-retrospective][/yellow] .logs/ already in .gitignore")
    else:
        gitignore.write_text(".logs/\n")
        console.print("[green][agentic-retrospective][/green] Created .gitignore with .logs/")

    # 3. Add decision logging to CLAUDE.md
    claude_md = project_dir / "CLAUDE.md"
    if claude_md.exists():
        content = claude_md.read_text()
        if "DECISION LOGGING" not in content:
            console.print("[green][agentic-retrospective][/green] Adding decision logging to CLAUDE.md...")
            with open(claude_md, "a") as f:
                f.write("\n" + DECISION_PROMPT)
        else:
            console.print("[yellow][agentic-retrospective][/yellow] Decision logging already in CLAUDE.md")
    else:
        console.print("[green][agentic-retrospective][/green] Creating CLAUDE.md with decision logging...")
        claude_md.write_text(DECISION_PROMPT)

    # 4. Configure Claude Code hooks
    claude_settings_dir = project_dir / ".claude"
    claude_settings = claude_settings_dir / "settings.json"

    hooks_config = {
        "hooks": {
            "UserPromptSubmit": [
                {
                    "hooks": [
                        {
                            "type": "command",
                            "command": "python -m agentic_retrospective.hooks.log_prompt",
                            "timeout": 30,
                        }
                    ]
                }
            ],
            "PostToolUse": [
                {
                    "hooks": [
                        {
                            "type": "command",
                            "command": "python -m agentic_retrospective.hooks.log_tool",
                            "timeout": 30,
                        }
                    ]
                }
            ],
        }
    }

    if claude_settings.exists():
        try:
            settings = json.loads(claude_settings.read_text())
            if "hooks" in settings:
                console.print(
                    "[yellow][agentic-retrospective][/yellow] Hooks already configured in .claude/settings.json"
                )
            else:
                settings["hooks"] = hooks_config["hooks"]
                claude_settings.write_text(json.dumps(settings, indent=2) + "\n")
                console.print("[green][agentic-retrospective][/green] Hooks configured successfully")
        except json.JSONDecodeError:
            console.print("[red][agentic-retrospective][/red] Could not parse .claude/settings.json")
    else:
        claude_settings_dir.mkdir(parents=True, exist_ok=True)
        claude_settings.write_text(json.dumps(hooks_config, indent=2) + "\n")
        console.print("[green][agentic-retrospective][/green] Created .claude/settings.json with hooks")

    console.print()
    console.print("[green][agentic-retrospective][/green] Setup complete!")
    console.print()
    console.print("Telemetry directories created:")
    console.print("  .logs/prompts/    - User prompts")
    console.print("  .logs/tools/      - Tool calls")
    console.print("  .logs/decisions/  - Decision records")
    console.print("  .logs/feedback/   - Session feedback")
    console.print()
    console.print("Retrospective output directory:")
    console.print("  docs/retrospectives/  - Retrospective reports by date")
    console.print()
    console.print("Claude Code hooks configured in .claude/settings.json")
    console.print()
    console.print("Capture feedback:      agentic-retrospective micro-retrospective")
    console.print("Conduct retrospective: agentic-retrospective conduct")

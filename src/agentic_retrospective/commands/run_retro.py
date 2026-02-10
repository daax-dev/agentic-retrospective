"""Run agentic retrospective analysis."""

import json
import os
import subprocess
from datetime import datetime, timedelta
from pathlib import Path

from rich.console import Console
from rich.table import Table

console = Console()


def run_git_command(cmd: list[str], cwd: Path) -> str:
    """Run a git command and return output."""
    try:
        result = subprocess.run(
            cmd,
            cwd=cwd,
            capture_output=True,
            text=True,
            timeout=30,
        )
        return result.stdout.strip()
    except (subprocess.TimeoutExpired, subprocess.SubprocessError):
        return ""


def run_retro(
    since: str = "2 weeks ago",
    verbose: bool = False,
    project_dir: Path | None = None,
) -> None:
    """Run retrospective analysis."""
    project_dir = project_dir or Path(os.environ.get("CLAUDE_PROJECT_DIR", os.getcwd()))
    project_dir = Path(project_dir)

    console.print()
    console.rule("[bold blue]Agentic Retrospective[/bold blue]")
    console.print()
    console.print(f"Analysis period: since {since}")
    console.print()

    # Git Analysis
    console.print("[bold]## Git Activity[/bold]")
    console.print()

    commit_log = run_git_command(["git", "log", "--oneline", f"--since={since}"], project_dir)
    commits = [line for line in commit_log.split("\n") if line.strip()]
    commit_count = len(commits)

    console.print(f"Total commits: {commit_count}")
    console.print()

    if commit_count > 0:
        console.print("[bold]### Recent Commits[/bold]")
        for commit in commits[:15]:
            console.print(f"  {commit}")
        console.print()

        # Contributors
        shortlog = run_git_command(
            ["git", "shortlog", "-sn", f"--since={since}"], project_dir
        )
        if shortlog:
            console.print("[bold]### Contributors[/bold]")
            for line in shortlog.split("\n")[:10]:
                if line.strip():
                    console.print(f"  {line.strip()}")
            console.print()

        # Files most changed
        files_output = run_git_command(
            ["git", "log", f"--since={since}", "--pretty=format:", "--name-only"], project_dir
        )
        if files_output:
            file_counts: dict[str, int] = {}
            for line in files_output.split("\n"):
                line = line.strip()
                if line:
                    file_counts[line] = file_counts.get(line, 0) + 1

            if file_counts:
                console.print("[bold]### Files Most Changed[/bold]")
                sorted_files = sorted(file_counts.items(), key=lambda x: x[1], reverse=True)[:10]
                for filename, count in sorted_files:
                    console.print(f"  {count:4d} {filename}")
                console.print()

        # Fix-to-Feature ratio
        fix_log = run_git_command(
            ["git", "log", "--oneline", f"--since={since}", "--grep=fix", "-i"], project_dir
        )
        fix_commits = len([line for line in fix_log.split("\n") if line.strip()])
        feature_commits = commit_count - fix_commits

        if feature_commits > 0:
            ratio = fix_commits / feature_commits
            console.print("[bold]### Fix-to-Feature Ratio[/bold]")
            console.print(f"Fix commits: {fix_commits}")
            console.print(f"Feature commits: {feature_commits}")
            console.print(f"Ratio: {ratio:.1f} (lower is better, target < 0.1)")
            console.print()

    # Telemetry Analysis
    console.print("[bold]## Telemetry Data[/bold]")
    console.print()

    logs_dir = project_dir / ".logs"

    # Prompts
    prompts_dir = logs_dir / "prompts"
    if prompts_dir.exists():
        prompt_files = list(prompts_dir.glob("*.jsonl"))
        if prompt_files:
            prompt_count = sum(
                1 for f in prompt_files for _ in open(f) if _.strip()
            )
            console.print(f"Prompts logged: {prompt_count}")

            if verbose and prompt_count > 0:
                console.print()
                console.print("[bold]### Prompt Complexity (sample)[/bold]")
                # Show last few entries
                for pf in sorted(prompt_files)[-1:]:
                    lines = pf.read_text().strip().split("\n")
                    for line in lines[-5:]:
                        try:
                            entry = json.loads(line)
                            signals = entry.get("complexity_signals", {})
                            console.print(
                                f"  ambiguity={signals.get('ambiguity_score', 'N/A')} "
                                f"len={entry.get('prompt_length', 0)}"
                            )
                        except json.JSONDecodeError:
                            pass
        else:
            console.print("Prompts: No data (run setup first)")
    else:
        console.print("Prompts: No data (run `agentic-retro setup` first)")

    # Tools
    tools_dir = logs_dir / "tools"
    if tools_dir.exists():
        tool_files = list(tools_dir.glob("*.jsonl"))
        if tool_files:
            tool_count = sum(1 for f in tool_files for _ in open(f) if _.strip())
            console.print(f"Tool calls logged: {tool_count}")
        else:
            console.print("Tool calls: No data")
    else:
        console.print("Tool calls: No data")

    # Decisions
    decisions_dir = logs_dir / "decisions"
    if decisions_dir.exists():
        decision_files = list(decisions_dir.glob("*.jsonl"))
        if decision_files:
            decision_count = sum(1 for f in decision_files for _ in open(f) if _.strip())
            console.print(f"Decisions logged: {decision_count}")

            if decision_count > 0:
                console.print()
                console.print("[bold]### Recent Decisions[/bold]")
                for df in sorted(decision_files)[-1:]:
                    lines = df.read_text().strip().split("\n")
                    for line in lines[-5:]:
                        try:
                            entry = json.loads(line)
                            console.print(
                                f"  [{entry.get('decision_type', 'unknown')}] "
                                f"{entry.get('decision', 'N/A')}"
                            )
                        except json.JSONDecodeError:
                            pass
        else:
            console.print("Decisions: No data")
    else:
        console.print("Decisions: No data")

    # Feedback
    feedback_dir = logs_dir / "feedback"
    if feedback_dir.exists():
        feedback_files = list(feedback_dir.glob("*.jsonl"))
        if feedback_files:
            entries = []
            for ff in feedback_files:
                for line in ff.read_text().strip().split("\n"):
                    if line.strip():
                        try:
                            entries.append(json.loads(line))
                        except json.JSONDecodeError:
                            pass

            feedback_count = len(entries)
            console.print(f"Feedback entries: {feedback_count}")

            if feedback_count > 0:
                console.print()
                console.print("[bold]### Session Feedback Summary[/bold]")

                alignments = [e.get("alignment", 0) for e in entries if "alignment" in e]
                if alignments:
                    avg_alignment = sum(alignments) / len(alignments)
                    console.print(f"Average alignment: {avg_alignment:.1f}/5")

                rework_counts = {"none": 0, "minor": 0, "significant": 0}
                for e in entries:
                    r = e.get("rework_needed", "none").lower()
                    if r in rework_counts:
                        rework_counts[r] += 1
                console.print(f"Rework: {rework_counts}")
        else:
            console.print("Feedback: No data (run `agentic-retro micro-retro` after sessions)")
    else:
        console.print("Feedback: No data (run `agentic-retro micro-retro` after sessions)")

    console.print()
    console.rule()
    console.print()

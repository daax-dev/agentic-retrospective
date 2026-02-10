---
name: agent-watch
description: Installs telemetry hooks for capturing prompts, tool calls, decisions, and terminal recordings. Use when setting up a project for retrospectives, enabling development telemetry, or preparing for sprint reviews with the agentic-retrospective skill.
---

STARTER_CHARACTER = 👁️

Development telemetry collection for evidence-based retrospectives. Pairs with the `agentic-retrospective` skill.

## Installation

Run the install script:

```bash
bash skills/agent-watch/scripts/install.sh
```

Confirm success by checking the created structure:

```bash
ls -la .logs/
```

## Uninstallation

```bash
bash skills/agent-watch/scripts/uninstall.sh
```

## What Gets Installed

The install script:
- Creates `.logs/{prompts,tools,decisions,recordings,feedback}/`
- Adds `.logs/` to `.gitignore`
- Installs pass-through hooks in `.claude/settings.json`
- Adds decision logging instructions to `CLAUDE.md`
- Creates `.logs/record.sh` convenience script for asciinema

## What Gets Captured

- **Prompts**: `.logs/prompts/YYYY-MM-DD.jsonl` — all user prompts with complexity signals
- **Tools**: `.logs/tools/YYYY-MM-DD.jsonl` — all tool invocations
- **Decisions**: `.logs/decisions/YYYY-MM-DD.jsonl` — architectural decisions
- **Feedback**: `.logs/feedback/YYYY-MM-DD.jsonl` — post-session micro-retro feedback
- **Recordings**: `.logs/recordings/*.cast` — terminal sessions (manual)

## Post-Session Feedback

Capture quick feedback after each session using the micro-retro script:

```bash
bash .logs/scripts/micro-retro.sh
```

This 30-second survey captures:
1. **Alignment rating** (1-5): How well did the agent match your intent?
2. **Rework needed**: None, minor, or significant?
3. **Revision cycles**: How many back-and-forth corrections?
4. **Improvement suggestion**: One thing to improve next time
5. **What worked well**: Capture positive patterns

Feedback is stored in `.logs/feedback/YYYY-MM-DD.jsonl` and analyzed by the agentic-retrospective skill to generate Human Partner Insights.

## Enhanced Prompt Logging

Prompts are now logged with complexity signals:
- `has_constraints`: Whether prompt includes boundary words (only, must, don't)
- `has_examples`: Whether code examples or references are provided
- `has_acceptance_criteria`: Whether success criteria are defined
- `file_references`: Count of file paths mentioned
- `ambiguity_score`: 0.0-1.0 score (lower = clearer prompts)

These signals enable the agentic-retrospective skill to identify prompt patterns that lead to better or worse outcomes.

## Starting a Recording

If user wants terminal recording:

```bash
.logs/record.sh
```

Requires asciinema. If not installed, suggest:
- macOS: `brew install asciinema`
- Linux: `apt install asciinema`

## Integration with Agentic Retrospective

After collecting telemetry, run retrospectives:

```bash
bash skills/agentic-retrospective/scripts/run.sh
```

The agentic-retrospective skill will generate:
- **Human Partner Insights**: Prompt patterns, improvement suggestions
- **Fix-to-Feature Ratio**: Health indicator for rework cycles
- **TL;DR Quick Summary**: At-a-glance sprint health

## Capture Sources

Designed for:
- **Claude Code CLI**: Terminal sessions
- **Gemini CLI**: Google's AI coding assistant
- **devcontainers**: Containerized development environments

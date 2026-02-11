---
name: status
description: Check telemetry setup status and data availability.
invocation: /retrospective status
---

# Retrospective Status

Execute immediately. Do not ask for confirmation.

Run: `agentic-retrospective status`

## What It Checks

- `.logs/` directory exists
- All subdirectories exist (prompts, tools, decisions, feedback)
- Data has been captured in each directory
- `docs/retrospectives/` output directory exists
- `.gitignore` includes `.logs/`
- Claude Code hooks are configured

## Output

Shows a table with status of each component and warnings for any issues.

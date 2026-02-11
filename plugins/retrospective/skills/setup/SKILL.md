---
name: setup
description: Initialize project for retrospective telemetry capture.
invocation: /retrospective setup
---

# Setup Telemetry

Execute immediately. Do not ask for confirmation.

Run: `agentic-retrospective setup`

## What It Does

1. Creates `.logs/` directories:
   - `prompts/` - User prompts
   - `tools/` - Tool invocations
   - `decisions/` - Decision records
   - `feedback/` - Session feedback

2. Creates `docs/retrospectives/` for output

3. Adds `.logs/` to `.gitignore`

4. Adds decision logging to `CLAUDE.md`

5. Configures Claude Code hooks

## After Setup

Telemetry starts automatically. Use:
- `/retrospective conduct` - Run full retrospective
- `/retrospective feedback` - Give session feedback

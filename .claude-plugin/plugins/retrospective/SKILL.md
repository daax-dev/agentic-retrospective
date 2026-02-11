---
name: retrospective
description: Evidence-based sprint retrospectives for human-agent collaboration.
invocation: /daax:retrospective
---

# Retrospective

Evidence-based sprint retrospectives. Execute immediately without asking for confirmation.

## Sub-commands

### /retrospective conduct
Conduct full retrospective analysis.
Run: `npx agentic-retrospective`

After completion, prompts for feedback automatically.

### /retrospective setup
Initialize telemetry directories.
Run: `mkdir -p .logs/decisions .logs/prompts .logs/tools .logs/feedback`

### /retrospective status
Check telemetry setup and data availability.
Run: `ls -la .logs/`

---
name: retrospective
description: Evidence-based sprint retrospectives for human-agent collaboration.
invocation: retrospective
---

# Retrospective

Evidence-based sprint retrospectives. Execute immediately without asking for confirmation.

## Sub-commands

### /retrospective setup
Initialize telemetry capture.
Run: `agentic-retrospective setup`

### /retrospective conduct
Conduct full retrospective analysis.
Run: `agentic-retrospective conduct`

After completion:
1. Report results
2. Show where report was saved
3. Ask: "Would you like to update CLAUDE.md with improvements?"
4. Ask for feedback via `/retrospective feedback`

### /retrospective status
Check telemetry setup and data availability.
Run: `agentic-retrospective status`

### /retrospective repair
Fix missing directories and configuration.
Run: `agentic-retrospective repair`

### /retrospective feedback
Your chance to say what went well and what didn't.
Run: `agentic-retrospective feedback`

Captures:
- Alignment score (1-5)
- Rework level
- What worked well
- What to improve

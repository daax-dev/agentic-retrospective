---
name: micro-retrospective
description: Quick 30-second feedback survey after coding sessions. Captures alignment, rework needed, and improvement suggestions.
invocation: /micro-retrospective
---

# Micro Retrospective

Capture quick session feedback in 30 seconds.

## In-Claude Usage

```
/micro-retrospective
```

## What It Captures

1. **Alignment Score (1-5)**: How well did the agent understand your intent?
2. **Rework Level**: None, minor, or significant rework needed?
3. **What Worked Well**: Optional - things to reinforce
4. **Improvement Suggestion**: Optional - one thing to improve

## Why Use This

- Takes only 30 seconds
- Feeds into sprint retrospective analysis
- Helps identify prompt patterns that work/don't work
- Generates CLAUDE.md improvement suggestions

## Data Location

Feedback is stored in `.logs/feedback/YYYY-MM-DD.jsonl`

## Best Practice

Run `/micro-retrospective` after:
- Completing a significant feature
- Finishing a debugging session
- Any session with notable friction or success

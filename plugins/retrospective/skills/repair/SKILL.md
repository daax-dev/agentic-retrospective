---
name: repair
description: Fix missing directories and configuration for retrospective telemetry.
invocation: /retrospective repair
---

# Repair Telemetry Setup

Fix missing directories and configuration.

## Usage

```
/retrospective repair
```

## What It Fixes

- Creates missing `.logs/` directory
- Creates missing subdirectories (prompts, tools, decisions, feedback)
- Creates missing `docs/retrospectives/` output directory
- Adds `.logs/` to `.gitignore` if missing

## When To Use

Run this if `/retrospective status` shows missing components, or if you see warnings when running `/retrospective`.

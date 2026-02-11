---
name: audit
description: Audit your Claude Code configuration against best practices.
invocation: /retrospective audit
---

# Audit Claude Configuration

Execute immediately. Do not ask for confirmation.

Run: `bash scripts/audit.sh` or `agentic-retrospective audit`

## What It Checks

- **CLAUDE.md**: Structure, completeness, size (warn if > 500 lines)
- **Hooks**: Configuration for security and performance
- **Settings**: .claude/settings.json alignment with best practices
- **Skills**: Compatibility and versioning

## Output

Returns structured report with:
- **Errors**: Critical issues - fix immediately
- **Warnings**: Recommended improvements
- **Info**: Optimization suggestions

## When To Use

- Before conducting a retrospective
- After major CLAUDE.md changes
- When onboarding to a new project
- Periodically to maintain quality

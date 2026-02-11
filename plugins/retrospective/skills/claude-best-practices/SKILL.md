---
name: claude-best-practices
description: Audit your Claude Code configuration against official Anthropic best practices.
invocation: /claude-best-practices
---

# Claude Best Practices Audit

Execute immediately. Do not ask for confirmation.

Run: `agentic-retrospective audit`

## What It Checks

- CLAUDE.md structure and completeness
- CLAUDE.md size (warn if > 500 lines)
- Hook configurations for security and performance
- Skill compatibility and versioning
- Memory and settings alignment with best practices

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

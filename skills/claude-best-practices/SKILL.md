---
name: claude-best-practices
description: Audits a repository's Claude Code configuration (CLAUDE.md, skills, hooks, settings) against Anthropic's documented best practices and reports errors, warnings, and info findings. Use when the user asks for a Claude Code configuration audit, wants to validate CLAUDE.md size or skill frontmatter, or is preparing a repo for agent use.
---

# Claude Best Practices Audit

Execute immediately. Do not ask for confirmation.

Run: `bash skills/claude-best-practices/scripts/audit.sh .`

## What It Checks

- CLAUDE.md exists, has section headers, and stays under 500 lines
- Each `skills/*/SKILL.md` has valid frontmatter (`name`, `description`)
- Skill `description` uses third-person voice (no "I" or "you/your")
- Skill bodies stay under 500 lines
- Warns if an `AGENTSKILLS.md` exists alongside a `skills/` tree (duplication risk)
- Reports presence of `.claude/hooks.json` and `.claude/settings.json`

## Output

Returns structured report with:
- **Errors**: Critical issues - fix immediately (non-zero exit)
- **Warnings**: Recommended improvements
- **Info**: Optimization suggestions

## When To Use

- Before conducting a retrospective
- After major CLAUDE.md changes
- When onboarding to a new project
- Periodically to maintain quality

<!-- CLAUDE.md and AGENTS.md share the Operator Preferences and Hard Guardrails below. Keep them in sync. -->

# AGENTS.md

Entry point for OpenAI Codex and compatible agents.

---

## Project
Name: agentic-retrospective (npm: `@daax-dev/retrospective`)
Purpose: Evidence-based sprint retrospectives for human-agent collaboration — a CLI tool and Claude Code plugin that captures telemetry and generates objective, evidence-linked metrics scored across 6 dimensions.

---

## Operator Preferences
<!-- Operator-specific. Revise or replace when applying to a different operator. -->
- State facts only. No sugarcoating.
- Surface problems, blockers, and risks immediately.
- Consult before one-way-door decisions and before any architectural change.
- Never guess. If validation is not possible, say so explicitly.
- Objective language. No first-person pronouns. No apologies or hedges.

---

## Hard Guardrails (always apply)
- Plan before any non-trivial change. Write the plan down. Wait for approval.
- Never commit or merge directly to `main`.
- Never commit secrets, tokens, keys, or `.env` files with live values (npm publish uses `NPM_TOKEN` from CI secrets).
- No destructive git (`reset --hard`, force-push, branch delete) without explicit operator approval.
- Never overwrite uncommitted user changes. Inspect existing patterns before editing.
- Run formatter, linter, and tests after changes (`pnpm run validate`). If that is not possible, state exactly why.
- Log non-trivial decisions to `.logs/decisions/<topic>.jsonl`.
- Repo-local instructions override these template defaults.

---

## Project-Specific Notes
- Dual artifact: an npm package (`bin: agentic-retrospective`) and a Claude Code plugin. TypeScript source under `src/`; plugin hooks are Bash scripts under `scripts/` wired by `hooks/hooks.json`.
- `pnpm` is canonical (`pnpm-lock.yaml`; CI uses `pnpm install --frozen-lockfile`). Do not use npm; there is no `package-lock.json`.
- Publish (`.github/workflows/publish.yml`) runs on GitHub Release `published` (version set from the release tag), not on PRs or pushes. Validate locally before opening a PR.

---

## Required Reading
`.claude/workflow.md` — planning and definition of done — applies to every task. Read it before starting work.

Read the matching file **before** you:
- write or edit code → `.claude/language.md` (TypeScript + Bash formatting, linting, testing)
- make an architectural or cross-boundary decision → `.claude/architecture.md`
- touch dependencies, runtime, or infrastructure → `.claude/stack.md`
- perform branch / PR / commit / merge operations → `.claude/sourcecontrol.md`
- write a decision or reference log entry → `.claude/history.md`

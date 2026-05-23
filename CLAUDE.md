# CLAUDE.md

## Project
Name: agentic-retrospective (npm: `@daax-dev/retrospective`)
Purpose: Evidence-based sprint retrospectives for human-agent collaboration — a CLI tool and Claude Code plugin that captures telemetry (prompts, tool calls, decisions) and generates objective, evidence-linked metrics scored across 6 dimensions.
Goal: Every finding links to a specific commit, PR, or decision ("no AI slop"). Done = the CLI and plugin produce reproducible, evidence-backed retrospective reports, all tests/lint/typecheck pass, and the published npm package and plugin marketplace entry stay in sync.

---

## Operator Preferences
- State facts only. No sugarcoating.
- Surface problems, blockers, and risks immediately.
- Consult before one-way-door decisions and before any architectural change.
- Never answer from a guess. Validate claims against primary sources. If validation is not possible, say so explicitly.
- Objective language. No first-person pronouns. No apologies or hedges.

---

## Hard Guardrails (always apply)
- Plan before any non-trivial change. Write the plan down. Wait for approval.
- Never commit or merge directly to `main`.
- Never commit secrets, tokens, keys, or `.env` files with live values. The npm publish flow uses `NPM_TOKEN` from CI secrets — never inline it.
- No destructive git (`reset --hard`, force-push, branch delete) without explicit operator approval.
- Never overwrite uncommitted user changes. Inspect existing patterns before editing.
- Run formatter, linter, and tests after changes (`pnpm run validate`). If that is not possible, state exactly why.
- Log non-trivial decisions to `.logs/decisions/<topic>.jsonl` (one JSONL object per line). Log when choosing architectures, selecting dependencies, or making trade-offs.
- Repo-local instructions override these template defaults.

---

## Project-Specific Notes
- This repo is BOTH an npm package (`bin: agentic-retrospective`) and a Claude Code plugin. Source is TypeScript under `src/`; plugin runtime hooks are Bash scripts under `scripts/` wired by `hooks/hooks.json`.
- `pnpm` is the canonical package manager (CI uses `pnpm install --frozen-lockfile`; `pnpm-lock.yaml` is authoritative). Do not use npm to install or update deps; there is no `package-lock.json`.
- Publishing is release-driven via `.github/workflows/publish.yml` (runs on GitHub Release `published`; the workflow sets `package.json` version from the release tag and runs `npm publish --provenance`). CI does NOT run on pull requests — validate locally with `pnpm run validate` before opening a PR.
- Plugin metadata lives in `plugin.json`, `.claude-plugin/marketplace.json`, and `AGENTSKILLS.md` (the AgentSkills/marketplace surface). When user-facing CLI/slash commands or scoring dimensions change, keep these in sync with `README.md`.
- CLI surface: `agentic-retrospective` (full run), `--from <ref>`, `--quiet`, `--json`, and `agentic-retrospective feedback`. Reports land in `docs/retrospectives/`.

---

## Required Reading
`.claude/workflow.md` is always loaded (see include below) — planning and definition of done apply to every task.

Read the matching file **before** you:
- write or edit code → `.claude/language.md` (TypeScript + Bash formatting, linting, testing)
- make an architectural or cross-boundary decision → `.claude/architecture.md`
- touch dependencies, runtime, or infrastructure → `.claude/stack.md`
- perform branch / PR / commit / merge operations → `.claude/sourcecontrol.md`
- write a decision or reference log entry → `.claude/history.md`

@.claude/workflow.md

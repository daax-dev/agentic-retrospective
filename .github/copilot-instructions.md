# Copilot Instructions

GitHub Copilot reads this file automatically. Rules here are enforced in every session.

---

## Project
Name: agentic-retrospective (npm: `@daax-dev/retrospective`)
Purpose: Evidence-based sprint retrospectives for human-agent collaboration — a CLI tool and Claude Code plugin that captures telemetry (prompts, tool calls, decisions) and generates objective, evidence-linked metrics scored across 6 dimensions. Every finding links to a specific commit, PR, or decision.

---

## Operator Preferences
- State facts only. No sugarcoating.
- Surface problems, blockers, and risks immediately.
- Consult before one-way-door or architectural decisions.
- Never answer from a guess. Say so when a claim cannot be validated.
- Objective language. No first-person pronouns. No apologies.

---

## Planning
- A plan is required for any non-trivial change. Trivial = typo fix, single-line config update, obvious rename.
- Write the plan first. Present it. Wait for approval. Do not start coding until approved.
- Present options with trade-offs. The operator decides; the agent executes.

---

## Stack
- Runtime: Node.js (`engines: >=18`; CI pins Node 20 — treat 20 as canonical). ESM (`"type": "module"`, NodeNext modules).
- Package manager: pnpm (canonical, `pnpm-lock.yaml`, lockfile v9; CI uses `pnpm install --frozen-lockfile`). Do NOT use npm to install/update; there is no `package-lock.json` and one must not be reintroduced.
- Languages: TypeScript (`src/`) and Bash (`scripts/`, 5 plugin-hook scripts).
- Test framework: Vitest (`vitest.config.ts`). Run `pnpm test` (full) or `pnpm run validate` (lint + typecheck + test).
- CI: GitHub Actions, single workflow `.github/workflows/publish.yml` — triggered ONLY by a GitHub Release (`release: types: [published]`); it sets the `package.json` version from the release tag, builds, lints, tests, then `npm publish --provenance`. CI does NOT run on PRs or pushes; validate locally.
- Artifact registry: npm (published as `@daax-dev/retrospective`, public, with provenance). Plugin distributed via `.claude-plugin/marketplace.json`.

---

## Code Conventions
- TypeScript is strict (`tsconfig.json`: `strict: true`, `noUnusedLocals`, `noUnusedParameters`, `noImplicitReturns`, `noFallthroughCasesInSwitch`). Type-check with `pnpm run typecheck`.
- ESLint (`.eslintrc.json`): `eslint:recommended` + `@typescript-eslint/recommended`. `@typescript-eslint/no-explicit-any` is `warn` (avoid `any`; justify when unavoidable). `@typescript-eslint/no-unused-vars` is an error with `argsIgnorePattern: "^_"` — unused function *arguments* prefixed `_` are ignored, but unused local variables are still errors regardless of prefix. Run `pnpm run lint`.
- Bash scripts: fail fast with `set -e` (prefer `set -euo pipefail` for new scripts), quote expansions, no `eval`. Keep hook scripts fast (5s timeout) and side-effect-only (telemetry logging).
- All tests must pass before declaring done. Coverage thresholds (vitest): lines 60, branches 50, functions 60, statements 60.
- Lockfile (`pnpm-lock.yaml`) is committed. Updating it is a deliberate change — note it in the PR.
- Generated/build output lives in `dist/` and is git-ignored. Never edit `dist/` by hand.
- Keep `plugin.json`, `.claude-plugin/marketplace.json`, `AGENTSKILLS.md`, and `README.md` consistent when user-facing commands or scoring dimensions change.

---

## Source Control
- Repo: github.com/daax-dev/agentic-retrospective. Never commit directly to `main`. All work lands via PR.
- Branch naming: `feature/`, `fix/`, `docs/`, `chore/`.
- Commits: imperative mood, present tense. Subject ≤ 72 characters. Body explains **why**.
- PR body must include: problem statement, approach, alternatives considered, test evidence.
- Never merge your own PR unless explicitly authorized.
- Never commit secrets, tokens, keys, or `.env` files with live values.

---

## Architecture
- CLI + library tool. Flow: `cli.ts` parses args → `runner.ts` orchestrates → `analyzers/*` (git, github, decisions, security, rework, tools, artifacts, human-insights) produce evidence → `scoring/rubrics.ts` scores 6 dimensions → `report/*` renders Markdown + JSON.
- Evidence-driven: every metric must trace to a commit, PR, or decision-log entry. No vague observations.
- Graceful degradation: missing data sources yield `null` scores with a recorded gap, never a crash.
- Time: UTC everywhere internally. Local time is a presentation concern.
- "Temporary" workarounds without an expiry date and an owner are not acceptable.

---

## Definition of Done
A task is done only when:
- All tests pass (`pnpm test`); `pnpm run validate` (lint + typecheck + test) is green.
- ESLint and `tsc --noEmit` pass with no errors.
- PR opened with problem statement, approach, and test evidence.
- No new `[FILL IN]` placeholders left in affected files (the legend line in `.claude/stack.md` / `.claude/language.md` that defines the `[FILL IN]` marker is intentional and exempt).
- Decisions logged in `.logs/decisions/` if a non-trivial choice was made.

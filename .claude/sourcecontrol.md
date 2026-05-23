# Source Control

---

## Repository
- Host: GitHub — github.com/daax-dev/agentic-retrospective (remote `origin`).
- Default branch: main
- All work lands via PR. No direct commits to main.

---

## Branch Naming
- Feature: `feature/<short-topic>`
- Bug fix: `fix/<short-topic>`
- Docs: `docs/<short-topic>`
- Chore / tooling: `chore/<short-topic>`
- Claude Code sessions: harness-assigned name (e.g., `claude/<task>-<id>`). Do not rename mid-session.
- Lowercase, hyphen-separated. Keep names short.

---

## Commits
- Imperative mood, present tense: "add X", not "added X" or "adds X".
- Subject line ≤ 72 characters.
- Body explains the **why**. The diff shows the what.
- One logical change per commit. Mixed-purpose commits get rejected at review.
- Do not amend a commit that has already been pushed unless explicitly asked.

---

## Pull Requests
- Open a PR as soon as the branch has a meaningful commit. Draft is fine.
- PR title = leading commit subject line.
- PR body must include:
  - Problem statement.
  - Approach taken and alternatives considered.
  - Test evidence (commands run, output) — run `pnpm run validate` locally, since CI does not run on PRs.
  - Which model produced and which model validated (if AI-assisted).
- Never merge your own PR unless explicitly authorized by the operator.
- Squash-merge by default unless the branch history is intentionally curated.

---

## CI and Publishing
- `.github/workflows/publish.yml` triggers ONLY on push to `main` that touches `package.json`. It builds, lints, tests, and `npm publish --provenance` when the version changed. There is no PR-triggered CI — local validation is the gate.
- Releasing a new npm version = bump `version` in `package.json` on `main` (operator action). Tags like `v0.1.4` track releases.

---

## Worktrees
- Long-running parallel work uses `git worktree` rather than branch-switching in place.
- Worktree paths live outside the primary checkout (e.g., `/tmp/<repo>-<branch>`).
- Worktrees are disposable. Clean them up when the branch lands.

---

## What Never Gets Committed
- Secrets, tokens, keys, connection strings (e.g., `NPM_TOKEN` stays in CI secrets).
- `.env` files with live values.
- Build output `dist/` (git-ignored; `tsc` regenerates it).
- IDE / OS noise (`.DS_Store`, `Thumbs.db`) — add to `.gitignore`.
- `package-lock.json` changes — pnpm is canonical; do not introduce npm lockfile churn.

---

## Destructive Operations
- Force-push to a shared branch requires explicit operator authorization.
- `git reset --hard`, branch deletion, and history rewrites require confirmation when recovery is uncertain.
- Treat destructive git operations as high-risk: pause, verify the target, get confirmation.

---

## Tags and Releases
- Tag scheme: semver, `vMAJOR.MINOR.PATCH` (e.g., `v0.1.4`), matching `package.json` `version`.
- Release notes: derived from PR/commit history; npm publish is automated by `publish.yml` on version change.

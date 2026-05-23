# Stack

`[FILL IN]` marks an undefined entry. Treat as "ask the operator," not a guess.
Only document what is confirmed and deployable today.

---

## Runtime
- Node.js — `engines: ">=18.0.0"` (package.json). CI pins Node 20 (`.github/workflows/publish.yml`); treat Node 20 as the canonical runtime.
- ESM only: `"type": "module"`; TypeScript `module`/`moduleResolution` = NodeNext; `target`/`lib` = ES2022.

## Frameworks
- Backend: none (no server). This is a CLI + library.
- Frontend: none.
- CLI: commander (`commander@^12`), with chalk for output and date-fns for date handling. Git access via simple-git.
- Plugin: Claude Code plugin — slash commands in `commands/`, skills in `skills/`, runtime hooks in `hooks/hooks.json` (Bash scripts in `scripts/`).

## Persistence
- None. The tool reads from git history, GitHub (`gh` CLI), and JSONL logs under `.logs/`; it writes Markdown/JSON reports under `docs/retrospectives/`. No database, cache, or search backend.

## Data Sources (read by the analyzers)
- Git history (required) — via simple-git.
- GitHub PR/review data (optional) — via the `gh` CLI when available.
- Decision logs `.logs/decisions/*.jsonl`, security scans `.logs/security/*.json`, feedback `.logs/feedback/*.jsonl`, tool logs `.logs/tools/*.jsonl` (all optional; missing sources degrade gracefully to null scores).

## Auth
- Identity: none (local CLI). GitHub access uses the operator's `gh` CLI authentication.
- npm publish: OIDC provenance + `NPM_TOKEN` (CI secret).

## Observability
- None built in. Output is the retrospective report itself (Markdown + JSON + alerts.json).

## Build / Package
- TypeScript: pnpm (canonical, `pnpm-lock.yaml`, lockfile v9). Build via `tsc` (`pnpm run build` → `dist/`). Do not use npm; there is no `package-lock.json`.
- CI: GitHub Actions — `.github/workflows/publish.yml`. Triggered only by a GitHub Release (`release: types: [published]`). Sets `package.json` version from the release tag, then builds, lints, tests, and `npm publish --provenance`. CI does NOT run on PRs or pushes.
- Artifact registry: npm public registry as `@daax-dev/retrospective`. Plugin distribution via `.claude-plugin/marketplace.json`.

## Explicitly Not in Stack
List rejected tools and the reason. Prevents re-proposal.
- npm as package manager — pnpm is canonical; a `package-lock.json` must not be reintroduced.
- No database / cache / message broker / web server — this is a read-only analysis CLI.
- No bundler — TypeScript compiles directly to ESM via `tsc`.

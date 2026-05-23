# Language Conventions

`[FILL IN]` marks a gap. Treat as "ask the operator," not a guess.

For each active language, this file records:
1. Pinned version and how it is pinned.
2. Formatter and config location.
3. Linter and config location.
4. Type checker and strictness level.
5. Test framework and coverage threshold.
6. Any style rules that override the formatter's defaults.

Active languages in this repo: **TypeScript** (primary, `src/`) and **Bash** (plugin hook scripts, `scripts/`).

---

## TypeScript
- Runtime: Node.js `>=18` (package.json `engines`); CI pins Node 20 — treat as canonical. ESM (`"type": "module"`, NodeNext).
- Version: TypeScript `^5.3` (devDependency).
- Package manager: pnpm (canonical, `pnpm-lock.yaml`, lockfile v9). Do NOT use npm — there is no `package-lock.json` in this repo, and it must not be reintroduced.
- Formatter: none configured. There is no Prettier config; do not introduce one in an unrelated change. Match existing style (2-space indent, single quotes, semicolons) as seen in `src/`.
- Linter: ESLint, config `.eslintrc.json` — extends `eslint:recommended` + `plugin:@typescript-eslint/recommended`. `@typescript-eslint/no-explicit-any` is `warn` (avoid `any`; justify when unavoidable). `@typescript-eslint/no-unused-vars` is `error` with `argsIgnorePattern: "^_"`. `no-console` is off (CLI tool). Run `pnpm run lint` (lints `src` only, `.ts`).
- Type checker: `tsc` strict. `tsconfig.json` has `strict: true`, `noUnusedLocals: true`, `noUnusedParameters: true`, `noImplicitReturns: true`, `noFallthroughCasesInSwitch: true`, `isolatedModules: true`. Run `pnpm run typecheck` (`tsc --noEmit`).
- Tests: Vitest (`vitest.config.ts`), `globals: true`, `environment: node`, `pool: forks` / `singleFork` (supports `process.chdir()` in integration tests). Test layout under `test/`: `unit/`, `integration/`, `snapshot/`, `e2e/`. Run `pnpm test` (= `vitest run`) or targeted: `pnpm run test:unit`, `:integration`, `:snapshot`, `:e2e`, `:coverage`.
- Coverage threshold (vitest, v8 provider): lines 60, branches 50, functions 60, statements 60. Do not lower these.

---

## Shell (bash)
- Scope: plugin runtime hooks and helpers in `scripts/` (`ensure-logs-dir.sh`, `log-prompt.sh`, `log-tool.sh`, `run-retrospective.sh`, `micro-retrospective.sh`), wired by `hooks/hooks.json`.
- Version target: bash 5.x.
- Linter: shellcheck (run locally; not enforced in CI).
- Style: every script fails fast with `set -e` (prefer `set -euo pipefail` for new scripts). Quote all expansions. No `eval`. Hook scripts must stay fast (5s timeout in `hooks.json`) and side-effect-only (append telemetry to `.logs/`).

---

## Cross-Cutting Rules
- No language rule overrides project config. Fix the config, not the code.
- Generated/build output lives in `dist/` (git-ignored). Never edit `dist/` by hand.
- Lockfile (`pnpm-lock.yaml`) is committed. Updating it is a deliberate change — call it out in the PR. Never add or reintroduce `package-lock.json` (pnpm is the sole canonical lockfile).
- No pre-commit hooks are configured in this repo; run `pnpm run validate` manually before opening a PR.

# Architecture

Architectural decisions require operator approval before implementation.
ADRs log to `.logs/decisions/architecture.jsonl` (see `.claude/history.md`).

---

## Shape
This is a CLI tool and library (npm package `@daax-dev/retrospective`) that doubles as a Claude Code plugin. There is no server, no public network API, and no persistent datastore — it reads evidence and writes report files.

## Pipeline (the core pattern)
- `src/cli.ts` — commander entry point; parses args (`--from`, `--quiet`, `--json`, `feedback` subcommand), wires the run.
- `src/runner.ts` — orchestrates the pipeline end to end.
- `src/analyzers/*` — each analyzer reads one evidence source and emits structured findings: `git`, `github`, `decisions`, `security`, `rework`, `tools`, `artifacts`, `human-insights`.
- `src/scoring/rubrics.ts` — scores the 6 dimensions (Delivery Predictability, Test Loop Completeness, Quality & Maintainability, Security Posture, Collaboration Efficiency, Decision Hygiene).
- `src/report/*` — `generator.ts` + `human-report.ts` render Markdown + JSON (+ `evidence_map.json`, `alerts.json`) under `docs/retrospectives/`.
- `src/types.ts` — shared types; `src/index.ts` — library export surface.

## Core Principles (do not violate)
- Evidence-driven: every metric/finding traces to a concrete commit, PR, or decision-log entry. No vague observations, no fabricated numbers ("no AI slop").
- Blameless: evaluate systems and patterns, not individuals.
- Graceful degradation: a missing or unreadable data source yields a `null` score with a recorded gap — never a crash. New analyzers must follow this contract.
- Deterministic given the same inputs: same git range + same logs → same report.

## Boundaries
- Each analyzer is independently testable against fixtures. Module boundary = test boundary (`test/unit`, `test/integration`, `test/snapshot`, `test/e2e` mirror this).
- External calls go through clients that tolerate absence: git via simple-git, GitHub via the `gh` CLI (degrade if unavailable). No hard dependency on network access for the required (git-only) path.
- Plugin hook scripts (`scripts/*.sh`) are append-only telemetry writers — keep them fast and side-effect-isolated; they must not block the agent session.

## Configuration & Secrets
- Runtime config via CLI flags. No secrets in source. `NPM_TOKEN` lives only in CI secrets for publish.
- Time: UTC everywhere internally. Local time is a presentation concern in the report.
- IDs: N/A — no entity store. Reports are keyed by date (`docs/retrospectives/YYYY-MM-DD/`).
- API style: N/A — no public API surface beyond the CLI and the library export in `src/index.ts`.

## Anti-Patterns (refuse these)
- Output that cannot be traced to evidence.
- An analyzer that throws on missing data instead of recording a gap.
- "Temporary" workarounds without an expiry date and an owner.
- Drift between `plugin.json` / `.claude-plugin/marketplace.json` / `AGENTSKILLS.md` / `README.md` for user-facing commands or scoring dimensions.
- Secrets in env files, source control, or CI variables without rotation.

---

## Decision Logging
Log to `.logs/decisions/architecture.jsonl`:
```json
{"id":"arch-001","date":"YYYY-MM-DD","decision":"...","rationale":"...","alternatives":"...","references":["https://..."]}
```

---

## Reference Architectures
When citing patterns, prefer primary sources:
- Official vendor documentation (Anthropic Claude Code / plugin docs, npm, GitHub Actions).
- NIST SP 800-series for security architecture; OWASP for application security patterns.
Cite the exact URL in `.logs/references/architecture.jsonl`.

# Workflow

## Planning
- A plan is required for any non-trivial change.
- Trivial: typo fix, single-line config update, obvious rename. Everything else requires a plan.
- Write the plan down — in the PR description, task system, or `.logs/decisions/`. Plans held only in chat do not count.
- Present trade-offs as facts: option, cost, risk, reversibility. The operator decides; the agent executes.
- Do not start coding until the plan is approved.

---

## Execution Discipline
- State assumptions that affect implementation. If the request has multiple plausible readings, ask before editing.
- Smallest change that satisfies the verified goal. No speculative features, abstractions, or config.
- Touch only what the task requires. No adjacent cleanup or drive-by refactors. Every changed line traces to the request or its validation.
- Remove only the orphans your change created; leave pre-existing dead code (mention it, don't delete).
- Define a verifiable goal before coding. Add or update tests when behavior changes.
- This is an evidence-based tool: any new metric or finding must trace to a real source (commit, PR, decision log). No fabricated or vague output.

---

## Work Intake
Tasks originate from (check in this order):
1. GitHub Issues — github.com/daax-dev/agentic-retrospective/issues (templates under `.github/ISSUE_TEMPLATE/`: bug report, feature request, telemetry issue).
2. Direct request from operator.

No Backlog.md, JIRA, or Linear markers are present in this repo. Identify the source before starting. If the same task appears in multiple systems, ask which is canonical.

---

## Model Selection
- Match model capability to task complexity. Do not waste large models on small tasks.
- Code with one model; validate with a model from a **different provider where possible** (e.g., produced by Claude/Anthropic, validated by Codex/OpenAI, or vice versa). Prefer cross-provider; a different model from the same provider is the fallback; same model is last resort. Record both — producer and validator — in the PR description, and note if cross-provider was not possible.
- Call out when a task requires a paid API call. State the cost estimate before incurring it.

---

## Communication
- Report blockers immediately. No silent workarounds.
- Surface uncertainty. State confidence level. No claims of certainty without a validated primary source.
- Objective language. No first-person pronouns. No apologies.

---

## Definition of Done
A task is done only when:
- [ ] All tests pass (`pnpm run validate` — runs `lint` + `typecheck` + `test`; or `pnpm test` for the suite alone).
- [ ] Formatter and linter pass with no errors (`pnpm run lint`, `pnpm run typecheck`).
- [ ] PR opened with problem statement, approach, and test evidence.
- [ ] Non-trivial decisions logged in `.logs/decisions/` per `.claude/history.md`.
- [ ] Validation pass by a separate model — cross-provider (Claude ↔ Codex) where possible — recorded in the PR description as `Validation:` producer model + validator model + verdict (note if cross-provider was not possible).
- [ ] GitHub Issue (system of record) updated to done with link to PR/commit.

> Note: CI (`.github/workflows/publish.yml`) runs only on push to `main`, not on PRs. Local `pnpm run validate` is the gate before opening a PR.

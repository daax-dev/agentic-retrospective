# Skills Best-Practices Conformance Plan

**Reference**: [Skill authoring best practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices)
**Scope**: Audit + remediate the two skills shipped in this repo.
**Branch**: `skills-best-practices`

---

## In-Repo Skills

| Path | Current state |
|------|---------------|
| `skills/retrospective/SKILL.md` | 65 lines. Shows sub-commands, metrics, output sections. |
| `skills/claude-best-practices/SKILL.md` | 34 lines. Instructs `Run: agentic-retrospective audit`; does not reference `scripts/audit.sh`, so the skill doc and script are currently out of sync (the CLI has no `audit` subcommand). |
| `skills/claude-best-practices/scripts/audit.sh` | 57-line bash script; checks for CLAUDE.md, `.claude/`, hooks.json, settings.json. |
| `AGENTSKILLS.md` (repo root) | 60-line doc. **Duplicates** retrospective SKILL.md with a different `description` and extra sub-commands. |

---

## Audit Against Best Practices

Checked against the doc's §"Checklist for effective Skills".

### `skills/retrospective/SKILL.md`

| Check | Status | Notes |
|-------|--------|-------|
| Description is specific + includes key terms | ⚠️ | "Evidence-based sprint retrospectives with objective metrics from git, GitHub, and decision logs." Good subject, missing explicit "when to use". |
| Description includes when-to-use trigger | ❌ | Add: "Use when the user asks to run a sprint retrospective, analyze commit/PR patterns over a period, or review decision-log quality." |
| Third-person descriptions | ✅ | Already third-person. |
| Body under 500 lines | ✅ | 65 lines. |
| Reference files one level deep | ✅ | No references currently. |
| No time-sensitive info | ✅ | |
| Consistent terminology | ⚠️ | "retrospective" is consistent; "sub-commands" vs listing them as flags/subcommands inconsistently. |
| Examples concrete | ⚠️ | Sub-command examples use `npx agentic-retrospective …`; `setup` shows raw `mkdir` instead of a real command. |
| No Windows paths | ✅ | |
| Valid name (lowercase, hyphens, no reserved words) | ✅ | `retrospective`. Could be gerund form (`running-retrospectives`) but not required. |
| Single `name` + `description` in frontmatter | ✅ | |
| `invocation` field | ⚠️ | Uses `invocation: /daax:retrospective` — non-standard frontmatter key; confirm whether Claude Code supports it or drop it. |

### `skills/claude-best-practices/SKILL.md`

| Check | Status | Notes |
|-------|--------|-------|
| Description specific + when-to-use | ❌ | "Audit your Claude Code configuration against official Anthropic best practices." Second person ("your"). Missing when-to-use trigger. |
| Third person | ❌ | "your" → rewrite. |
| Body concise | ✅ | 34 lines. |
| Execution intent clear | ⚠️ | Says `Run: agentic-retrospective audit` but the CLI has no `audit` subcommand in `src/cli.ts`. The actual script is `skills/claude-best-practices/scripts/audit.sh`. **Broken.** |
| Scripts solve, don't punt | ⚠️ | `audit.sh` only checks file existence. Doesn't enforce the actual best-practices listed in the skill body (CLAUDE.md size > 500, skill versioning). |
| No "voodoo constants" | N/A | |
| Name is descriptive, not reserved | ✅ | `claude-best-practices`. |
| Imperative "Execute immediately" is consistent with low-freedom task | ✅ | Appropriate for an audit. |

### Duplication: `AGENTSKILLS.md` vs `skills/retrospective/SKILL.md`

`AGENTSKILLS.md` at the repo root is effectively a second skill manifest with a different `description` field. This creates two sources of truth. Best-practices doc is explicit: "Each Skill has exactly one description field. The description is critical for skill selection."

**Resolution**: Pick one location. If `AGENTSKILLS.md` is required by a tool we use, make it regenerate from `skills/retrospective/SKILL.md` or import-by-reference. Otherwise, delete it and rely on `skills/retrospective/SKILL.md`.

---

## Remediation

### Change 1 — Rewrite `skills/retrospective/SKILL.md` description

```yaml
---
name: retrospective
description: Generates evidence-based sprint retrospectives from git history, GitHub PRs, and decision logs. Use when the user asks to run a retrospective, review a sprint, analyze commit or PR patterns over a period, or audit decision-log quality.
---
```

### Change 2 — Rewrite `skills/claude-best-practices/SKILL.md`

Fix third-person voice, correct the execution command, add when-to-use.

```markdown
---
name: claude-best-practices
description: Audits a Claude Code project's CLAUDE.md, hooks, settings, and skills against Anthropic's published best practices. Use when the user asks to audit their Claude Code setup, validate CLAUDE.md, or check skill compliance before a retrospective.
---

# Claude Best Practices Audit

Execute immediately. Do not ask for confirmation.

Run: `bash skills/claude-best-practices/scripts/audit.sh`

## What It Checks

- Presence and structure of `CLAUDE.md`
- CLAUDE.md size (warn above 500 lines, per Anthropic skill guidance)
- `.claude/` layout, hooks.json, settings.json
- Skill frontmatter (`name`, `description`) across `skills/*/SKILL.md`
- Description quality: third person, includes when-to-use, non-empty

## Output

- **Errors**: blocking issues — e.g., missing CLAUDE.md
- **Warnings**: recommended improvements — e.g., SKILL.md body over 500 lines
- **Info**: informational signals — e.g., detected hook configurations

## When To Use

- Before conducting a retrospective
- After major CLAUDE.md changes
- When onboarding a new project
- Periodically, to catch drift
```

### Change 3 — Upgrade `scripts/audit.sh` to enforce best-practices

Add checks that actually match the claims in the SKILL.md body:

```bash
# New checks to add:
# 1. CLAUDE.md line count > 500 → warning
# 2. For each skills/*/SKILL.md:
#    - frontmatter parses (has ---)
#    - has `name:` field, lowercase + hyphens, ≤ 64 chars
#    - has `description:` field, non-empty, ≤ 1024 chars
#    - description does not contain "I " or "you" (third-person check)
#    - SKILL.md body line count ≤ 500 (excluding frontmatter)
# 3. Warn if AGENTSKILLS.md exists alongside skills/*/SKILL.md (duplication risk)
```

Wire the script so it exits non-zero on errors and zero on warnings/info (preserve current behaviour).

### Change 4 — Resolve `AGENTSKILLS.md` duplication

Two options — pick one based on whether Claude Code requires `AGENTSKILLS.md`:

1. **Delete** `AGENTSKILLS.md`; update any reference in `README.md` / `plugin.json` to point at `skills/retrospective/SKILL.md`.
2. **Regenerate** `AGENTSKILLS.md` from `skills/retrospective/SKILL.md` via a small script; add a CI check that they stay in sync.

The agent running this branch should inspect `plugin.json` and `README.md` to determine which option is safe, and prefer **delete** unless tooling requires it.

### Change 5 — Drop the `invocation:` frontmatter key if unsupported

Anthropic's schema for SKILL.md defines only `name` and `description`. `invocation: /daax:retrospective` appears to be a Claude Code convention. Verify in the Claude Code docs; if it's not part of the supported schema, remove it to avoid parser warnings.

### Change 6 — Add missing reference files if any section exceeds 500 lines

Not currently a problem (both are under 100 lines) but document the pattern so future contributors know when to split.

Add to the audit script a line-count check on each SKILL.md body.

### Change 7 — Evaluation harness (stretch)

Per best-practices §"Build evaluations first", add three evaluation scenarios under `skills/retrospective/evaluations/`:

```json
{"skills": ["retrospective"], "query": "Run a retrospective for the last 2 weeks", "expected_behavior": ["Invokes agentic-retrospective CLI", "Produces docs/retrospectives/YYYY-MM-DD/retrospective.md"]}
{"skills": ["retrospective"], "query": "Show me which PRs got superseded last sprint", "expected_behavior": ["Uses GitHub analyzer", "Reports supersession rate"]}
{"skills": ["retrospective"], "query": "How many decisions were agent-initiated this sprint?", "expected_behavior": ["Reads decision logs", "Reports agent vs human actor counts"]}
```

These are documentation only until an evaluation runner exists; they make skill intent explicit.

---

## Acceptance Criteria

- [ ] `skills/retrospective/SKILL.md` description rewritten to include when-to-use trigger; passes third-person check.
- [ ] `skills/claude-best-practices/SKILL.md` rewritten to third person, fixed execution command, includes when-to-use.
- [ ] `scripts/audit.sh` parses every `skills/*/SKILL.md` frontmatter and reports:
  - missing/invalid `name`
  - missing `description`
  - first/second-person pronouns in `description`
  - body line count > 500
- [ ] `scripts/audit.sh` exits 0 for current repo after Changes 1–2 land.
- [ ] `AGENTSKILLS.md` decision is made and applied (delete or regenerate).
- [ ] `invocation:` frontmatter is verified and either kept or removed consistently across skills.
- [ ] Three evaluation stubs added under `skills/retrospective/evaluations/` (or documented why skipped).

---

## Validation

```bash
bash skills/claude-best-practices/scripts/audit.sh .
# Expected: Errors: 0

# Re-lint the repo
pnpm run validate
```

Manual smoke: load the skills via Claude Code (`/retrospective`) and confirm discoverability still works.

---

## Out of Scope

- Rewriting the retrospective skill into progressive-disclosure multi-file layout. Current 65-line body is well under the 500-line threshold.
- Building a full evaluation runner. Three scenarios documented is enough for this pass.
- Changes to `plugin.json` beyond what's needed to resolve the `AGENTSKILLS.md` decision.

## References

- [Skill authoring best practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices)
- `skills/retrospective/SKILL.md`
- `skills/claude-best-practices/SKILL.md`
- `skills/claude-best-practices/scripts/audit.sh`
- `AGENTSKILLS.md` (duplication source)
- `plugin.json`

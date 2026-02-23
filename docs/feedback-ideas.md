# Agentic Retrospective — Feedback & Feature Ideas

*Collected: 2026-02-23 | Source: JP feedback session*

> **Guiding principle:** Keep the core sharp. Optional depth via flags for teams that want it. Nothing forced on the default run.

---

## Idea 1: Churn Root Cause Classification

**Origin:** Q — Can the tool look at requirements and assess whether churn is due to poor requirements, poor interpretation, or poor test crafting?

### Problem
Currently the tool surfaces *that* churn happened — high rework rate, superseded PRs, fix chains — but not *why*. Two teams can both show 75% rework rate for completely different reasons: one has an unclear product spec, the other has an agent that doesn't test before pushing. The current output treats them identically.

### Idea
Add an optional `--with-issues` flag that, when enabled, attempts to cross-reference churn against available context (GitHub Issues, Linear exports, or a local spec file) and classifies the likely root cause.

### Churn Attribution Categories
| Category | Signal |
|----------|--------|
| `requirement_ambiguity` | PR scope significantly differs from linked issue scope |
| `scope_creep` | Commits added unrelated files not mentioned in issue |
| `poor_test_coverage` | Fix chains on features with no test commits |
| `interpretation_drift` | Decision logs show mid-stream clarification requests |
| `upkeep_churn` | Chore/patch commits dominating a file hotspot |

### Plan
1. Gate behind `--with-issues` flag — off by default, no noise for teams not using it
2. **Phase 1 (GitHub Issues):** For each PR, look up linked issue via `gh issue view`. Compare issue title/body keywords to changed file paths and commit messages. Heuristic classification — no LLM required.
3. **Phase 2 (Decision logs):** Scan `.logs/decisions/` for entries tagged `clarification` or `scope-change`. Correlate by date to surrounding commits.
4. **Phase 3 (LLM-assisted, optional):** If `--llm` flag set and API key present, use a single structured prompt to classify ambiguous cases. Always show raw evidence alongside classification.
5. Output: new `### Churn Attribution` section in report, only present when flag is active.

### Scope Guard
No Jira integration. No requirement management. The tool reads what's already there (issues, logs) — it does not become a requirements tool.

---

## Idea 2: Upkeep / Maintenance as a First-Class Metric

**Origin:** Q — Does "fixes" in the README include upkeep like library patching, updating to new library signatures, etc.?

### Problem
The README says the tool "distinguishes fixes vs features" — but this is misleading. Conventional commits include `chore:` (maintenance, lib updates, config) and `refactor:` as distinct categories. Currently these are either silently bucketed or underreported. A team doing heavy dependency upkeep looks like they're doing nothing, when they're actually doing necessary engineering work.

### Idea
Promote `chore` and `refactor` to explicit metric categories. Add an "Upkeep Ratio" metric that shows what percentage of total work is maintenance vs. building.

### Updated Commit Breakdown
```
| Type     | Count | % of Total | Notes                          |
|----------|-------|------------|-------------------------------|
| feat     | 41    | 10.8%      | New capabilities               |
| fix      | 227   | 59.7%      | Bug corrections                |
| chore    | 68    | 17.9%      | Lib updates, patching, config  |
| refactor | 24    | 6.3%       | Code restructuring             |
| test     | 6     | 1.6%       | Test additions                 |
| docs     | 14    | 3.7%       | Documentation                  |
```

### New Metric: Upkeep Ratio
```
Upkeep Ratio: 22.6% (chore + refactor / total)
Threshold: >40% upkeep may indicate tech debt burden
```

### Plan
1. Update commit parser to explicitly track `chore:` and `refactor:` separately — they are already in the conventional commit spec, just not surfaced
2. Add `Upkeep Ratio` to Executive Summary table
3. Add threshold alert: if upkeep >40% of commits, flag as "High maintenance burden — consider tech debt sprint"
4. **Update README** to accurately describe all six categories, not just "fixes vs features"
5. No flag needed — this is a core fix, not a new feature

### Effort
Small — 2–4 hours. Mostly parser update + README rewrite.

---

## Idea 3: Engineering Maturity Pre-requisites & Setup Doctor

**Origin:** S — What are the pre-requisites in terms of engineering ritual maturity to adopt this? Many teams (banks, legacy orgs) still on gigantic PRs, end-of-sprint merge hell, no daily small changesets.

### Problem
The tool implicitly assumes a modern engineering workflow: small PRs, conventional commits, branch-based development. A team doing one massive fortnightly PR will get technically correct but practically meaningless metrics. There's no guidance on what's needed, what's optional, and how to evolve.

### Idea — Two Parts

#### Part A: Prerequisites Documentation
A clear `PREREQUISITES.md` (also summarized in README) that defines the adoption tiers honestly.

| Tier | What You Need | What You Get |
|------|--------------|-------------|
| **1 — Baseline** | Any git history | Code hotspots, commit volume, reactive vs. proactive ratio |
| **2 — PR Workflow** | Branch-based PRs | Rework rate, supersession, review cycle time |
| **3 — Commit Discipline** | Conventional commits (`feat:` / `fix:` etc.) | Full commit classification, upkeep ratio |
| **4 — Full Telemetry** | Decision logs + session feedback | Decision quality, testing discipline, alignment scores |

Include a section: "If your team is on Tier 1 today, here's the 30-day path to Tier 2."

#### Part B: `agentic-retrospective check` Subcommand
A lightweight setup doctor that scans the repo and reports what's available.

```bash
$ agentic-retrospective check

✅  Git history found (380 commits)
✅  GitHub CLI configured
⚠️  No conventional commits detected (< 10% have type prefix)
     → Run: npx commitlint to enforce going forward
❌  No decision logs (.logs/decisions/ missing)
     → See docs/setup.md to enable
❌  No feedback logs (.logs/feedback/ missing)
     → Run: agentic-retrospective feedback after each session

Tier: 2 (PR Workflow)
Metrics available: hotspots, rework rate, review cycles
Metrics unavailable: commit classification, decision quality, alignment
```

### Plan
1. **`PREREQUISITES.md`** — write the tiered adoption doc, link from README. Estimated 1–2 hours.
2. **`check` subcommand** — new command that runs a series of probes:
   - Git present + commit count
   - Conventional commit % (sample last 50 commits)
   - `gh` CLI available and authed
   - `.logs/` directories exist and populated
   - Outputs tier assessment + list of what's enabled/missing + remediation hints
3. Suppress "no data" warnings in main report for metrics not available at the team's tier — replace with a single line: "Run `agentic-retrospective check` to see what's needed to unlock this metric."
4. No `--tier` flag needed — the check command + graceful degradation covers it

### Why This Matters for Enterprise Sales
Banks and legacy orgs are exactly the target market for this kind of tooling. If the first thing they see is "your rework rate is undefined because you don't have PRs," they'll bounce. If instead they see "you're at Tier 1, here's your 30-day path to meaningful metrics," that's a conversation starter.

---

## Notes

- **Sniffy feedback** — *[to be added — share that session context and I'll fold it in]*
- All three ideas above follow the guiding principle: optional depth, nothing forced on the default run
- Ideas 1 and 3B are new features; Idea 2 and 3A are docs + fixes
- Suggested priority: **2 (quick fix) → 3A (docs) → 3B (check command) → 1 (requires more scoping)**

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

---

## Ideas from Sniffly ([chiphuyen/sniffly](https://github.com/chiphuyen/sniffly))

*Sniffly is a Claude Code analytics dashboard by Chip Huyen. It reads raw session logs from `~/.claude/projects/` and shows usage patterns, error breakdowns, and message history in a local web UI.*

**Key distinction:** Sniffly looks *inside* agent sessions (what the agent did, what failed, token usage). Agentic-retrospective looks at *outputs* (what was committed, merged, decided). They're complementary — together they close the full loop.

---

### Idea 4: Session Log Integration (Tool Error Pattern Analysis)

**Origin:** Sniffly's "Error Breakdown" — where Claude Code makes mistakes.

### Problem
Agentic-retrospective can tell you the rework rate is 75% but can't tell you *what kind of agent behavior* caused it. Were sessions chaotic and error-prone? Did the agent retry the same tool call 10 times? That context is sitting in `~/.claude/projects/` logs already — we just don't read it.

### Idea
Add optional session log analysis via `--with-sessions` flag. Parse Claude Code JSONL logs to extract:

| Signal | What It Tells You |
|--------|------------------|
| Tool error rate | How often agent hits failures per session |
| Retry chains | Same tool called repeatedly — agent stuck in a loop |
| Session length | Long sessions → complex tasks or confused agent? |
| Session-to-commit ratio | How many commits came out of each session |
| Error-to-fix correlation | Sessions with high errors → more fix commits? |

### Plan
1. Gate behind `--with-sessions` flag — off by default
2. Auto-detect `~/.claude/projects/` (same as Sniffly does)
3. Correlate sessions to commits by timestamp — session ends at T, commits within the next hour are attributed to it
4. New report section: `### Agent Session Quality` — error rates, retry patterns, avg commits per session
5. Key insight: "Sessions with >10 tool errors produce 2.3x more fix commits" — this closes the loop between session behavior and output quality
6. No web UI — keep it markdown report output, consistent with current design

### Scope Guard
We don't replicate Sniffly's dashboard. We extract *correlations* between session behavior and git output. Sniffly shows you what happened in a session; we show you what that session produced and whether it was good.

---

### Idea 5: Sprint Trend Analysis (Historical Comparison)

**Origin:** Sniffly has date range filtering. Agentic-retrospective is currently one-shot.

### Problem
A single retrospective tells you where you are. It doesn't tell you if you're getting better or worse. A team that just did a transformation sprint wants to see the trajectory, not just the snapshot.

### Idea
Add a `--compare` mode that runs analysis across multiple date ranges and shows trend lines.

```bash
# Compare last 4 sprints (2 weeks each)
agentic-retrospective --compare --periods 4 --period-length 2w

# Compare specific refs
agentic-retrospective --compare --from v1.0 --to v1.4
```

**Output:**
```
### Sprint Trend (Last 4 Sprints)

| Metric              | Sprint 1 | Sprint 2 | Sprint 3 | Sprint 4 | Trend |
|---------------------|----------|----------|----------|----------|-------|
| Rework Rate         | 75%      | 68%      | 61%      | 54%      | ↓ ✅  |
| Testing Discipline  | 2%       | 5%       | 8%       | 14%      | ↑ ✅  |
| Upkeep Ratio        | 18%      | 22%      | 31%      | 38%      | ↑ ⚠️  |
| Decision Quality    | 78%      | 80%      | 79%      | 83%      | ↑ ✅  |
```

### Plan
1. Each retrospective already outputs `retrospective.json` with structured metrics
2. `--compare` mode reads past JSON reports from `docs/retrospectives/` directory
3. Computes trend direction (improving/degrading/stable) per metric
4. Threshold: flag if a metric degrades 2+ consecutive sprints
5. No new data collection needed — just aggregation of existing outputs

### Effort
Medium — 1–2 days. All the data already exists in the JSON outputs.

---

### Idea 6: Shareable Report Output

**Origin:** Sniffly's "Share" button — generates a link to share stats with coworkers.

### Problem
Retrospective reports are currently local markdown files. Useful for individuals; harder to share with a team or stakeholder who isn't in the repo.

### Idea
Add `agentic-retrospective share` subcommand that generates a self-contained static HTML report — no server needed, no external upload, no data leaves the machine.

```bash
agentic-retrospective share
# → Generated: docs/retrospectives/retrospective-2026-02-23/report.html
# → Drop this file anywhere to share it
```

Or optionally: `--gist` flag to post anonymized JSON to a GitHub Gist (opt-in, explicit).

### Plan
1. Add HTML template (single file, inline CSS) that renders the same tables/sections as the markdown report
2. `share` subcommand: takes most recent (or specified) retrospective JSON, renders to HTML
3. Default: local file only — zero network calls
4. Optional `--gist` flag: posts the JSON to a GitHub Gist via `gh` CLI (requires gh auth)
5. No analytics dashboard, no hosted service — stays consistent with the tool's local-first philosophy

### Scope Guard
We are not building a Sniffly-style web dashboard. One-shot HTML export only. The core tool stays CLI.

---

### Key Differentiator vs Sniffly

| Dimension | Sniffly | Agentic Retrospective |
|-----------|---------|----------------------|
| Data source | Claude Code session logs | Git, PRs, decision logs |
| Lens | Inside the session (behavior) | Outside the session (output quality) |
| Output | Web dashboard (persistent) | Point-in-time report (markdown + JSON) |
| Audience | Individual developer | Team / engineering lead |
| Sharing | Hosted dashboard links | Local HTML or Gist |
| Cadence | Ongoing / continuous | Per sprint |

**The play:** These two tools are better together. A future integration idea (post-MVP) — Sniffly exports a session quality JSON, agentic-retrospective ingests it. You get the full picture: "bad session behavior → bad output quality → here's the causal chain."

---

## Notes

- All ideas follow the guiding principle: optional depth, nothing forced on the default run
- Ideas 2 and 3A are quick fixes/docs; others are real feature work
- Suggested priority: **2 (quick fix) → 3A (docs) → 3B (check command) → 5 (trend, data already exists) → 6 (share HTML) → 4 (session logs) → 1 (requires most scoping)**

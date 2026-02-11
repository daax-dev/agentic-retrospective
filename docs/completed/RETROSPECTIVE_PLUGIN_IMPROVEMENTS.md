# Retrospective Plugin Improvement Feedback

**Date:** 2026-02-11
**Plugin:** daax:retrospective v1.0.3
**Feedback Type:** Critical - Complete Rewrite Required
**Severity:** High

---

## Problem Statement

The initial `npx agentic-retrospective` implementation produced **AI slop with zero substance**.

### User Feedback (Direct Quote)

> "no this seems to be missing details based on all the git information, this seems very hand wavy with little substance (pretty shit), i want OBJECTIVE details, what did we noticed, PRs from github? how much rework? do we have tests? does agent follow a closed testing loop? what % of the time. how good are prompts? was there misunderstanding? what worked? what didn't. i got exactly ZERO value from this retrospective, seems like AI SLOP with no substance."

---

## What Was Wrong (v1)

### The Bad Implementation

The original script only:
- ✗ Counted tool invocations (e.g., "Bash: 67.2%")
- ✗ Read decision logs and summarized vaguely
- ✗ Provided generic "insights" like "58 tool invocations across 7 different tools"
- ✗ Made hand-wavy recommendations without data
- ✗ **No git analysis**
- ✗ **No PR data from GitHub**
- ✗ **No testing metrics**
- ✗ **No concrete patterns or percentages**

### Example of AI Slop Output

```
### Tool Usage

**Observation:** 58 total tool invocations across 7 different tools

**Top Tools:** Bash (39), Glob (6), Read (4), Grep (3), Skill (3)
```

**This is useless.** Who cares how many times Bash was called?

---

## What's Required (v2)

### The Good Implementation

A retrospective MUST provide **OBJECTIVE, EVIDENCE-BASED METRICS**:

1. **Git History Analysis**
   - Parse `git log` for commit patterns
   - Breakdown by type: feat/fix/docs/test/refactor/chore
   - Count checkpoint commits
   - Identify reactive vs proactive work

2. **PR Analysis from GitHub**
   - Use `gh pr list` and `gh pr view` to get REAL PR data
   - Calculate rework rate (% PRs superseded)
   - Track which PRs superseded which (parse PR bodies)
   - Count PRs with test files (check `files` array for test/spec)
   - Identify PRs with negative reviews

3. **Testing Loop Discipline**
   - Scan decision logs for evidence of testing
   - Calculate % of decisions that mention testing
   - Identify patterns: "test passed", "test failed", "ran tests"
   - Flag when testing is NOT mentioned

4. **Prompt Quality Analysis**
   - Parse `.logs/prompts/*.jsonl`
   - Categorize prompts (implementation, fixes, testing, review)
   - Count clarification requests (indicates misunderstanding)

5. **Decision Quality Assessment**
   - Calculate % with rationale
   - Calculate % with context
   - Calculate % with both (quality score)
   - Identify documented mistakes and corrections

6. **What Worked / What Didn't**
   - Concrete observations backed by percentages
   - Example: "75% rework rate indicates poor initial quality"
   - Example: "2% testing discipline - agent not testing before push"

7. **Actionable Recommendations**
   - Current state with metrics
   - Target state with metrics
   - Concrete actions to improve

---

## Real Output After Fix

### Executive Summary (Example)

| Metric | Value |
|--------|-------|
| Total Commits | 380 |
| Total PRs | 20 |
| PRs Merged | 3 |
| **PRs Superseded (Rework)** | **15 (75.0%)** |
| PRs with Tests | 11/20 (55.0%) |
| **Testing Loop Adherence** | **2.0%** |
| Decision Quality Score | 78.0% |

### Key Findings

**CATASTROPHIC REWORK RATE: 75%**
- 15 out of 20 PRs were superseded
- PR #433 went through 7 iterations (v1-v7)
- Some PRs superseded 13+ previous PRs

**TESTING DISCIPLINE: 2%**
- Only 1 out of 50 decisions mention testing
- Agent is NOT testing before push
- 0 checkpoint commits

**COMMIT BREAKDOWN:**
- 59.7% are FIXES (227/380) - reactive work
- Only 1.6% test commits (6/380)
- Only 10.8% features (41/380)

---

## Implementation Details

### Required Data Sources

1. **Git CLI**
   ```bash
   git log --since="30 days ago" --pretty=format:"%H|%an|%ae|%at|%s" --no-merges
   ```

2. **GitHub CLI**
   ```bash
   gh pr list --state all --limit 100 --json number,title,state,createdAt,reviews
   gh pr view <number> --json body,files,commits,additions,deletions
   ```

3. **Decision Logs**
   - Parse `.logs/decisions/*.jsonl`
   - Extract rationale, context, mistakes, corrections

4. **Prompt Logs**
   - Parse `.logs/prompts/*.jsonl` (if exists)

5. **Tool Logs**
   - Parse `.logs/tools/*.jsonl` (minimal use, low priority)

### Required Metrics

- **Rework Rate:** `(superseded PRs / total PRs) * 100`
- **Test Coverage:** `(PRs with test files / total PRs) * 100`
- **Testing Loop Adherence:** `(decisions mentioning testing / total decisions) * 100`
- **Decision Quality Score:** `(decisions with both rationale + context / total) * 100`

---

## Lessons Learned

### Golden Rules for Retrospectives

1. **NO VAGUE OBSERVATIONS**
   - Every claim MUST have a percentage, count, or concrete example
   - "Agent used many tools" ❌
   - "Agent created 15 superseded PRs (75% rework rate)" ✅

2. **GIT AND GITHUB ARE SOURCE OF TRUTH**
   - Don't just read logs and summarize
   - Parse actual git history and PR data
   - Count real files, commits, reviews

3. **FOCUS ON WHAT MATTERS**
   - Rework rate (quality)
   - Testing discipline (inner loop health)
   - Commit patterns (reactive vs proactive)
   - NOT tool invocation counts

4. **ACTIONABLE RECOMMENDATIONS**
   - Current: "2% testing discipline"
   - Target: "90% testing discipline"
   - Action: "Log test results in decision log, use checkpoint commits"

5. **WHAT WORKED / WHAT DIDN'T**
   - Use thresholds: >70% good, <50% bad
   - Provide context: "75% rework rate indicates poor initial quality"

---

## Plugin Maintainer Action Items

1. **Update SKILL.md**
   - Document that this tool provides objective, evidence-based analysis
   - List metrics it calculates
   - Show example output

2. **Default Implementation**
   - Ship with the evidence-based version (scripts/retrospective.js)
   - Require git and gh CLI
   - Document dependencies

3. **Add to Plugin README**
   - Explain what makes a good retrospective
   - Show before/after examples
   - Emphasize "no AI slop, objective metrics only"

4. **Consider Additional Metrics**
   - CI failure rate (from gh workflow data)
   - Time between commits (cadence analysis)
   - Lines changed per PR (scope creep)
   - Review turnaround time

---

## Verification

Run the updated tool:

```bash
npx agentic-retrospective
```

Check output at: `.logs/retrospectives/retro-YYYY-MM-DD-HHMMSS.md`

Expected sections:
- Executive Summary (table with 10+ metrics)
- Git Commit Analysis (breakdown by type)
- PR Analysis (rework rate, superseded PRs, test coverage)
- Testing Loop Discipline (adherence %)
- Mistakes & Corrections
- What Worked / What Didn't (with thresholds)
- Concrete Recommendations (current → target)

---

## Conclusion

**The first version was AI slop. The second version is evidence-based.**

The difference: **Objective data from git and GitHub, not vague tool counts.**

Users need ACTIONABLE insights to improve their workflow. Give them percentages, thresholds, and concrete examples—not generic observations.

---

*Feedback logged: 2026-02-11*

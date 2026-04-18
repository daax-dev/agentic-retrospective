# Issue #18 Implementation Plan

**Issue**: [daax-dev/agentic-retrospective#18 — Feature suggestions from a real-world automated integration](https://github.com/daax-dev/agentic-retrospective/issues/18)
**Scope**: Three independent fixes — trend tracking, evidence_refs validation warning, adapter docs.
**Branch**: `18-feature-integration-suggestions`
**Derived from**: [`docs/updates.md`](../updates.md) §"Fix Plan: Issue #18"

---

## Objective

Deliver three small, independently testable improvements reported by @DMokong while running v0.1.3 headless:

1. **18-A**: Persist per-run score snapshots to enable multi-sprint trend detection.
2. **18-B**: Emit a warning when `evidence_refs` contain entries with no recognized prefix (currently silently orphaned).
3. **18-C**: Document the `commit:<hash>` `evidence_refs` format and how to correlate issue-tracker records.

All three can ship in a single PR since they share the same contributor request, but each has its own acceptance criteria.

---

## Fix 18-A: Multi-Sprint Trend Tracking

### Files

| File | Change |
|------|--------|
| `src/types.ts` (after line 507, `RetroConfig`) | Add `SprintHistoryEntry` interface |
| `src/runner.ts` line 8 | Add `appendFileSync` to fs destructure |
| `src/runner.ts` inside `writeOutputs()` (near line 1086) | Add private `appendToHistory(report)` and invoke it |

### New type (`src/types.ts`)

```typescript
export interface SprintHistoryEntry {
  sprint_id: string;
  date: string;               // ISO 8601
  scores: Scores;
  data_completeness: number;  // 0–100 percentage
}
```

### New method (`src/runner.ts`)

```typescript
private appendToHistory(report: RetroReport): void {
  const historyPath = join(this.config.outputDir, '.retro-history.jsonl');
  const entry: SprintHistoryEntry = {
    sprint_id: report.sprint_id,
    date: report.generated_at,
    scores: report.scores,
    data_completeness: report.data_completeness.percentage,
  };
  appendFileSync(historyPath, JSON.stringify(entry) + '\n', 'utf8');
}
```

Call site: inside `writeOutputs()` immediately after the markdown write, before `return outputPath`.

### Location rationale

`writeOutputs()` writes per-sprint output to `join(this.config.outputDir, this.config.sprintId)` (see `src/runner.ts:1056`). `outputDir` itself is therefore the parent of every sprint-specific directory, and is the natural location for a cross-sprint history file: `<outputDir>/.retro-history.jsonl`. No need for `..` path traversal.

### Acceptance criteria

- [ ] `SprintHistoryEntry` exported from `src/types.ts`.
- [ ] First run creates `<outputDir>/.retro-history.jsonl` with exactly one JSONL line.
- [ ] Second run with a different `sprint_id` appends a second line; file still valid JSONL.
- [ ] `--json` mode still writes history (silent).
- [ ] `--quiet` mode still writes history.
- [ ] Existing single-run tests still pass unchanged.

### Tests (`test/history.test.ts` — new file)

```
describe('sprint history', () => {
  it('creates history file on first run', async () => { /* ... */ });
  it('appends entry on each run', async () => { /* two runs → two lines */ });
  it('entry is valid JSON with required fields', async () => { /* ... */ });
});
```

Mock `appendFileSync` via vitest `vi.mock('fs', ...)` OR use a tmp `outputDir` and read the real file.

---

## Fix 18-B: Evidence-Refs Validation Warning

### Root cause

`src/runner.ts:625–685` — `buildEvidenceMap()` only links refs matching `/commit:(\w+)/`. Two silent failure modes:

1. Any prefix other than `commit:` produces no link and no warning.
2. The regex `\w+` captures a hash of any length, but the lookup `map.commits[match[1]]` requires an **exact** match against the full 40-char hash indexed at line 638. Short hashes (e.g., `commit:a1b2c3d`) never match even when the commit exists in the period.

### Files

| File | Change |
|------|--------|
| `src/runner.ts:625` (`buildEvidenceMap`) | Add unknown-prefix detection + warning, short-hash index, TelemetryGap |

### Implementation

```typescript
private buildEvidenceMap(data: CollectedData): EvidenceMap {
  const VALID_PREFIXES = ['commit:', 'decision:', 'pr:', 'file:', 'inferred:'];
  const unrecognizedRefs: string[] = [];

  // Short-hash → full-hash index so `commit:a1b2c3d` resolves correctly.
  const shortHashIndex = new Map<string, string>();
  if (data.git?.commits) {
    for (const c of data.git.commits) {
      for (let len = 7; len <= Math.min(12, c.hash.length); len++) {
        shortHashIndex.set(c.hash.slice(0, len), c.hash);
      }
    }
  }

  if (data.decisions?.records) {
    for (const decision of data.decisions.records) {
      for (const ref of (decision.evidence_refs || [])) {
        if (!VALID_PREFIXES.some(p => ref.startsWith(p))) {
          unrecognizedRefs.push(`decision ${decision.id || '?'}: "${ref}"`);
        }
      }
    }
  }

  if (unrecognizedRefs.length > 0) {
    process.stderr.write(
      `[WARN] ${unrecognizedRefs.length} evidence_ref(s) have unrecognized format and will be orphaned:\n`
    );
    unrecognizedRefs.slice(0, 5).forEach(r => process.stderr.write(`  - ${r}\n`));
    process.stderr.write(
      '  Valid formats: commit:<hash>, pr:<number>, decision:<id>, file:<path>, inferred:<reason>\n'
    );
    this.addTelemetryGap({
      gap_type: 'unrecognized_evidence_refs',
      severity: 'medium',
      impact: `${unrecognizedRefs.length} evidence_refs have unrecognized format and will not link to any artifact`,
      recommendation:
        'Use prefixed formats: commit:<hash>, pr:<number>, decision:<id>, file:<path>. See docs/fixing-telemetry-gaps.md.',
    });
  }

  // ... existing map init continues. Replace:
  //   if (match && map.commits[match[1]]) {
  // with:
  //   const resolvedHash = shortHashIndex.get(match[1]) ?? match[1];
  //   if (match && map.commits[resolvedHash]) {
  //     map.commits[resolvedHash].decisions.push(id);
  //     map.decisions[id].commits.push(resolvedHash);
  //   }
}
```

### Output channel

Warnings go to **stderr** because `--json` routes stdout to consumers; interleaving warnings would corrupt machine-readable output.

### Acceptance criteria

- [ ] A decision with `evidence_refs: ["claw-abc", "ISSUE-123"]` produces a stderr warning listing both refs.
- [ ] A `TelemetryGap` with `gap_type: "unrecognized_evidence_refs"` is added to the report.
- [ ] The decision still appears in `orphans.decisions_without_implementation`.
- [ ] A decision with `evidence_refs: ["commit:a1b2c3d"]` (short hash) correctly resolves to the full hash when that commit exists in the analyzed period.
- [ ] A decision with `evidence_refs: ["commit:<full-40>"]` continues to work (no regression).
- [ ] `--json` stdout remains valid JSON — no warning bleed onto stdout.

### Tests (`test/evidence-map.test.ts` — extend or new)

```
describe('buildEvidenceMap evidence_refs validation', () => {
  it('warns on unrecognized prefix', () => { /* spy process.stderr.write */ });
  it('adds TelemetryGap for unrecognized refs', () => { /* ... */ });
  it('resolves short commit hashes to full hash', () => { /* ... */ });
  it('does not warn when all refs use valid prefixes', () => { /* ... */ });
  it('does not corrupt stdout under --json', () => { /* ... */ });
});
```

---

## Fix 18-C: Adapter Documentation

### File

`docs/fixing-telemetry-gaps.md` — append a new section (do not create a new file; users are already directed here for telemetry issues).

### Content to append

```markdown
## Linking Issue Tracker Records to Git Commits (evidence_refs)

The `evidence_refs` field links a decision to specific artifacts. Every ref must use a recognized prefix:

| Prefix | Format | Links to |
|--------|--------|----------|
| `commit:` | `commit:<full-or-short-hash>` | A git commit |
| `pr:` | `pr:<number>` | A GitHub pull request |
| `decision:` | `decision:<id>` | Another decision record |
| `file:` | `file:<relative-path>` | A source file |
| `inferred:` | `inferred:<reason>` | Marks inferred evidence (no artifact) |

### Correlating an Issue Tracker Record

To link a decision to the commit that resolves a Linear/Jira issue:

1. Find the git commit: `git log --oneline --grep="ISSUE-123"`
2. Use the commit hash in `evidence_refs`:

```json
{
  "ts": "2026-03-15T10:30:00Z",
  "decision": "Adopted optimistic locking for inventory updates",
  "rationale": "Reduces contention under concurrent write load",
  "evidence_refs": ["commit:a1b2c3d", "pr:47"]
}
```

**Common mistake**: Using raw issue IDs (`"ISSUE-123"`, `"claw-abc"`) directly. These have no recognized prefix and are silently orphaned. Always resolve to a `commit:` or `pr:` reference before logging.
```

### Acceptance criteria

- [ ] Section appended to `docs/fixing-telemetry-gaps.md` with the prefix table and a JSON example.
- [ ] Example decision record validates against `schemas/` decision schema (if one exists — verify).
- [ ] Markdown renders correctly on GitHub (no broken code fences).

---

## Rollout

| Priority | Fix | Effort | Risk |
|----------|-----|--------|------|
| 1 | 18-B (warning) | S | None — additive warning |
| 2 | 18-C (docs) | XS | None |
| 3 | 18-A (history) | M | Low — additive file write |

All three in one PR, each as a separate commit so they can be reverted independently.

## Validation

Before opening PR:

```bash
pnpm run validate   # lint + typecheck + test (per package.json)
pnpm run build      # confirms tsc passes
# Smoke test: run against this repo itself
node dist/cli.js --from HEAD~10 --output /tmp/retro-test
cat /tmp/retro-test/.retro-history.jsonl   # should show one line
```

## Out of Scope

- Trend detection algorithm (improving/declining/stable) — only persistence is in #18. Analysis/presentation of trends is a separate feature.
- Auto-migration of existing orphaned decision logs. Users keep existing logs; new runs surface warnings.
- Schema changes to `DecisionRecord`. `evidence_refs` remains `string[]`.

## References

- `src/runner.ts:625–685` — `buildEvidenceMap()` implementation
- `src/runner.ts:1055–1089` — `writeOutputs()` call site
- `src/types.ts:499–507` — `RetroConfig`
- `docs/fixing-telemetry-gaps.md` — adapter docs location
- [`docs/updates.md`](../updates.md) — source plan

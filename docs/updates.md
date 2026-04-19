# Update Plan: agentic-retrospective

**Date**: 2026-04-10  
**Scope**: Best-practices audit + fix plans for daax-dev/agentic-retrospective#18 and daax-dev/agentic-retrospective#19

---

## Executive Summary

This document covers three areas:

1. A best-practices audit of the current tool, including issues not yet filed as GitHub issues.
2. Fix plan for [#18 — Feature suggestions from a real-world automated integration](https://github.com/daax-dev/agentic-retrospective/issues/18).
3. Fix plan for [#19 — Multi-repo support for team retrospectives](https://github.com/daax-dev/agentic-retrospective/issues/19).

All findings are ranked by impact. All implementation decisions are logged below in JSONL format. References are cited inline and consolidated at the end.

---

## Best Practices Audit

### Gaps

#### BP-1: No tool-level configuration file

**Severity**: High

The tool has no persistent configuration file. `RetroConfig` (`src/types.ts:499–507`) is populated entirely from CLI flags passed on every invocation. There is no config file discovery, no defaults persistence, and no way to encode per-workspace settings such as sprint_id patterns, output directories, or multiple repo paths.

The `.github/ISSUE_TEMPLATE/config.yml` is an issue template configuration, not a tool config. The tool itself has no equivalent artifact.

**Best practice**: Any CLI tool with more than three recurring configuration parameters should support a config file discovered from the working directory. TOML, JSON, and YAML are all common choices; the issue #19 proposal uses `.retro.toml` to match the `daax-cli.toml` pattern already established in the org.

**Fix**: Addressed by issue #19 (see Phase 19-B).

---

#### BP-2: Hard-coded `process.cwd()` in analyzers

**Severity**: High

Both `GitAnalyzer` (`src/analyzers/git.ts:26–32`, `isGitRepository()`) and `GitHubAnalyzer` (`src/analyzers/github.ts`) execute `execSync` calls without a `cwd` option, implicitly using `process.cwd()`. This global state dependency means:

- Analyzers cannot be pointed at a different repository without forking a subprocess.
- Multi-repo analysis is architecturally impossible without process-level workarounds.
- Unit tests must manipulate `process.cwd()` or use temp dirs to test different repos.

**Best practice**: Analyzers should accept explicit paths rather than rely on implicit global state. Default to `process.cwd()` for backward compatibility.

**Fix**: Addressed by issue #19 (see Phase 19-C).

---

#### BP-3: Silent `evidence_refs` validation failure

**Severity**: Medium

`buildEvidenceMap()` in `src/runner.ts:657–665` only links refs matching the regex `/commit:(\w+)/`. Decision records with `evidence_refs` using any other format (e.g., raw issue IDs like `"claw-abc"`, `"ISSUE-123"`) are silently accepted by schema validation but produce orphaned evidence — their decisions never link to any commit.

The failure mode is invisible. Users see orphaned decisions in the evidence map but receive no diagnostic message explaining why.

**Best practice**: When input data matches a schema type but fails a format constraint, emit a warning at the point of first use. Silent data loss is a reliability anti-pattern in any analytics tool.

**Fix**: Addressed by issue #18, item 2 (see Fix 18-B).

---

#### BP-4: No cross-sprint trend tracking

**Severity**: Medium

Each run is fully standalone. The tool produces rich per-sprint scores across six dimensions (`src/types.ts:115–122`) but persists nothing between runs. Users cannot detect whether scores are improving, declining, or stable over time without manual record-keeping.

**Best practice**: Any analytics tool intended for recurring use (sprint-over-sprint) should maintain a lightweight history file enabling trend detection.

**Fix**: Addressed by issue #18, item 1 (see Fix 18-A).

---

#### BP-5: No PR-based CI workflow

**Severity**: Medium

`.github/workflows/publish.yml` runs only on push to `main`. There is no workflow that validates pull requests before merge. The existing `prepublishOnly` script runs `pnpm run build` and provides a partial safety net, but broken lint or test failures can reach `main` undetected.

**Best practice**: Every PR should be gated by CI running the full `pnpm run validate` (`lint + typecheck + test`) suite.

**Fix**: Add `.github/workflows/ci.yml` (see Standalone CI Improvement).

---

#### BP-6: Publish workflow triggers on any `package.json` change

**Severity**: Low

The publish trigger (`paths: ['package.json']`) fires on any `package.json` mutation — keyword edits, author changes, script additions — not just version bumps. The version-check step (`.github/workflows/publish.yml:44–54`) prevents duplicate publishes but the workflow still executes unnecessarily.

**Best practice**: Use `workflow_dispatch` with a version parameter, a tag-based trigger (`on: push: tags: ['v*']`), or restrict to the `version` field specifically.

---

#### BP-7: Missing adapter documentation for `evidence_refs` format

**Severity**: Medium

`docs/fixing-telemetry-gaps.md` documents decision logging thoroughly but does not explain the `commit:<hash>` requirement for `evidence_refs`. Users integrating external issue trackers (Linear, Jira) encounter the silent orphaning described in BP-3 with no documentation to guide them.

**Fix**: Addressed by issue #18, item 3 (see Fix 18-C).

---

#### BP-8: `RetroConfig` has no repo identity concept

**Severity**: High (blocks #19)

`RetroConfig` (`src/types.ts:499–507`) has no `repos` field, no `path`, and no `label`. It assumes single-repo, single-`process.cwd()` operation. Adding multi-repo support requires extending this type without breaking existing callers.

**Fix**: Addressed by issue #19 (see Phase 19-A).

---

#### BP-9: `analyzeSprit` typo in `runner.ts`

**Severity**: Low

`src/runner.ts:687` contains `analyzeSprit` (missing 'n'). This is a private method so it does not affect the public API, but it is a code quality issue.

**Fix**: Rename to `analyzeSprint` in the same PR as any other `runner.ts` changes.

---

### What Is Working Well

| Practice | Evidence |
|----------|----------|
| Graceful degradation | All sources optional except git; missing sources reduce confidence, not output. `memory/constitution.md:52–57` |
| Decision record validation | `DecisionAnalyzer.isValidRecord()` screens malformed records before analysis |
| Evidence linking architecture | `EvidenceMap` type (`src/types.ts:405–422`) provides a solid foundation for traceability |
| Blameless design | Constitutionally enforced (`memory/constitution.md:28–35`) |
| SLSA provenance | `npm publish --provenance` used in `.github/workflows/publish.yml:58` |
| TypeScript strict mode | Enforced via `tsconfig.json`; ESLint configured in `.eslintrc.json` |
| Publish version guard | Version check step prevents re-publishing the same version |
| Schema versioning | All JSON outputs include `metadata.schema_version` |

---

## Fix Plan: Issue #18

**Issue**: [Feature suggestions from a real-world automated integration](https://github.com/daax-dev/agentic-retrospective/issues/18)  
**Reporter**: DMokong (collaborator)  
**Filed**: 2026-03-22  
**Items**: Three distinct, independently releasable fixes.

---

### Fix 18-A: Multi-Sprint Trend Tracking

**Goal**: After each successful run, append a score snapshot to a persistent history file, enabling trend detection across sprints.

**Files to change**:

| File | Change |
|------|--------|
| `src/types.ts` | Add `SprintHistoryEntry` interface |
| `src/runner.ts` | Add `appendToHistory()`, call it from `writeOutputs()` |

**New type** (`src/types.ts`, after `RetroConfig`):

```typescript
export interface SprintHistoryEntry {
  sprint_id: string;
  date: string;               // ISO 8601
  scores: Scores;
  data_completeness: number;  // 0–100 percentage
}
```

**Implementation** (`src/runner.ts`, inside `writeOutputs()`):

```typescript
// appendFileSync: already in the runner.ts:8 fs destructure: { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync }
// → add appendFileSync to that destructure
// join: already imported at runner.ts:9

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

Call site in `writeOutputs()` (`src/runner.ts:1086`): add `this.appendToHistory(report);` after the markdown write, before `return outputPath`.

**History file location**: `join(outputDir, '.retro-history.jsonl')`. `writeOutputs()` writes per-sprint output to `join(this.config.outputDir, this.config.sprintId)` (`src/runner.ts:1056`), so `outputDir` itself is the parent of per-sprint directories — the correct home for a cross-sprint history file. No `..` path traversal into the caller's working directory.

**Compatibility**: Fully additive. No existing behavior changes. History file is created on first run.

**Testing**: Integration test that runs `runRetro()` (or the CLI) twice with different `sprintId` values against the same `outputDir`, then verifies `.retro-history.jsonl` contains exactly two lines with distinct `sprint_id` values.

---

### Fix 18-B: Evidence Refs Format Validation Warning

**Goal**: When `evidence_refs` contain entries with no recognized prefix, emit a warning to stderr (to avoid corrupting `--json` stdout) and record a `TelemetryGap`.

**Root cause** (`src/runner.ts:657–665`): The `buildEvidenceMap()` method only links refs matching `/commit:(\w+)/`. Two silent failure modes exist:
1. Any prefix other than `commit:` produces no link and no warning.
2. The regex `\w+` captures the hash, but the lookup `map.commits[match[1]]` requires an exact match against the full 40-character commit hash indexed at line 638. Short hashes (e.g., `commit:a1b2c3d`) never match even when the commit exists in the period, silently producing an orphan.

Non-matching refs produce no diagnostic output in either case.

**Valid prefixes** (this plan introduces the full set; current `runner.ts:657–665` only resolves `commit:` — the others are recognised by the validator below but resolution handlers for `pr:`, `decision:`, `file:`, and `inferred:` are a planned follow-up and not part of Fix 18-B):

| Prefix | Links to | Resolved today? |
|--------|----------|-----------------|
| `commit:<hash>` | Git commit | ✅ (existing) |
| `pr:<number>` | GitHub pull request | ❌ (planned) |
| `decision:<id>` | Another decision record | ❌ (planned) |
| `file:<path>` | Source file | ❌ (planned) |
| `inferred:<reason>` | No artifact — marks inferred evidence | ✅ (accepted as valid, no resolution needed) |

**Implementation** (`src/runner.ts`, at the top of `buildEvidenceMap()`):

```typescript
private buildEvidenceMap(data: CollectedData): EvidenceMap {
  const VALID_PREFIXES = ['commit:', 'decision:', 'pr:', 'file:', 'inferred:'];
  const unrecognizedRefs: string[] = [];

  // Build a short→full hash index so commit:a1b2c3d resolves correctly
  const shortHashIndex = new Map<string, string>();
  if (data.git?.commits) {
    for (const c of data.git.commits) {
      // Index by all prefix lengths 7–12 chars for flexible matching
      for (let len = 7; len <= Math.min(12, c.hash.length); len++) {
        shortHashIndex.set(c.hash.slice(0, len), c.hash);
      }
    }
  }

  if (data.decisions?.records) {
    for (const decision of data.decisions.records) {
      for (const ref of (decision.evidence_refs || [])) {
        if (!VALID_PREFIXES.some(p => ref.startsWith(p))) {
          unrecognizedRefs.push(
            `decision ${decision.id || '?'}: "${ref}"`
          );
        }
      }
    }
  }

  if (unrecognizedRefs.length > 0) {
    process.stderr.write(
      `[WARN] ${unrecognizedRefs.length} evidence_ref(s) have unrecognized format and will be orphaned:\n`
    );
    unrecognizedRefs.slice(0, 5).forEach(r =>
      process.stderr.write(`  - ${r}\n`)
    );
    process.stderr.write(
      '  Valid formats: commit:<hash>, pr:<number>, decision:<id>, file:<path>, inferred:<reason>\n'
    );
    this.addTelemetryGap({
      gap_type: 'unrecognized_evidence_refs',
      severity: 'medium',
      impact: `${unrecognizedRefs.length} evidence_refs have unrecognized format and will not link to any artifact`,
      recommendation: 'Use prefixed formats: commit:<hash>, pr:<number>, decision:<id>, file:<path>. See docs/fixing-telemetry-gaps.md.',
    });
  }

  // ... existing map initialization continues
  // NOTE: When resolving commit: refs below, replace:
  //   map.commits[match[1]]
  // with:
  //   map.commits[shortHashIndex.get(match[1]) ?? match[1]]
  // to support both short (7-char) and full 40-char hashes.
```

**Compatibility**: Warning-only. No data is removed or altered. Existing users with valid refs see no change.

**Testing**: Unit test with a decision record containing `evidence_refs: ["claw-abc", "ISSUE-123"]`. Verify stderr receives a warning, a `TelemetryGap` is added, and the evidence map's `orphans.decisions_without_implementation` contains the decision.

---

### Fix 18-C: Adapter Documentation

**Goal**: Add a section to `docs/fixing-telemetry-gaps.md` documenting the `commit:<hash>` format requirement and showing how to correlate issue tracker records with git commits.

**File to change**: `docs/fixing-telemetry-gaps.md` — append a new section.

**Content to add**:

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

\`\`\`json
{
  "ts": "2026-03-15T10:30:00Z",
  "decision": "Adopted optimistic locking for inventory updates",
  "rationale": "Reduces contention under concurrent write load",
  "evidence_refs": ["commit:a1b2c3d", "pr:47"]
}
\`\`\`

**Common mistake**: Using raw issue IDs (`"ISSUE-123"`, `"claw-abc"`) directly.
These have no recognized prefix and are silently orphaned. Always resolve
to a `commit:` or `pr:` reference before logging.
```

---

## Fix Plan: Issue #19

**Issue**: [Multi-repo support for team retrospectives](https://github.com/daax-dev/agentic-retrospective/issues/19)  
**Reporter**: rileyedwards77 (collaborator)  
**Filed**: 2026-03-22  
**Scope**: Larger feature across type system, config loading, analyzers, runner, report generator, and CLI. Zero breaking changes required.

---

### Phase 19-A: Type System Updates

**File**: `src/types.ts`

Add `RepoConfig` and extend `RetroConfig`:

```typescript
// New type — add before RetroConfig
export interface RepoConfig {
  path: string;    // Absolute or relative path to repo root
  label: string;  // Human-readable label used in reports
}

// Update RetroConfig — add one optional field
export interface RetroConfig {
  fromRef: string;
  toRef: string;
  sprintId: string;
  decisionsPath: string;
  agentLogsPath: string;
  ciPath?: string;
  outputDir: string;
  repos?: RepoConfig[];  // NEW: empty / absent = single-repo (cwd)
}
```

Add history type (see also Fix 18-A):

```typescript
export interface SprintHistoryEntry {
  sprint_id: string;
  date: string;
  scores: Scores;
  data_completeness: number;
}
```

---

### Phase 19-B: `.retro.toml` Config File Discovery

**New file**: `src/config.ts`

```typescript
import { existsSync, readFileSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { parse } from '@iarna/toml';  // new dependency

export interface RetroToml {
  retrospective?: {
    sprint_id?: string;
    output_dir?: string;
    from?: string;
    to?: string;
  };
  repos?: Array<{ path: string; label: string }>;
}

/**
 * Walk up from startDir looking for .retro.toml.
 * Returns null if not found.
 */
export function findRetroConfig(startDir: string = process.cwd()): RetroToml | null {
  let dir = resolve(startDir);
  while (true) {
    const candidate = join(dir, '.retro.toml');
    if (existsSync(candidate)) {
      return parse(readFileSync(candidate, 'utf8')) as RetroToml;
    }
    const parent = dirname(dir);
    // dirname('/') === '/' and dirname('C:\\') === 'C:\\' — works on macOS, Linux, and Windows
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

// Security note: the TOML file is read from the local filesystem only.
// Symlink traversal is not a concern for config discovery in a trusted workspace.
```

**New dependency**: `@iarna/toml` — 19KB, zero transitive dependencies, full TOML 1.0 compliance. Add to `dependencies` in `package.json`.

**Alternative considered**: `.retro.json` (avoids new dependency). Rejected because the proposal explicitly uses `.retro.toml` to match the org's `daax-cli.toml` precedent.

---

### Phase 19-C: Analyzer Refactoring

**Files**: `src/analyzers/git.ts`, `src/analyzers/github.ts`

Add `cwd` constructor parameter with `process.cwd()` default:

```typescript
// src/analyzers/git.ts
export class GitAnalyzer {
  private cwd: string;

  constructor(cwd: string = process.cwd()) {
    this.cwd = cwd;
  }

  async isGitRepository(): Promise<boolean> {
    try {
      execSync('git rev-parse --git-dir', { stdio: 'pipe', cwd: this.cwd });
      return true;
    } catch {
      return false;
    }
  }

  async analyze(fromRef: string, toRef: string = 'HEAD'): Promise<GitAnalysisResult> {
    // All execSync calls: add cwd: this.cwd to options
  }
}
```

Apply the same pattern to `GitHubAnalyzer`. All existing call sites pass no `cwd` argument and continue to work unchanged.

---

### Phase 19-D: Runner Multi-Repo Loop

**File**: `src/runner.ts`

Refactor `run()` to dispatch based on whether `repos` is populated:

```typescript
async run(): Promise<RunResult> {
  if (this.config.repos && this.config.repos.length > 0) {
    // Any explicit repos list activates multi-repo mode — even a single entry,
    // which yields a labeled single-repo report (e.g., --repo ../other).
    return this.runMultiRepo();
  }
  return this.runSingleRepo();
}

// Rename existing run() body to runSingleRepo():
private async runSingleRepo(): Promise<RunResult> {
  // ... existing phases 0–5, unchanged
}

private async runMultiRepo(): Promise<RunResult> {
  const perRepo: PerRepoResult[] = [];
  for (const repo of this.config.repos!) {
    const repoPath = resolve(repo.path);
    const result = await this.runSingleRepoAt(repoPath);
    perRepo.push({ label: repo.label, path: repoPath, ...result });
  }
  return this.aggregateMultiRepo(perRepo);
}
```

`runSingleRepoAt(repoPath)` is a thin wrapper that temporarily overrides the `cwd` passed to all analyzers for that repo.

---

### Phase 19-E: Report Generator Updates

**File**: `src/report/generator.ts`

Add multi-repo section rendering:

```typescript
generateMultiRepoMarkdown(perRepo: PerRepoReportData[], summary: AggregatedSummary): string {
  let md = this.generateAggregatedSummary(summary);
  for (const repo of perRepo) {
    md += `\n---\n\n## Repository: ${repo.label} (\`${repo.path}\`)\n\n`;
    md += this.generateRepoSection(repo);
  }
  return md;
}
```

The unified executive summary aggregates scores (weighted by commit count), findings (deduplicated), and action items.

**Action-item cap fix**: The constitution mandates max 5 action items (`memory/constitution.md:48`), but the current runner caps at 7 (`src/runner.ts:1031` uses `items.slice(0, 7)`). As part of this multi-repo work, reduce that cap from 7 to 5 so both single-repo and aggregate multi-repo outputs comply with the constitution. Update acceptance criteria for #19 accordingly.

**Constitution compliance**: Multi-repo support itself does not violate any constitutional constraint. The tool remains a pure analytics layer; the retrospective run reads from multiple repos but does not capture telemetry or install hooks (`memory/constitution.md:11–14`). (The pre-existing exception is user-provided session feedback written to `.logs/feedback/`, both via the interactive `promptForFeedback()` path in the main `agentic-retrospective` flow and via the `feedback` subcommand in `src/cli.ts`; this is out of scope for #19 and preserved unchanged.) The blameless and evidence-driven principles apply equally to per-repo and aggregate sections.

---

### Phase 19-F: CLI Updates

**File**: `src/cli.ts`

Add `--repo` flag and config file loading:

```typescript
program
  .option(
    '--repo <path>',
    'Repo path to analyze (repeatable for multi-repo)',
    (v: string, prev: string[]) => [...(prev || []), v],
    []
  )

// In .action(options, command):
const toml = findRetroConfig();
const sprintSource = command.getOptionValueSource('sprint');
const outputSource = command.getOptionValueSource('output');

// Apply config-file defaults (lowest precedence — CLI flags win)
if (toml?.retrospective?.sprint_id && sprintSource !== 'cli') {
  options.sprint = toml.retrospective.sprint_id;
}
if (toml?.retrospective?.output_dir && outputSource !== 'cli') {
  options.output = toml.retrospective.output_dir;
}

// Repos: CLI --repo flags override config
let repos: RepoConfig[] | undefined;
if (options.repo?.length > 0) {
  repos = options.repo.map((p: string, i: number) => ({
    path: p,
    label: `repo-${i + 1}`,
  }));
} else if (toml?.repos?.length) {
  repos = toml.repos;
}

const config: RetroConfig = {
  // ...existing fields
  repos,
};
```

---

### Compatibility Matrix

| Scenario | Behavior |
|----------|----------|
| No `.retro.toml`, no `--repo` | Current behavior — analyzes `cwd`. Zero breaking changes. |
| `.retro.toml` present, no `[[repos]]` | Sprint metadata from config, single-repo mode. |
| `.retro.toml` with `[[repos]]` | Multi-repo mode from config file. |
| `--repo ../other` | Analyzes `../other` instead of `cwd`. |
| `--repo ./a --repo ./b` | Multi-repo mode, per-repo sections + unified summary. |
| `--repo` flags + `.retro.toml` | CLI flags override config file repos. |

---

## Standalone CI Improvement

**Finding**: No CI workflow validates pull requests before merge (BP-5).

**New file**: `.github/workflows/ci.yml`

```yaml
name: CI

on:
  pull_request:
    branches: [main]
  push:
    branches: [main]
    paths-ignore:
      - 'docs/**'
      - '*.md'

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: pnpm/action-setup@v4
        with:
          version: 9
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - run: pnpm run validate
```

This runs `lint + typecheck + test` on every PR and every non-doc push to `main`.

---

## Implementation Order & Prioritization

Effort key: XS < 1h, S < 4h, M < 1d, L < 3d.

| Priority | Fix | Effort | Risk | Required Tests | Rationale |
|----------|-----|--------|------|----------------|-----------|
| 1 | 18-B (evidence_refs warning) | S | None | Unit: orphaned refs produce stderr + TelemetryGap | Warning-only, no behavior change, immediate user value |
| 2 | 18-C (adapter docs) | S | None | Manual review | Documentation only, zero code risk |
| 3 | CI workflow (BP-5) | S | None | Validated by CI itself on first PR | Improves future change safety |
| 4 | 18-A (trend tracking) | M | Low | Unit: two runs → two JSONL lines in history | Additive only, new file |
| 5 | 19-A + 19-C (types + analyzer cwd) | M | Low | Unit: GitAnalyzer with explicit cwd | Foundation for multi-repo, backward compatible |
| 6 | 19-B (config discovery) | M | Low | Unit: walk-up finds .retro.toml; missing → null | Requires new dependency decision |
| 7 | 19-D + 19-E + 19-F (runner + report + CLI) | L | Medium | Integration: two-repo run produces per-repo sections | Depends on 19-A, 19-B, 19-C |
| 8 | BP-9 (typo fix) | XS | None | Existing tests pass | Cleanup |
| 9 | BP-6 (publish trigger) | S | Low | CI run confirms no spurious publishes | Operational hygiene |

---

## Decision Log

```jsonl
{"ts":"2026-04-10T00:00:00Z","decision":"Scope #18 into three discrete fixes (18-A trend, 18-B validation, 18-C docs)","rationale":"Each fix is independently releasable and testable; avoids a single large PR blocking user value","actor":"agent","category":"architecture","decision_type":"two_way_door","evidence_refs":["inferred:documented-plan-example"]}
{"ts":"2026-04-10T00:00:01Z","decision":"Use appendFileSync for history file writes rather than read-parse-write","rationale":"JSONL is append-only by design; avoids loading and re-serializing the entire history on every run","actor":"agent","category":"architecture","decision_type":"two_way_door","evidence_refs":["inferred:documented-plan-example"]}
{"ts":"2026-04-10T00:00:02Z","decision":"Emit evidence_refs warnings to stderr, not stdout","rationale":"The --json flag routes stdout to consumers; interleaving warnings would corrupt machine-readable output","actor":"agent","category":"architecture","decision_type":"two_way_door","evidence_refs":["inferred:documented-plan-example"]}
{"ts":"2026-04-10T00:00:03Z","decision":"Use @iarna/toml for TOML parsing rather than hand-rolling","rationale":"Correctness and TOML 1.0 spec compliance; @iarna/toml has zero transitive dependencies and is 19KB","actor":"agent","category":"deps","decision_type":"two_way_door","evidence_refs":["inferred:documented-plan-example"]}
{"ts":"2026-04-10T00:00:04Z","decision":"Default GitAnalyzer and GitHubAnalyzer cwd to process.cwd()","rationale":"Preserves full backward compatibility; all existing call sites pass no argument and continue working","actor":"agent","category":"architecture","decision_type":"two_way_door","evidence_refs":["inferred:documented-plan-example"]}
{"ts":"2026-04-10T00:00:05Z","decision":"Place .retro-history.jsonl inside outputDir","rationale":"writeOutputs() writes per-sprint output to join(outputDir, sprintId), so outputDir itself is the parent of per-sprint directories and the natural home for a cross-sprint history file — avoiding parent-directory path traversal","actor":"agent","category":"architecture","decision_type":"two_way_door","evidence_refs":["inferred:documented-plan-example"]}
{"ts":"2026-04-10T00:00:06Z","decision":"Add CI workflow as a separate file from publish.yml rather than extending publish.yml","rationale":"Publish and CI have different triggers and permissions; combining them creates unnecessary coupling","actor":"agent","category":"architecture","decision_type":"two_way_door","evidence_refs":["inferred:documented-plan-example"]}
{"ts":"2026-04-10T00:00:07Z","decision":"Extend fixing-telemetry-gaps.md for adapter docs rather than creating a new file","rationale":"Users are already directed to that doc for telemetry issues; co-location reduces discovery friction","actor":"agent","category":"process","decision_type":"two_way_door","evidence_refs":["inferred:documented-plan-example"]}
{"ts":"2026-04-10T00:00:08Z","decision":"Reject .retro.json in favor of .retro.toml for config file format","rationale":"Issue #19 explicitly proposes TOML to match org-wide daax-cli.toml precedent; JSON would deviate from stated design intent","actor":"agent","category":"architecture","decision_type":"two_way_door","evidence_refs":["inferred:documented-plan-example"]}
{"ts":"2026-04-10T00:00:09Z","decision":"Aggregate multi-repo scores weighted by commit count, not simple average","rationale":"A repo with 300 commits should carry more weight in the unified score than a repo with 10; simple averaging is misleading","actor":"agent","category":"architecture","decision_type":"two_way_door","evidence_refs":["inferred:documented-plan-example"]}
```

---

## What This Plan Does Not Change

The following behaviors are explicitly preserved in every fix above, in compliance with `memory/constitution.md`:

| Constitutional Principle | How This Plan Honors It |
|--------------------------|-------------------------|
| Pure analytics layer — reads data, does not capture it | No fix in this plan introduces new writes to `.logs/`. Existing feedback-related writes in `src/cli.ts` remain unchanged, and the history file is an output artifact under `outputDir`, not telemetry. |
| Git history is the only hard requirement | Multi-repo mode still requires git at each repo path; graceful degradation is unchanged |
| Maximum 5 action items per report | The aggregate multi-repo report enforces this cap across all repos |
| Every claim links to evidence or is marked "inferred" | Evidence map format is unchanged; per-repo sections use the same traceability model |
| Blameless — evaluate systems, not people | No new metrics that attribute findings to individuals |
| No fabricated rationales | Orphaned evidence is surfaced (18-B) rather than silently dropped |

---

## References

1. daax-dev/agentic-retrospective#18 — Feature suggestions from a real-world automated integration (DMokong, 2026-03-22)
2. daax-dev/agentic-retrospective#19 — Multi-repo support for team retrospectives (rileyedwards77, 2026-03-22)
3. `src/types.ts:499–507` — `RetroConfig` type definition
4. `src/types.ts:115–122` — `Scores` type definition
5. `src/types.ts:405–422` — `EvidenceMap` type definition
6. `src/runner.ts:625–685` — `buildEvidenceMap()` implementation (evidence orphaning root cause)
7. `src/runner.ts:687` — `analyzeSprit` typo (private method, non-breaking)
8. `src/runner.ts:1055–1089` — `writeOutputs()` (history append call site)
9. `src/analyzers/git.ts:22–33` — `GitAnalyzer` with hard-coded `process.cwd()`
10. `src/analyzers/github.ts` — `GitHubAnalyzer` with hard-coded `process.cwd()`
11. `src/cli.ts:23–44` — Current CLI option definitions (no `--repo` flag)
12. `memory/constitution.md` — Project constitution, graceful degradation and blameless principles
13. `.github/workflows/publish.yml` — Current CI/CD publish workflow (no PR gate)
14. `.github/ISSUE_TEMPLATE/config.yml` — Issue template config (not a tool config)
15. `docs/fixing-telemetry-gaps.md` — Telemetry gap remediation guide (missing `evidence_refs` section)
16. `examples/decisions.jsonl` — Example decision log
17. `@iarna/toml` npm package — TOML 1.0 parser, zero transitive deps (https://www.npmjs.com/package/@iarna/toml)
18. TOML specification v1.0.0 — https://toml.io/en/v1.0.0
19. SLSA provenance specification — https://slsa.dev/provenance/v1
20. `src/runner.ts:8` — fs destructure (`existsSync`, `mkdirSync`, `readdirSync`, `readFileSync`, `writeFileSync`); `appendFileSync` must be added for Fix 18-A
21. `src/runner.ts:9` — `join` imported from `'path'`; no additional path imports required for Fix 18-A

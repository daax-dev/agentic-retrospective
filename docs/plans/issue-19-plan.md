# Issue #19 Implementation Plan

**Issue**: [daax-dev/agentic-retrospective#19 — Multi-repo support for team retrospectives](https://github.com/daax-dev/agentic-retrospective/issues/19)
**Scope**: Optional `.retro.toml` config + `--repo` flag(s) enabling per-repo sections and an aggregate summary.
**Branch**: `19-multi-repo-support`
**Derived from**: [`docs/updates.md`](../updates.md) §"Fix Plan: Issue #19"

---

## Objective

Support retrospectives across multiple repositories without breaking the single-repo default. Teams typically work across several repos; a retro for one repo misses cross-repo rework chains, scattered hotspots, and skewed fix-to-feature ratios.

**Zero breaking changes.** Single-repo users with no `.retro.toml` and no `--repo` flag see identical behaviour.

---

## Behaviour Matrix

| Input | Behaviour |
|-------|-----------|
| No `.retro.toml`, no `--repo` | Current behaviour — analyze `cwd`. |
| `.retro.toml` with no `[[repos]]` | Sprint metadata from config, single-repo mode on `cwd`. |
| `.retro.toml` with one or more `[[repos]]` | Multi-repo mode using config's repo list. |
| `--repo ../other` | Analyze `../other` instead of `cwd`. |
| `--repo ./a --repo ./b` | Multi-repo mode, per-repo sections + unified summary. |
| `--repo` flags + `.retro.toml` | CLI `--repo` flags **override** config repos. |

---

## Phase 19-A: Type System

### File: `src/types.ts`

Add before `RetroConfig`:

```typescript
export interface RepoConfig {
  path: string;    // Absolute or relative; resolved at runtime
  label: string;   // Human-readable label used in reports (e.g., "frontend")
}
```

Update `RetroConfig` (line 499–507) to add:

```typescript
repos?: RepoConfig[];   // Empty/absent = single-repo (cwd)
```

### Acceptance

- [ ] `RepoConfig` exported.
- [ ] `RetroConfig.repos` is optional; existing callers unchanged.
- [ ] `pnpm run typecheck` passes.

---

## Phase 19-B: `.retro.toml` Discovery

### New file: `src/config.ts`

```typescript
import { existsSync, readFileSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { parse } from '@iarna/toml';

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
 * Walk up from startDir looking for .retro.toml. Returns null if not found.
 */
export function findRetroConfig(startDir: string = process.cwd()): RetroToml | null {
  let dir = resolve(startDir);
  while (true) {
    const candidate = join(dir, '.retro.toml');
    if (existsSync(candidate)) {
      return parse(readFileSync(candidate, 'utf8')) as unknown as RetroToml;
    }
    const parent = dirname(dir);
    if (parent === dir) break;  // filesystem root
    dir = parent;
  }
  return null;
}
```

### Dependency

Add to `package.json` `dependencies`:

```json
"@iarna/toml": "^2.2.5"
```

- 19KB, zero transitive deps, TOML 1.0 compliant.
- Rejected alternative: `.retro.json` — deviates from the org's `daax-cli.toml` precedent referenced in the issue.

### Acceptance

- [ ] `findRetroConfig()` returns `null` when no file exists up to root.
- [ ] Returns parsed object when `.retro.toml` is in `cwd`.
- [ ] Returns parsed object when `.retro.toml` is in a parent dir.
- [ ] Malformed TOML throws a user-readable error (don't swallow the parse exception).
- [ ] Unit tests use tmp dirs.

---

## Phase 19-C: Analyzer Refactor (`cwd` parameter)

### Files

- `src/analyzers/git.ts`
- `src/analyzers/github.ts`

### Change

Both analyzers currently call `execSync(...)` with no `cwd` option, implicitly using `process.cwd()`. Add an optional constructor `cwd` parameter with `process.cwd()` default, and pass `{ cwd: this.cwd }` to every `execSync`.

```typescript
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
  // ...all other execSync calls add { cwd: this.cwd }
}
```

Apply the identical pattern to `GitHubAnalyzer` (it calls `gh` which operates on the current dir by default).

### Acceptance

- [ ] `new GitAnalyzer()` (no args) behaves identically to today.
- [ ] `new GitAnalyzer('/some/other/path')` runs all git operations against that path.
- [ ] Unit test verifies `cwd` is passed to `execSync` (spy on `child_process.execSync`).
- [ ] All existing tests pass unchanged.

---

## Phase 19-D: Runner Multi-Repo Loop

### File: `src/runner.ts`

Split current `run()` into `runSingleRepo()` (existing body) and add `runMultiRepo()`.

```typescript
async run(): Promise<RunResult> {
  if (this.config.repos && this.config.repos.length > 0) {
    // Multi-repo mode: ≥1 entry in config or CLI flag
    return this.runMultiRepo();
  }
  return this.runSingleRepo();
}

private async runMultiRepo(): Promise<RunResult> {
  const perRepo: PerRepoResult[] = [];
  for (const repo of this.config.repos!) {
    const repoPath = resolve(repo.path);
    const result = await this.runSingleRepoAt(repoPath, repo.label);
    perRepo.push({ label: repo.label, path: repoPath, ...result });
  }
  return this.aggregateMultiRepo(perRepo);
}
```

`runSingleRepoAt(repoPath, label)` is a thin wrapper that instantiates analyzers with the given `cwd`.

### Aggregation rules

| Aggregate | Rule |
|-----------|------|
| Scores | Weighted by commit count per repo |
| Findings | Union, deduplicated by `(category, title)` |
| Action items | Capped at 5 across all repos (constitution `memory/constitution.md:48`) |
| `data_completeness` | Averaged |
| `generated_at` | Single timestamp (run start) |

### Acceptance

- [ ] `config.repos = [{path:'.',label:'a'}]` runs multi-repo mode with one repo (useful for labeled single-repo reports).
- [ ] `config.repos` absent → `runSingleRepo()` path; no behaviour change.
- [ ] Two-repo run produces two per-repo sections + one summary.
- [ ] Score aggregation is commit-count-weighted (verify via numeric fixture).
- [ ] Action items never exceed 5 even if each repo would produce 5.

---

## Phase 19-E: Report Generator

### File: `src/report/generator.ts`

Add:

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

### Acceptance

- [ ] Multi-repo markdown begins with a single aggregated "Executive Summary".
- [ ] Each repo section has an `## Repository: <label>` header.
- [ ] Commit / PR / hotspot counts are attributed to their repo.
- [ ] Single-repo markdown is byte-identical to pre-change output (golden test).

---

## Phase 19-F: CLI

### File: `src/cli.ts`

Add after existing `.option(...)` chain:

```typescript
.option(
  '--repo <path>',
  'Repo path to analyze (repeatable for multi-repo)',
  (v: string, prev: string[]) => [...(prev || []), v],
  []
)
```

In `.action(options)`:

```typescript
const toml = findRetroConfig();

// Config-file defaults (lowest precedence)
if (toml?.retrospective?.sprint_id && !options.sprint) {
  options.sprint = toml.retrospective.sprint_id;
}
if (toml?.retrospective?.output_dir && options.output === 'docs/retrospectives') {
  options.output = toml.retrospective.output_dir;
}

// Repos: CLI --repo flags override config
let repos: RepoConfig[] | undefined;
if (options.repo?.length > 0) {
  repos = options.repo.map((p: string, i: number) => ({ path: p, label: `repo-${i + 1}` }));
} else if (toml?.repos?.length) {
  repos = toml.repos;
}

const config: RetroConfig = {
  // ...existing fields
  repos,
};
```

### Acceptance

- [ ] `--repo ../a` populates `config.repos` with one entry.
- [ ] `--repo ../a --repo ../b` populates two entries.
- [ ] With `.retro.toml` present and no `--repo`, repos come from config.
- [ ] With both present, `--repo` wins.
- [ ] `--help` shows the new flag.

---

## Integration Testing

### `test/multi-repo.test.ts` (new)

```
describe('multi-repo mode', () => {
  it('single-repo default unchanged when no config/flags', async () => { /* ... */ });
  it('--repo ../a runs against that path', async () => { /* ... */ });
  it('two --repo flags produce aggregate + per-repo sections', async () => { /* ... */ });
  it('loads .retro.toml from parent dir', async () => { /* ... */ });
  it('CLI --repo overrides .retro.toml repos', async () => { /* ... */ });
  it('aggregate scores are commit-weighted', async () => { /* numeric fixture */ });
  it('action items capped at 5 across all repos', async () => { /* ... */ });
});
```

Use real git operations in a tmpdir (two init'd repos with scripted commits) — matches existing test patterns.

### `.retro.toml` fixture

```toml
[retrospective]
sprint_id = "sprint-42"
output_dir = "docs/retrospectives"

[[repos]]
path = "."
label = "frontend"

[[repos]]
path = "../api"
label = "api"
```

---

## Validation Checklist

Before PR:

```bash
pnpm install            # picks up @iarna/toml
pnpm run validate       # lint + typecheck + test
pnpm run build
# Smoke: single-repo
node dist/cli.js --from HEAD~10 --output /tmp/retro-single
# Smoke: multi-repo via CLI
node dist/cli.js --repo . --repo ../some-other-repo --output /tmp/retro-multi
# Smoke: via config file
echo '[[repos]]\npath="."\nlabel="self"' > /tmp/retro-work/.retro.toml
cd /tmp/retro-work && node <repo>/dist/cli.js
```

---

## Compatibility & Constitution

- **No breaking changes.** Single-repo default preserved across every matrix row above.
- Constitution (`memory/constitution.md`) compliance:
  - Tool remains a pure analytics layer; no new telemetry capture.
  - Git remains the only hard requirement.
  - 5-action-item cap enforced at the aggregate level.
  - Blameless and evidence-driven principles apply equally to per-repo and aggregate sections.

---

## Out of Scope (separate issues if needed)

- GitHub org auto-discovery (`--github-org`).
- Cross-repo dependency analysis.
- Monorepo sub-path support (`[[repos]] path = "./packages/api"` is OK if that path is itself a git root, but sub-path of a single repo is not supported).
- Multi-repo trend tracking (wait for #18 to land; then a separate issue covers per-repo history).

---

## Implementation Order

1. 19-A — types (foundation, no behavior change).
2. 19-C — analyzer `cwd` refactor (mechanical, backward compat).
3. 19-B — config discovery (new module + dep).
4. 19-D — runner multi-repo loop.
5. 19-E — report generator multi-repo rendering.
6. 19-F — CLI wiring.
7. Integration tests + smoke runs.

Each step compiles cleanly and tests pass before moving on.

## References

- `src/types.ts:499–507` — `RetroConfig`
- `src/analyzers/git.ts:22–33` — `GitAnalyzer` hard-coded `process.cwd()`
- `src/analyzers/github.ts` — `GitHubAnalyzer` hard-coded `process.cwd()`
- `src/runner.ts` — runner orchestration
- `src/cli.ts:23–44` — current CLI option definitions
- `memory/constitution.md` — project constitution
- `@iarna/toml` — https://www.npmjs.com/package/@iarna/toml
- [`docs/updates.md`](../updates.md) — source plan

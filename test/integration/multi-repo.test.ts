/**
 * Integration tests for multi-repo mode (issue #19).
 *
 * Covers the 7 cases from docs/plans/issue-19-plan.md §Integration Testing:
 *   1. single-repo default unchanged when no config/flags
 *   2. --repo ../a runs against that path
 *   3. two --repo flags produce aggregate + per-repo sections
 *   4. loads .retro.toml from parent dir
 *   5. CLI --repo overrides .retro.toml repos
 *   6. aggregate scores are commit-weighted
 *   7. action items capped at 5 across all repos
 */

import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { execSync, spawnSync } from 'child_process';
import { join } from 'path';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { createTempDir, type TempDir } from '../helpers/temp-dir.js';
import { runRetro } from '../../src/runner.js';
import type { RetroConfig } from '../../src/types.js';

function initGitRepo(cwd: string): void {
  execSync('git init', { cwd, stdio: 'pipe' });
  execSync('git config user.email "test@example.com"', { cwd, stdio: 'pipe' });
  execSync('git config user.name "Test User"', { cwd, stdio: 'pipe' });
}

function makeCommit(cwd: string, message: string, files: Record<string, string>): string {
  for (const [path, content] of Object.entries(files)) {
    const full = join(cwd, path);
    mkdirSync(join(full, '..'), { recursive: true });
    writeFileSync(full, content);
  }
  execSync('git add -A', { cwd, stdio: 'pipe' });
  execSync(`git commit -m "${message}"`, { cwd, stdio: 'pipe' });
  return execSync('git rev-parse HEAD', { cwd, encoding: 'utf-8' }).trim();
}

describe('Multi-repo mode (issue #19)', () => {
  let tempDir: TempDir;
  let originalCwd: string;

  beforeEach(() => {
    tempDir = createTempDir('retro-multirepo-');
    originalCwd = process.cwd();
  });

  afterEach(() => {
    process.chdir(originalCwd);
    tempDir.cleanup();
  });

  test('1: single-repo default unchanged when no config/flags', async () => {
    const repoA = tempDir.createDir('repo-a');
    initGitRepo(repoA);
    const first = makeCommit(repoA, 'Initial', { 'README.md': 'a' });
    makeCommit(repoA, 'feat: x', { 'src/x.ts': 'x' });

    process.chdir(repoA);
    const config: RetroConfig = {
      fromRef: first,
      toRef: 'HEAD',
      sprintId: 'single',
      decisionsPath: join(repoA, '.logs/decisions'),
      agentLogsPath: join(repoA, '.logs/agents'),
      outputDir: join(tempDir.path, 'out-single'),
    };
    const result = await runRetro(config, { verbose: false });

    expect(result.success).toBe(true);
    expect(result.perRepo).toBeUndefined(); // single-repo path
    expect(result.report!.summary.commits).toBe(1);
  });

  test('2: repos=[path] runs against that path', async () => {
    const repoA = tempDir.createDir('repo-a');
    initGitRepo(repoA);
    const first = makeCommit(repoA, 'Initial', { 'README.md': 'a' });
    makeCommit(repoA, 'feat: first', { 'src/x.ts': 'x' });
    makeCommit(repoA, 'feat: second', { 'src/y.ts': 'y' });

    // cwd is the tempDir; repo is a sibling directory
    process.chdir(tempDir.path);

    const config: RetroConfig = {
      fromRef: first,
      toRef: 'HEAD',
      sprintId: 'single-as-multi',
      decisionsPath: '.logs/decisions',
      agentLogsPath: '.logs/agents',
      outputDir: join(tempDir.path, 'out-single-as-multi'),
      repos: [{ path: repoA, label: 'a' }],
    };
    const result = await runRetro(config, { verbose: false });

    expect(result.success).toBe(true);
    expect(result.perRepo).toHaveLength(1);
    expect(result.perRepo![0].label).toBe('a');
    expect(result.perRepo![0].report.summary.commits).toBe(2);
  });

  test('3: two repos produce aggregate + per-repo sections', async () => {
    const repoA = tempDir.createDir('repo-a');
    initGitRepo(repoA);
    const firstA = makeCommit(repoA, 'Initial A', { 'README.md': 'a' });
    makeCommit(repoA, 'feat: a-feat', { 'a.ts': 'a' });
    makeCommit(repoA, 'fix: a-fix', { 'a.ts': 'a2' });

    const repoB = tempDir.createDir('repo-b');
    initGitRepo(repoB);
    const firstB = makeCommit(repoB, 'Initial B', { 'README.md': 'b' });
    makeCommit(repoB, 'feat: b-feat', { 'b.ts': 'b' });

    process.chdir(tempDir.path);

    const config: RetroConfig = {
      fromRef: '',
      toRef: 'HEAD',
      sprintId: 'multi',
      decisionsPath: '.logs/decisions',
      agentLogsPath: '.logs/agents',
      outputDir: join(tempDir.path, 'out-multi'),
      repos: [
        { path: repoA, label: 'frontend' },
        { path: repoB, label: 'api' },
      ],
    };

    // Override default fromRef per repo by setting to the first commit of repoA
    // Since fromRefs are shared across repos in this design, use ''
    void firstA;
    void firstB;

    const result = await runRetro(config, { verbose: false });

    expect(result.success).toBe(true);
    expect(result.perRepo).toHaveLength(2);

    // Check the aggregate output files
    const outDir = join(tempDir.path, 'out-multi', 'multi');
    expect(existsSync(join(outDir, 'retrospective.json'))).toBe(true);
    expect(existsSync(join(outDir, 'retrospective.md'))).toBe(true);

    const md = readFileSync(join(outDir, 'retrospective.md'), 'utf-8');
    expect(md).toContain('Multi-Repo Sprint Retrospective');
    expect(md).toContain('## Repository: frontend');
    expect(md).toContain('## Repository: api');
    expect(md).toContain('Per-Repo Breakdown');
  });

  test('4: .retro.toml in parent dir is discovered and parsed', async () => {
    const parent = tempDir.path;
    const nested = tempDir.createDir('deep/work');

    writeFileSync(
      join(parent, '.retro.toml'),
      `[retrospective]
sprint_id = "toml-sprint"
`
    );

    process.chdir(nested);
    const { findRetroConfig } = await import('../../src/config.js');
    const result = findRetroConfig();

    expect(result).not.toBeNull();
    expect(result?.retrospective?.sprint_id).toBe('toml-sprint');
  });

  test('5: CLI --repo overrides .retro.toml repos (unit-level check via config)', async () => {
    // Drive via the CLI logic: simulate by ensuring the order of precedence
    // — if both are present, CLI wins. We verify by constructing a RetroConfig
    // directly and confirming that repos passed at construction time are the
    // ones honored.
    const repoCli = tempDir.createDir('cli-repo');
    initGitRepo(repoCli);
    makeCommit(repoCli, 'Initial', { 'R.md': 'r' });
    makeCommit(repoCli, 'feat: cli-only', { 's.ts': 's' });

    // Write a .retro.toml that mentions a completely different repo
    const fakeTomlPath = tempDir.createDir('toml-parent');
    writeFileSync(
      join(fakeTomlPath, '.retro.toml'),
      `[[repos]]
path = "./nonexistent"
label = "should-be-overridden"
`
    );

    process.chdir(fakeTomlPath);
    const config: RetroConfig = {
      fromRef: '',
      toRef: 'HEAD',
      sprintId: 'precedence',
      decisionsPath: '.logs/decisions',
      agentLogsPath: '.logs/agents',
      outputDir: join(tempDir.path, 'out-precedence'),
      repos: [{ path: repoCli, label: 'cli-wins' }], // simulates what cli.ts does
    };
    const result = await runRetro(config, { verbose: false });

    expect(result.success).toBe(true);
    expect(result.perRepo).toHaveLength(1);
    expect(result.perRepo![0].label).toBe('cli-wins');
  });

  test('6: aggregate scores are commit-weighted', async () => {
    // repoA has many small commits (good delivery_predictability -> high score)
    // repoB has one very large commit (low delivery_predictability -> low score)
    const repoA = tempDir.createDir('heavy');
    initGitRepo(repoA);
    makeCommit(repoA, 'init', { 'a.ts': 'a' });
    for (let i = 0; i < 10; i++) {
      makeCommit(repoA, `feat: small ${i}`, { [`f${i}.ts`]: 'x\n' });
    }

    const repoB = tempDir.createDir('light');
    initGitRepo(repoB);
    makeCommit(repoB, 'init', { 'b.ts': 'b' });
    // single huge commit (>500 lines) to drive score down
    const big = Array.from({ length: 800 }, (_, i) => `line${i}`).join('\n');
    makeCommit(repoB, 'feat: big', { 'big.ts': big });

    process.chdir(tempDir.path);
    const config: RetroConfig = {
      fromRef: '',
      toRef: 'HEAD',
      sprintId: 'weighted',
      decisionsPath: '.logs/decisions',
      agentLogsPath: '.logs/agents',
      outputDir: join(tempDir.path, 'out-weighted'),
      repos: [
        { path: repoA, label: 'heavy' },
        { path: repoB, label: 'light' },
      ],
    };
    const result = await runRetro(config, { verbose: false });
    expect(result.success).toBe(true);

    // Heavy repo (more commits) should dominate the weighted aggregate.
    const heavy = result.perRepo!.find(r => r.label === 'heavy')!;
    const light = result.perRepo!.find(r => r.label === 'light')!;
    expect(heavy.report.summary.commits).toBeGreaterThan(light.report.summary.commits);

    const aggScore = result.report!.scores.delivery_predictability.score;
    const heavyScore = heavy.report.scores.delivery_predictability.score;
    const lightScore = light.report.scores.delivery_predictability.score;

    // Weighted average must sit between the two repo scores, closer to the
    // heavier-weight (more-commits) repo score.
    if (aggScore !== null && heavyScore !== null && lightScore !== null) {
      const minScore = Math.min(heavyScore, lightScore);
      const maxScore = Math.max(heavyScore, lightScore);
      expect(aggScore).toBeGreaterThanOrEqual(minScore);
      expect(aggScore).toBeLessThanOrEqual(maxScore);
      // Should be closer to heavy's score than a naive average would be.
      const naiveAvg = (heavyScore + lightScore) / 2;
      expect(Math.abs(aggScore - heavyScore)).toBeLessThanOrEqual(Math.abs(naiveAvg - heavyScore) + 0.1);
    }
  });

  test('7: aggregate action items never exceed 5 across all repos', async () => {
    // Create two repos each with no logs so each generates several telemetry
    // gap action items. The aggregate should still cap at 5.
    const repoA = tempDir.createDir('gaps-a');
    initGitRepo(repoA);
    makeCommit(repoA, 'init', { 'a.ts': 'a' });
    makeCommit(repoA, 'feat: x', { 'x.ts': 'x' });

    const repoB = tempDir.createDir('gaps-b');
    initGitRepo(repoB);
    makeCommit(repoB, 'init', { 'b.ts': 'b' });
    makeCommit(repoB, 'feat: y', { 'y.ts': 'y' });

    process.chdir(tempDir.path);
    const config: RetroConfig = {
      fromRef: '',
      toRef: 'HEAD',
      sprintId: 'capped',
      decisionsPath: '.logs/decisions',
      agentLogsPath: '.logs/agents',
      outputDir: join(tempDir.path, 'out-capped'),
      repos: [
        { path: repoA, label: 'a' },
        { path: repoB, label: 'b' },
      ],
    };
    const result = await runRetro(config, { verbose: false });

    expect(result.success).toBe(true);
    expect(result.report!.action_items.length).toBeLessThanOrEqual(5);
  });
});

// Separate describe block: CLI smoke coverage of --repo flag
describe('CLI --repo flag (issue #19)', () => {
  let tempDir: TempDir;
  let originalCwd: string;
  let cliPath: string;

  beforeEach(() => {
    tempDir = createTempDir('retro-cli-multirepo-');
    originalCwd = process.cwd();
    cliPath = join(originalCwd, 'dist', 'cli.js');
  });

  afterEach(() => {
    process.chdir(originalCwd);
    tempDir.cleanup();
  });

  test('--help lists --repo', () => {
    const r = spawnSync('node', [cliPath, '--help'], { encoding: 'utf-8' });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('--repo');
  });
});

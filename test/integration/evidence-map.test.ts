/**
 * Integration tests for buildEvidenceMap evidence_refs validation (issue #18, fix 18-B).
 *
 * Before this fix, evidence_refs with no recognized prefix were silently
 * orphaned, and short commit hashes (e.g. `commit:a1b2c3d`) never linked
 * to the full 40-char hash. These tests cover both behaviours.
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { execSync, spawnSync } from 'child_process';
import { join } from 'path';
import { createTempDir, createMockLogsDir, type TempDir } from '../helpers/temp-dir.js';
import { runRetro } from '../../src/runner.js';
import type { RetroConfig } from '../../src/types.js';

describe('buildEvidenceMap evidence_refs validation', () => {
  let tempDir: TempDir;
  let originalCwd: string;

  beforeEach(() => {
    tempDir = createTempDir('retro-evmap-');
    originalCwd = process.cwd();
    process.chdir(tempDir.path);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    tempDir.cleanup();
    vi.restoreAllMocks();
  });

  function initGitRepo(): void {
    execSync('git init', { cwd: tempDir.path, stdio: 'pipe' });
    execSync('git config user.email "test@example.com"', { cwd: tempDir.path, stdio: 'pipe' });
    execSync('git config user.name "Test User"', { cwd: tempDir.path, stdio: 'pipe' });
  }

  function makeCommit(message: string, files: Record<string, string>): string {
    for (const [path, content] of Object.entries(files)) {
      tempDir.createFile(path, content);
    }
    execSync('git add -A', { cwd: tempDir.path, stdio: 'pipe' });
    execSync(`git commit -m "${message}"`, { cwd: tempDir.path, stdio: 'pipe' });
    return execSync('git rev-parse HEAD', { cwd: tempDir.path, encoding: 'utf-8' }).trim();
  }

  function createConfig(overrides: Partial<RetroConfig> = {}): RetroConfig {
    return {
      fromRef: '',
      toRef: 'HEAD',
      sprintId: 'evmap-sprint',
      decisionsPath: join(tempDir.path, '.logs', 'decisions'),
      agentLogsPath: join(tempDir.path, '.logs', 'agents'),
      outputDir: join(tempDir.path, 'output'),
      ...overrides,
    };
  }

  function writeDecisions(records: Array<Record<string, unknown>>): void {
    createMockLogsDir(tempDir);
    tempDir.createFile(
      '.logs/decisions/2026-02-01.jsonl',
      records.map(r => JSON.stringify(r)).join('\n')
    );
  }

  test('warns on unrecognized prefix', async () => {
    initGitRepo();
    const firstCommit = makeCommit('Initial', { 'README.md': '# r' });
    makeCommit('Feature', { 'src/a.ts': 'export const a = 1;' });

    writeDecisions([
      {
        id: 'dec-1',
        ts: '2026-02-01T10:00:00Z',
        decision: 'Adopted X',
        actor: 'human',
        decision_type: 'two_way_door',
        evidence_refs: ['claw-abc', 'ISSUE-123'],
      },
    ]);

    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const config = createConfig({ fromRef: firstCommit });
    const result = await runRetro(config, { verbose: false });
    expect(result.success).toBe(true);

    const combined = stderrSpy.mock.calls.map(c => String(c[0])).join('');
    expect(combined).toContain('[WARN]');
    expect(combined).toContain('2 evidence_ref(s) have unrecognized format');
    expect(combined).toContain('claw-abc');
    expect(combined).toContain('ISSUE-123');
    expect(combined).toContain('Valid formats:');
  });

  test('adds TelemetryGap for unrecognized refs', async () => {
    initGitRepo();
    const firstCommit = makeCommit('Initial', { 'README.md': '# r' });
    makeCommit('Feature', { 'src/a.ts': 'export const a = 1;' });

    writeDecisions([
      {
        id: 'dec-1',
        ts: '2026-02-01T10:00:00Z',
        decision: 'Adopted X',
        actor: 'human',
        decision_type: 'two_way_door',
        evidence_refs: ['claw-abc'],
      },
    ]);

    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const config = createConfig({ fromRef: firstCommit });
    const result = await runRetro(config, { verbose: false });
    expect(result.success).toBe(true);

    const gaps = result.report!.data_completeness.gaps;
    const gap = gaps.find(g => g.gap_type === 'unrecognized_evidence_refs');
    expect(gap).toBeDefined();
    expect(gap!.severity).toBe('medium');
    expect(gap!.impact).toContain('1 evidence_refs');
    expect(gap!.recommendation).toContain('commit:<hash>');

    // Decision still orphaned because refs do not resolve.
    expect(result.report!.evidence_map.orphans.decisions_without_implementation).toContain('dec-1');
  });

  test('resolves short commit hashes to full hash', async () => {
    initGitRepo();
    const firstCommit = makeCommit('Initial', { 'README.md': '# r' });
    const featureCommit = makeCommit('Feature', { 'src/a.ts': 'export const a = 1;' });
    const shortHash = featureCommit.slice(0, 8);

    writeDecisions([
      {
        id: 'dec-1',
        ts: '2026-02-01T10:00:00Z',
        decision: 'Shipped feature',
        actor: 'human',
        decision_type: 'two_way_door',
        evidence_refs: [`commit:${shortHash}`],
      },
    ]);

    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const config = createConfig({ fromRef: firstCommit });
    const result = await runRetro(config, { verbose: false });
    expect(result.success).toBe(true);

    const map = result.report!.evidence_map;
    expect(map.decisions['dec-1'].commits).toContain(featureCommit);
    expect(map.commits[featureCommit].decisions).toContain('dec-1');
    expect(map.orphans.decisions_without_implementation).not.toContain('dec-1');
  });

  test('resolves full commit hashes (no regression)', async () => {
    initGitRepo();
    const firstCommit = makeCommit('Initial', { 'README.md': '# r' });
    const featureCommit = makeCommit('Feature', { 'src/a.ts': 'export const a = 1;' });

    writeDecisions([
      {
        id: 'dec-1',
        ts: '2026-02-01T10:00:00Z',
        decision: 'Shipped feature',
        actor: 'human',
        decision_type: 'two_way_door',
        evidence_refs: [`commit:${featureCommit}`],
      },
    ]);

    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const config = createConfig({ fromRef: firstCommit });
    const result = await runRetro(config, { verbose: false });
    expect(result.success).toBe(true);

    const map = result.report!.evidence_map;
    expect(map.decisions['dec-1'].commits).toContain(featureCommit);
  });

  test('does not warn when all refs use valid prefixes', async () => {
    initGitRepo();
    const firstCommit = makeCommit('Initial', { 'README.md': '# r' });
    const featureCommit = makeCommit('Feature', { 'src/a.ts': 'export const a = 1;' });

    writeDecisions([
      {
        id: 'dec-1',
        ts: '2026-02-01T10:00:00Z',
        decision: 'Shipped feature',
        actor: 'human',
        decision_type: 'two_way_door',
        evidence_refs: [
          `commit:${featureCommit}`,
          'pr:42',
          'decision:prior-dec',
          'file:src/a.ts',
          'inferred:from subject line',
        ],
      },
    ]);

    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const config = createConfig({ fromRef: firstCommit });
    const result = await runRetro(config, { verbose: false });
    expect(result.success).toBe(true);

    const combined = stderrSpy.mock.calls.map(c => String(c[0])).join('');
    expect(combined).not.toContain('unrecognized format');

    const gaps = result.report!.data_completeness.gaps;
    expect(gaps.find(g => g.gap_type === 'unrecognized_evidence_refs')).toBeUndefined();
  });

  test('warning goes to stderr, not stdout (safe under --json)', async () => {
    initGitRepo();
    const firstCommit = makeCommit('Initial', { 'README.md': '# r' });
    makeCommit('Feature', { 'src/a.ts': 'export const a = 1;' });

    writeDecisions([
      {
        id: 'dec-1',
        ts: '2026-02-01T10:00:00Z',
        decision: 'Adopted X',
        actor: 'human',
        decision_type: 'two_way_door',
        evidence_refs: ['claw-abc'],
      },
    ]);

    // Run the built CLI so we can observe real stdout/stderr split.
    const cliPath = join(originalCwd, 'dist', 'cli.js');
    const result = spawnSync(
      'node',
      [cliPath, '--from', firstCommit, '--json', '--quiet'],
      { cwd: tempDir.path, encoding: 'utf-8', timeout: 30000 }
    );

    // The warning must land on stderr, never stdout, so consumers of
    // stdout-parsed data are unaffected.
    expect(result.stderr).toContain('[WARN]');
    expect(result.stderr).toContain('unrecognized format');
    expect(result.stdout).not.toContain('[WARN]');
    expect(result.stdout).not.toContain('unrecognized format');
  });
});

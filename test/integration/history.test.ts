/**
 * Integration tests for sprint history persistence (issue #18, fix 18-A).
 *
 * Each run appends a JSONL entry to <outputDir>/../.retro-history.jsonl so
 * consumers can detect multi-sprint trends without re-analyzing prior reports.
 */

import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { execSync } from 'child_process';
import { join, resolve } from 'path';
import { existsSync, readFileSync } from 'fs';
import { createTempDir, type TempDir } from '../helpers/temp-dir.js';
import { runRetro } from '../../src/runner.js';
import type { RetroConfig, SprintHistoryEntry } from '../../src/types.js';

describe('sprint history', () => {
  let tempDir: TempDir;
  let originalCwd: string;

  beforeEach(() => {
    tempDir = createTempDir('retro-history-');
    originalCwd = process.cwd();
    process.chdir(tempDir.path);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    tempDir.cleanup();
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
      sprintId: 'history-sprint-1',
      decisionsPath: join(tempDir.path, '.logs', 'decisions'),
      agentLogsPath: join(tempDir.path, '.logs', 'agents'),
      outputDir: join(tempDir.path, 'output'),
      ...overrides,
    };
  }

  function historyPathFor(config: RetroConfig): string {
    return resolve(config.outputDir, '../.retro-history.jsonl');
  }

  test('creates history file on first run', async () => {
    initGitRepo();
    const firstCommit = makeCommit('Initial', { 'README.md': '# r' });
    makeCommit('Feature', { 'src/a.ts': 'export const a = 1;' });

    const config = createConfig({ fromRef: firstCommit });
    const result = await runRetro(config, { verbose: false });
    expect(result.success).toBe(true);

    const historyPath = historyPathFor(config);
    expect(existsSync(historyPath)).toBe(true);

    const lines = readFileSync(historyPath, 'utf8').trim().split('\n');
    expect(lines).toHaveLength(1);
  });

  test('appends entry on each run', async () => {
    initGitRepo();
    const firstCommit = makeCommit('Initial', { 'README.md': '# r' });
    makeCommit('Feature', { 'src/a.ts': 'export const a = 1;' });

    const config1 = createConfig({ fromRef: firstCommit, sprintId: 'sprint-1' });
    await runRetro(config1, { verbose: false });

    // Second sprint
    makeCommit('Another', { 'src/b.ts': 'export const b = 2;' });
    const config2 = createConfig({
      fromRef: firstCommit,
      sprintId: 'sprint-2',
      outputDir: config1.outputDir, // share parent so history file lines up
    });
    await runRetro(config2, { verbose: false });

    const historyPath = historyPathFor(config1);
    const lines = readFileSync(historyPath, 'utf8').trim().split('\n');
    expect(lines).toHaveLength(2);

    const entry1 = JSON.parse(lines[0]) as SprintHistoryEntry;
    const entry2 = JSON.parse(lines[1]) as SprintHistoryEntry;
    expect(entry1.sprint_id).toBe('sprint-1');
    expect(entry2.sprint_id).toBe('sprint-2');
  });

  test('entry is valid JSON with required fields', async () => {
    initGitRepo();
    const firstCommit = makeCommit('Initial', { 'README.md': '# r' });
    makeCommit('Feature', { 'src/a.ts': 'export const a = 1;' });

    const config = createConfig({ fromRef: firstCommit, sprintId: 'shaped-sprint' });
    await runRetro(config, { verbose: false });

    const historyPath = historyPathFor(config);
    const raw = readFileSync(historyPath, 'utf8').trim();
    const entry = JSON.parse(raw) as SprintHistoryEntry;

    expect(entry.sprint_id).toBe('shaped-sprint');
    expect(typeof entry.date).toBe('string');
    expect(Number.isNaN(Date.parse(entry.date))).toBe(false);
    expect(typeof entry.data_completeness).toBe('number');
    expect(entry.data_completeness).toBeGreaterThanOrEqual(0);
    expect(entry.data_completeness).toBeLessThanOrEqual(100);
    expect(entry.scores).toBeDefined();
    // Scores dimensions present (keys exist; values may be null with no data source)
    expect(entry.scores).toHaveProperty('delivery_predictability');
    expect(entry.scores).toHaveProperty('test_loop_completeness');
    expect(entry.scores).toHaveProperty('quality_maintainability');
    expect(entry.scores).toHaveProperty('security_posture');
    expect(entry.scores).toHaveProperty('collaboration_efficiency');
    expect(entry.scores).toHaveProperty('decision_hygiene');
  });

  test('history is written under --json (jsonOnly) mode', async () => {
    initGitRepo();
    const firstCommit = makeCommit('Initial', { 'README.md': '# r' });
    makeCommit('Feature', { 'src/a.ts': 'export const a = 1;' });

    const config = createConfig({ fromRef: firstCommit, sprintId: 'json-only' });
    const result = await runRetro(config, { verbose: false, jsonOnly: true });
    expect(result.success).toBe(true);

    const historyPath = historyPathFor(config);
    expect(existsSync(historyPath)).toBe(true);
    const lines = readFileSync(historyPath, 'utf8').trim().split('\n');
    expect(lines).toHaveLength(1);
  });
});

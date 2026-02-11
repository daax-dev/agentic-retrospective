/**
 * CLI Integration Tests
 *
 * Tests CLI commands work end-to-end.
 */

import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { execSync, spawnSync } from 'child_process';
import { join } from 'path';
import { existsSync, readFileSync } from 'fs';
import { createTempDir, createMockLogsDir, type TempDir } from '../helpers/temp-dir.js';

describe('CLI Integration', () => {
  let tempDir: TempDir;
  let originalCwd: string;
  let cliPath: string;

  beforeEach(() => {
    tempDir = createTempDir('retro-cli-');
    originalCwd = process.cwd();
    process.chdir(tempDir.path);
    // Path to the built CLI (assuming tests run after build)
    cliPath = join(originalCwd, 'dist', 'cli.js');
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

  function makeCommit(message: string, files: Record<string, string>): void {
    for (const [path, content] of Object.entries(files)) {
      tempDir.createFile(path, content);
    }
    execSync('git add -A', { cwd: tempDir.path, stdio: 'pipe' });
    execSync(`git commit -m "${message}"`, { cwd: tempDir.path, stdio: 'pipe' });
  }

  function runCli(args: string[], input?: string): { stdout: string; stderr: string; status: number } {
    const result = spawnSync('node', [cliPath, ...args], {
      cwd: tempDir.path,
      encoding: 'utf-8',
      input,
      timeout: 30000,
    });

    return {
      stdout: result.stdout || '',
      stderr: result.stderr || '',
      status: result.status || 0,
    };
  }

  describe('main command', () => {
    test('default run produces output files', async () => {
      initGitRepo();
      makeCommit('Initial commit', { 'README.md': '# Test' });
      makeCommit('Add feature', { 'src/app.ts': 'export const x = 1;' });

      const result = runCli(['--quiet']);

      expect(result.status).toBe(0);

      // Check output files exist
      const outputDir = join(tempDir.path, 'docs', 'retrospectives');
      const sprintDirs = execSync(`ls "${outputDir}"`, { encoding: 'utf-8' }).trim().split('\n');
      expect(sprintDirs.length).toBeGreaterThan(0);

      const latestSprint = sprintDirs[0];
      expect(existsSync(join(outputDir, latestSprint, 'retrospective.md'))).toBe(true);
      expect(existsSync(join(outputDir, latestSprint, 'retrospective.json'))).toBe(true);
      expect(existsSync(join(outputDir, latestSprint, 'evidence_map.json'))).toBe(true);
    });

    test('--json flag skips markdown output', async () => {
      initGitRepo();
      makeCommit('Initial', { 'README.md': '# Test' });

      const result = runCli(['--quiet', '--json']);

      expect(result.status).toBe(0);

      const outputDir = join(tempDir.path, 'docs', 'retrospectives');
      const sprintDirs = execSync(`ls "${outputDir}"`, { encoding: 'utf-8' }).trim().split('\n');
      const latestSprint = sprintDirs[0];

      expect(existsSync(join(outputDir, latestSprint, 'retrospective.json'))).toBe(true);
      expect(existsSync(join(outputDir, latestSprint, 'retrospective.md'))).toBe(false);
    });

    test('--sprint flag sets custom sprint ID', async () => {
      initGitRepo();
      makeCommit('Initial', { 'README.md': '# Test' });

      const result = runCli(['--quiet', '--sprint', 'custom-sprint-id']);

      expect(result.status).toBe(0);

      const outputDir = join(tempDir.path, 'docs', 'retrospectives', 'custom-sprint-id');
      expect(existsSync(join(outputDir, 'retrospective.json'))).toBe(true);

      const report = JSON.parse(readFileSync(join(outputDir, 'retrospective.json'), 'utf-8'));
      expect(report.sprint_id).toBe('custom-sprint-id');
    });

    test('--output flag changes output directory', async () => {
      initGitRepo();
      makeCommit('Initial', { 'README.md': '# Test' });

      const customOutput = join(tempDir.path, 'custom-output');
      const result = runCli(['--quiet', '--output', customOutput, '--sprint', 'test']);

      expect(result.status).toBe(0);
      expect(existsSync(join(customOutput, 'test', 'retrospective.json'))).toBe(true);
    });

    test('fails gracefully when not in git repo', async () => {
      // Don't initialize git
      tempDir.createFile('README.md', '# Test');

      const result = runCli(['--quiet']);

      expect(result.status).toBe(1);
      expect(result.stdout + result.stderr).toContain('git');
    });

    test('--help shows usage information', () => {
      const result = runCli(['--help']);

      expect(result.status).toBe(0);
      expect(result.stdout).toContain('agentic-retrospective');
      expect(result.stdout).toContain('--from');
      expect(result.stdout).toContain('--to');
      expect(result.stdout).toContain('--sprint');
    });

    test('--version shows version', () => {
      const result = runCli(['--version']);

      expect(result.status).toBe(0);
      expect(result.stdout).toMatch(/\d+\.\d+\.\d+/);
    });
  });

  describe('feedback command', () => {
    test('feedback command creates feedback file with options', async () => {
      initGitRepo();
      makeCommit('Initial', { 'README.md': '# Test' });

      // Use non-interactive mode with all options provided
      const result = runCli([
        'feedback',
        '--alignment', '4',
        '--rework', 'minor',
        '--cycles', '1',
        '--worked', 'Good iteration speed',
        '--improve', 'Could improve error handling',
        '--session', 'test-session'
      ]);

      expect(result.status).toBe(0);
      expect(result.stdout).toContain('Feedback saved');

      // Check feedback file was created
      const feedbackDir = join(tempDir.path, '.logs', 'feedback');
      expect(existsSync(feedbackDir)).toBe(true);

      const files = execSync(`ls "${feedbackDir}"`, { encoding: 'utf-8' }).trim().split('\n');
      expect(files.length).toBeGreaterThan(0);
      expect(files[0]).toMatch(/\.jsonl$/);
    });

    test('feedback command with options skips prompts', async () => {
      initGitRepo();
      makeCommit('Initial', { 'README.md': '# Test' });

      const result = runCli([
        'feedback',
        '--alignment', '5',
        '--rework', 'none',
        '--cycles', '0',
        '--worked', 'Everything worked great',
        '--improve', 'Nothing to improve',
        '--session', 'test-session-123',
      ]);

      expect(result.status).toBe(0);
      expect(result.stdout).toContain('Feedback saved');

      // Check feedback content
      const feedbackDir = join(tempDir.path, '.logs', 'feedback');
      const files = execSync(`ls "${feedbackDir}"`, { encoding: 'utf-8' }).trim().split('\n');
      const feedbackContent = readFileSync(join(feedbackDir, files[0]), 'utf-8');
      const feedback = JSON.parse(feedbackContent.trim());

      expect(feedback.session_id).toBe('test-session-123');
      expect(feedback.alignment_score).toBe(5);
      expect(feedback.rework_level).toBe('none');
      expect(feedback.revision_cycles).toBe(0);
      expect(feedback.what_worked).toBe('Everything worked great');
    });

    test('feedback command shows summary', async () => {
      initGitRepo();
      makeCommit('Initial', { 'README.md': '# Test' });

      const result = runCli([
        'feedback',
        '--alignment', '4',
        '--rework', 'minor',
        '--cycles', '2',
        '--worked', 'Good',
        '--improve', 'Better',
      ]);

      expect(result.status).toBe(0);
      expect(result.stdout).toContain('Summary');
      expect(result.stdout).toContain('4/5');
      expect(result.stdout).toContain('minor');
    });

    test('feedback command clamps alignment to valid range', async () => {
      initGitRepo();
      makeCommit('Initial', { 'README.md': '# Test' });

      // Test that alignment 10 gets clamped to 5
      const result = runCli([
        'feedback',
        '--alignment', '10', // Invalid - should be clamped to 5
        '--rework', 'none',
        '--cycles', '0',
        '--worked', 'test',
        '--improve', 'test',
        '--session', 'clamp-test',
      ]);

      expect(result.status).toBe(0);
      expect(result.stdout).toContain('5/5'); // Clamped to 5
    });

    test('feedback help shows options', () => {
      const result = runCli(['feedback', '--help']);

      expect(result.status).toBe(0);
      expect(result.stdout).toContain('--alignment');
      expect(result.stdout).toContain('--rework');
      expect(result.stdout).toContain('--cycles');
      expect(result.stdout).toContain('--worked');
      expect(result.stdout).toContain('--improve');
    });
  });

  describe('error handling', () => {
    test('running in non-git directory fails gracefully', () => {
      // Without initializing git, the CLI should fail gracefully
      const result = runCli(['--quiet']);

      expect(result.status).not.toBe(0);
      // Should report that it's not a git repository
      const output = result.stdout + result.stderr;
      expect(output.toLowerCase()).toContain('git');
    });

    test('invalid option shows error', () => {
      const result = runCli(['--invalid-option']);

      expect(result.status).not.toBe(0);
    });
  });

  describe('output formatting', () => {
    test('quiet mode suppresses progress output', async () => {
      initGitRepo();
      makeCommit('Initial', { 'README.md': '# Test' });

      const quietResult = runCli(['--quiet']);
      const verboseResult = runCli([]);

      // Quiet should have less output
      expect(quietResult.stdout.length).toBeLessThan(verboseResult.stdout.length);
    });

    test('shows alerts when present', async () => {
      initGitRepo();
      makeCommit('Initial', { 'README.md': '# Test' });
      createMockLogsDir(tempDir);

      // Create a critical finding trigger
      const decisions = [
        { ts: '2026-02-01T10:00:00Z', decision: 'Agent decision', actor: 'agent', decision_type: 'one_way_door' },
      ];
      tempDir.createFile(
        '.logs/decisions/2026-02-01.jsonl',
        decisions.map(d => JSON.stringify(d)).join('\n')
      );

      const result = runCli([]);

      expect(result.status).toBe(0);
      expect(result.stdout).toContain('alert');
    });
  });

  describe('report content', () => {
    test('report includes git metrics section', async () => {
      initGitRepo();
      makeCommit('Initial', { 'README.md': '# Test' });
      makeCommit('Add feature', { 'src/app.ts': 'export const x = 1;' });

      runCli(['--quiet', '--sprint', 'metrics-test']);

      const reportPath = join(tempDir.path, 'docs', 'retrospectives', 'metrics-test', 'retrospective.json');
      const report = JSON.parse(readFileSync(reportPath, 'utf-8'));

      // With default fromRef, the first commit becomes the base and is excluded
      expect(report.summary.commits).toBeGreaterThanOrEqual(1);
      expect(report.scores).toBeDefined();
      expect(report.metadata.generated_by).toBe('agentic-retrospective');
    });

    test('report includes evidence map', async () => {
      initGitRepo();
      makeCommit('Initial', { 'README.md': '# Test' });

      runCli(['--quiet', '--sprint', 'evidence-test']);

      const evidencePath = join(tempDir.path, 'docs', 'retrospectives', 'evidence-test', 'evidence_map.json');
      const evidenceMap = JSON.parse(readFileSync(evidencePath, 'utf-8'));

      expect(evidenceMap.commits).toBeDefined();
      expect(evidenceMap.decisions).toBeDefined();
      expect(evidenceMap.orphans).toBeDefined();
    });

    test('markdown report is readable', async () => {
      initGitRepo();
      makeCommit('Initial', { 'README.md': '# Test' });
      makeCommit('Add feature', { 'src/app.ts': 'export const x = 1;' });
      createMockLogsDir(tempDir);

      const decisions = [
        { ts: '2026-02-01T10:00:00Z', decision: 'Use TypeScript', actor: 'human', category: 'architecture' },
      ];
      tempDir.createFile(
        '.logs/decisions/2026-02-01.jsonl',
        decisions.map(d => JSON.stringify(d)).join('\n')
      );

      runCli(['--quiet', '--sprint', 'markdown-test']);

      const mdPath = join(tempDir.path, 'docs', 'retrospectives', 'markdown-test', 'retrospective.md');
      const markdown = readFileSync(mdPath, 'utf-8');

      // Check for expected sections
      expect(markdown).toContain('# Sprint Retrospective');
      expect(markdown).toContain('## Executive Summary');
      expect(markdown).toContain('## Scoring Summary');
    });
  });
});

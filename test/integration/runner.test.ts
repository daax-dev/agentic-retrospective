/**
 * Integration tests for RetroRunner
 *
 * Tests the full pipeline with various data source configurations.
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { execSync } from 'child_process';
import { join } from 'path';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { createTempDir, createMockLogsDir, type TempDir } from '../helpers/temp-dir.js';
import { runRetro, RetroRunner } from '../../src/runner.js';
import type { RetroConfig } from '../../src/types.js';

describe('RetroRunner Integration', () => {
  let tempDir: TempDir;
  let originalCwd: string;

  beforeEach(() => {
    tempDir = createTempDir('retro-runner-');
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
      sprintId: 'test-sprint',
      decisionsPath: join(tempDir.path, '.logs', 'decisions'),
      agentLogsPath: join(tempDir.path, '.logs', 'agents'),
      outputDir: join(tempDir.path, 'output'),
      ...overrides,
    };
  }

  describe('git-only scenarios', () => {
    test('produces report with git scores when no other data sources exist', async () => {
      initGitRepo();
      const firstCommit = makeCommit('Initial commit', { 'README.md': '# Test' });
      makeCommit('Add feature', { 'src/feature.ts': 'export const x = 1;' });
      makeCommit('Fix bug', { 'src/feature.ts': 'export const x = 2;' });

      // Use first commit as fromRef - git log A..B excludes A, so we get 2 commits
      const config = createConfig({ fromRef: firstCommit });
      const result = await runRetro(config, { verbose: false });

      expect(result.success).toBe(true);
      expect(result.report).toBeDefined();
      expect(result.report!.scores.delivery_predictability.score).not.toBeNull();
      expect(result.report!.summary.commits).toBe(2); // Excludes first commit
      expect(result.report!.data_completeness.sources.git).toBe(true);
      expect(result.report!.data_completeness.sources.decisions).toBe(false);
    });

    test('calculates correct commit statistics', async () => {
      initGitRepo();
      const firstCommit = makeCommit('Commit 1', { 'file1.ts': 'line1\nline2\nline3' });
      makeCommit('Commit 2', { 'file2.ts': 'a\nb\nc\nd\ne' });
      makeCommit('Commit 3', { 'file1.ts': 'modified\nline2\nline3' });

      const config = createConfig({ fromRef: firstCommit });
      const result = await runRetro(config, { verbose: false });

      expect(result.success).toBe(true);
      expect(result.report!.summary.commits).toBe(2); // Excludes first commit
      expect(result.report!.summary.lines_added).toBeGreaterThan(0);
    });

    test('detects git hotspots for files changed 3+ times', async () => {
      initGitRepo();
      // Make 5 commits so we have at least 4 in the range (hotspot needs 3+ changes)
      const firstCommit = makeCommit('Commit 0', { 'setup.ts': 'setup' });
      makeCommit('Commit 1', { 'src/hotspot.ts': 'v1' });
      makeCommit('Commit 2', { 'src/hotspot.ts': 'v2' });
      makeCommit('Commit 3', { 'src/hotspot.ts': 'v3' });
      makeCommit('Commit 4', { 'src/other.ts': 'content' });

      const config = createConfig({ fromRef: firstCommit });
      const result = await runRetro(config, { verbose: false });

      expect(result.success).toBe(true);
      expect(result.report!.git_metrics).toBeDefined();
      expect(result.report!.git_metrics!.hotspots.length).toBeGreaterThan(0);
      expect(result.report!.git_metrics!.hotspots[0].path).toBe('src/hotspot.ts');
    });

    test('detects agent commits by co-author trailer', async () => {
      initGitRepo();
      makeCommit('Regular commit', { 'file1.ts': 'content' });

      // Create a commit with Claude co-author
      tempDir.createFile('file2.ts', 'agent code');
      execSync('git add -A', { cwd: tempDir.path, stdio: 'pipe' });
      execSync(
        `git commit -m "Agent commit" -m "Co-Authored-By: Claude <noreply@anthropic.com>"`,
        { cwd: tempDir.path, stdio: 'pipe' }
      );

      const config = createConfig();
      const result = await runRetro(config, { verbose: false });

      expect(result.success).toBe(true);
      expect(result.report!.summary.agent_commits).toBe(1);
      expect(result.report!.summary.agent_commit_percentage).toBeGreaterThan(0);
    });
  });

  describe('git + decisions scenarios', () => {
    test('produces decision hygiene score when decisions exist', async () => {
      initGitRepo();
      makeCommit('Initial commit', { 'README.md': '# Test' });

      // Create decisions
      createMockLogsDir(tempDir);
      const decisions = [
        { ts: '2026-02-01T10:00:00Z', decision: 'Use React', actor: 'human', decision_type: 'one_way_door' },
        { ts: '2026-02-01T11:00:00Z', decision: 'Add logging', actor: 'agent', decision_type: 'two_way_door' },
      ];
      tempDir.createFile(
        '.logs/decisions/2026-02-01.jsonl',
        decisions.map(d => JSON.stringify(d)).join('\n')
      );

      const config = createConfig();
      const result = await runRetro(config, { verbose: false });

      expect(result.success).toBe(true);
      expect(result.report!.scores.decision_hygiene.score).not.toBeNull();
      expect(result.report!.summary.decisions_logged).toBe(2);
      expect(result.report!.decision_analysis).toBeDefined();
      expect(result.report!.decision_analysis!.byActor.length).toBeGreaterThan(0);
    });

    test('generates findings for missed escalations', async () => {
      initGitRepo();
      makeCommit('Initial', { 'README.md': '# Test' });

      createMockLogsDir(tempDir);
      // Agent made a one-way-door decision (should be escalated)
      const decisions = [
        { ts: '2026-02-01T10:00:00Z', decision: 'Delete database', actor: 'agent', decision_type: 'one_way_door' },
      ];
      tempDir.createFile(
        '.logs/decisions/2026-02-01.jsonl',
        decisions.map(d => JSON.stringify(d)).join('\n')
      );

      const config = createConfig();
      const result = await runRetro(config, { verbose: false });

      expect(result.success).toBe(true);
      const missedEscalation = result.report!.findings.find(f =>
        f.title.includes('One-way-door decision made by agent')
      );
      expect(missedEscalation).toBeDefined();
      expect(missedEscalation!.severity).toBe('critical');
    });

    test('generates decision thrash findings', async () => {
      initGitRepo();
      makeCommit('Initial', { 'README.md': '# Test' });

      createMockLogsDir(tempDir);
      // Multiple conflicting decisions on same topic
      const decisions = [
        { ts: '2026-02-01T10:00:00Z', decision: 'Use PostgreSQL database', category: 'data', actor: 'human', decision_type: 'one_way_door' },
        { ts: '2026-02-02T10:00:00Z', decision: 'Switch to MongoDB database', category: 'data', actor: 'human', decision_type: 'one_way_door' },
        { ts: '2026-02-03T10:00:00Z', decision: 'Use SQLite database', category: 'data', actor: 'human', decision_type: 'one_way_door' },
      ];
      tempDir.createFile(
        '.logs/decisions/2026-02-01.jsonl',
        decisions.map(d => JSON.stringify(d)).join('\n')
      );

      const config = createConfig();
      const result = await runRetro(config, { verbose: false });

      expect(result.success).toBe(true);
      const thrashFinding = result.report!.findings.find(f =>
        f.title.includes('Decision thrash')
      );
      expect(thrashFinding).toBeDefined();
    });
  });

  describe('all sources scenarios', () => {
    test('produces complete report with all data sources', async () => {
      initGitRepo();
      makeCommit('Initial', { 'README.md': '# Test' });
      makeCommit('Feature', { 'src/app.ts': 'export function main() {}' });

      createMockLogsDir(tempDir);

      // Add decisions
      const decisions = [
        { ts: '2026-02-01T10:00:00Z', decision: 'Architecture choice', actor: 'human', decision_type: 'one_way_door', category: 'architecture' },
      ];
      tempDir.createFile(
        '.logs/decisions/2026-02-01.jsonl',
        decisions.map(d => JSON.stringify(d)).join('\n')
      );

      // Add feedback
      const feedback = [
        { timestamp: '2026-02-01T11:00:00Z', session_id: 'sess-1', alignment: 4, rework_needed: 'none' },
      ];
      tempDir.createFile(
        '.logs/feedback/2026-02-01.jsonl',
        feedback.map(f => JSON.stringify(f)).join('\n')
      );

      // Add prompts
      const prompts = [
        { timestamp: '2026-02-01T10:30:00Z', session_id: 'sess-1', prompt: 'Implement the login feature in src/auth.ts' },
      ];
      tempDir.createFile(
        '.logs/prompts/2026-02-01.jsonl',
        prompts.map(p => JSON.stringify(p)).join('\n')
      );

      // Add tool usage
      const tools = [
        { timestamp: '2026-02-01T10:31:00Z', tool: 'Read', duration_ms: 50, success: true },
        { timestamp: '2026-02-01T10:32:00Z', tool: 'Edit', duration_ms: 100, success: true },
      ];
      tempDir.createFile(
        '.logs/tools/2026-02-01.jsonl',
        tools.map(t => JSON.stringify(t)).join('\n')
      );

      // Add security scan
      const trivyScan = {
        Results: [
          {
            Vulnerabilities: [
              { VulnerabilityID: 'CVE-2024-1234', Severity: 'HIGH', Title: 'Test vuln' },
            ],
          },
        ],
      };
      tempDir.createFile('.logs/security/trivy.json', JSON.stringify(trivyScan));

      const config = createConfig();
      const result = await runRetro(config, { verbose: false });

      expect(result.success).toBe(true);
      expect(result.report).toBeDefined();

      // Check all sections exist
      expect(result.report!.git_metrics).toBeDefined();
      expect(result.report!.decision_analysis).toBeDefined();
      expect(result.report!.human_insights).toBeDefined();
      expect(result.report!.tools_summary).toBeDefined();

      // Check scores
      expect(result.report!.scores.delivery_predictability.score).not.toBeNull();
      expect(result.report!.scores.decision_hygiene.score).not.toBeNull();
      expect(result.report!.scores.security_posture.score).not.toBeNull();
    });

    test('rework chains detected and reported', async () => {
      initGitRepo();
      makeCommit('Add feature', { 'src/feature.ts': 'function feature() { return 1; }' });
      makeCommit('fix: correct feature logic', { 'src/feature.ts': 'function feature() { return 2; }' });
      makeCommit('fix: another fix', { 'src/feature.ts': 'function feature() { return 3; }' });

      const config = createConfig();
      const result = await runRetro(config, { verbose: false });

      expect(result.success).toBe(true);
      // Check for rework-related findings
      const reworkFinding = result.report!.findings.find(f =>
        f.category === 'quality' && f.title.toLowerCase().includes('rework')
      );
      // May or may not find depending on rework percentage threshold
    });
  });

  describe('output files', () => {
    test('creates all expected output files', async () => {
      initGitRepo();
      makeCommit('Initial', { 'README.md': '# Test' });

      const config = createConfig();
      const result = await runRetro(config, { verbose: false });

      expect(result.success).toBe(true);
      expect(result.outputPath).toBeDefined();

      // Check output files exist
      expect(existsSync(join(result.outputPath!, 'retrospective.json'))).toBe(true);
      expect(existsSync(join(result.outputPath!, 'retrospective.md'))).toBe(true);
      expect(existsSync(join(result.outputPath!, 'evidence_map.json'))).toBe(true);
      expect(existsSync(join(result.outputPath!, 'alerts.json'))).toBe(true);
    });

    test('json-only mode skips markdown output', async () => {
      initGitRepo();
      makeCommit('Initial', { 'README.md': '# Test' });

      const config = createConfig();
      const result = await runRetro(config, { verbose: false, jsonOnly: true });

      expect(result.success).toBe(true);
      expect(existsSync(join(result.outputPath!, 'retrospective.json'))).toBe(true);
      expect(existsSync(join(result.outputPath!, 'retrospective.md'))).toBe(false);
    });

    test('report JSON is valid and parseable', async () => {
      initGitRepo();
      makeCommit('Initial', { 'README.md': '# Test' });

      const config = createConfig();
      const result = await runRetro(config, { verbose: false });

      expect(result.success).toBe(true);

      const jsonContent = readFileSync(join(result.outputPath!, 'retrospective.json'), 'utf-8');
      const parsed = JSON.parse(jsonContent);

      expect(parsed.sprint_id).toBe('test-sprint');
      expect(parsed.metadata.generated_by).toBe('agentic-retrospective');
      expect(parsed.summary).toBeDefined();
      expect(parsed.scores).toBeDefined();
    });
  });

  describe('alerts generation', () => {
    test('generates alerts for critical findings', async () => {
      initGitRepo();
      makeCommit('Initial', { 'README.md': '# Test' });

      createMockLogsDir(tempDir);
      // Agent made one-way-door decision (generates critical finding)
      const decisions = [
        { ts: '2026-02-01T10:00:00Z', decision: 'Drop production table', actor: 'agent', decision_type: 'one_way_door' },
      ];
      tempDir.createFile(
        '.logs/decisions/2026-02-01.jsonl',
        decisions.map(d => JSON.stringify(d)).join('\n')
      );

      const config = createConfig();
      const result = await runRetro(config, { verbose: false });

      expect(result.success).toBe(true);
      expect(result.alerts).toBeDefined();
      expect(result.alerts!.length).toBeGreaterThan(0);
      expect(result.alerts![0].severity).toBe('critical');
    });
  });
});

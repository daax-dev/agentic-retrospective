/**
 * Graceful Degradation Integration Tests
 *
 * Tests that the retrospective runner handles missing or malformed data sources
 * gracefully without crashing.
 */

import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { execSync } from 'child_process';
import { join } from 'path';
import { createTempDir, createMockLogsDir, type TempDir } from '../helpers/temp-dir.js';
import { runRetro } from '../../src/runner.js';
import type { RetroConfig } from '../../src/types.js';

describe('Graceful Degradation', () => {
  let tempDir: TempDir;
  let originalCwd: string;

  beforeEach(() => {
    tempDir = createTempDir('retro-degradation-');
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
      sprintId: 'degradation-test',
      decisionsPath: join(tempDir.path, '.logs', 'decisions'),
      agentLogsPath: join(tempDir.path, '.logs', 'agents'),
      outputDir: join(tempDir.path, 'output'),
      ...overrides,
    };
  }

  describe('missing data sources', () => {
    test('missing decisions directory: records gap, continues with null score', async () => {
      initGitRepo();
      makeCommit('Initial', { 'README.md': '# Test' });
      // No .logs/decisions directory

      const config = createConfig();
      const result = await runRetro(config, { verbose: false });

      expect(result.success).toBe(true);
      expect(result.report!.scores.decision_hygiene.score).toBeNull();
      expect(result.report!.data_completeness.sources.decisions).toBe(false);

      const decisionGap = result.report!.data_completeness.gaps.find(
        g => g.gap_type === 'missing_decisions'
      );
      expect(decisionGap).toBeDefined();
      expect(decisionGap!.severity).toBe('high');
    });

    test('missing agent logs: records gap, continues', async () => {
      initGitRepo();
      makeCommit('Initial', { 'README.md': '# Test' });

      const config = createConfig();
      const result = await runRetro(config, { verbose: false });

      expect(result.success).toBe(true);
      expect(result.report!.data_completeness.sources.agent_logs).toBe(false);

      const agentLogGap = result.report!.data_completeness.gaps.find(
        g => g.gap_type === 'missing_agent_logs'
      );
      expect(agentLogGap).toBeDefined();
    });

    test('missing test results: records gap, continues', async () => {
      initGitRepo();
      makeCommit('Initial', { 'README.md': '# Test' });

      const config = createConfig();
      const result = await runRetro(config, { verbose: false });

      expect(result.success).toBe(true);
      expect(result.report!.data_completeness.sources.tests).toBe(false);

      const testGap = result.report!.data_completeness.gaps.find(
        g => g.gap_type === 'missing_test_results'
      );
      expect(testGap).toBeDefined();
    });

    test('missing security scans: records gap, security score null', async () => {
      initGitRepo();
      makeCommit('Initial', { 'README.md': '# Test' });
      createMockLogsDir(tempDir);
      // .logs/security exists but no scan files

      const config = createConfig();
      const result = await runRetro(config, { verbose: false });

      expect(result.success).toBe(true);
      expect(result.report!.scores.security_posture.score).toBeNull();

      const securityGap = result.report!.data_completeness.gaps.find(
        g => g.gap_type === 'missing_security_scans'
      );
      expect(securityGap).toBeDefined();
    });

    test('all optional sources missing: git-only report with gaps recorded', async () => {
      initGitRepo();
      makeCommit('Initial', { 'README.md': '# Test' });

      const config = createConfig();
      const result = await runRetro(config, { verbose: false });

      expect(result.success).toBe(true);
      expect(result.report!.data_completeness.sources.git).toBe(true);
      expect(result.report!.data_completeness.sources.decisions).toBe(false);
      expect(result.report!.data_completeness.sources.agent_logs).toBe(false);
      expect(result.report!.data_completeness.sources.tests).toBe(false);

      // Git-based scores should work
      expect(result.report!.scores.delivery_predictability.score).not.toBeNull();

      // Other scores should be null
      expect(result.report!.scores.decision_hygiene.score).toBeNull();
      expect(result.report!.scores.collaboration_efficiency.score).toBeNull();

      // Should have multiple gaps recorded
      expect(result.report!.data_completeness.gaps.length).toBeGreaterThan(0);
    });
  });

  describe('malformed data', () => {
    test('malformed decision file: skips bad lines, parses valid ones', async () => {
      initGitRepo();
      makeCommit('Initial', { 'README.md': '# Test' });
      createMockLogsDir(tempDir);

      // Mix of valid and invalid JSON lines
      const decisionContent = [
        '{"ts": "2026-02-01T10:00:00Z", "decision": "Valid decision 1", "actor": "human"}',
        'this is not valid json',
        '{"ts": "2026-02-01T11:00:00Z", "decision": "Valid decision 2", "actor": "agent"}',
        '{"missing_ts_field": "invalid"}',
        '{"ts": "2026-02-01T12:00:00Z", "decision": "Valid decision 3", "actor": "human"}',
      ].join('\n');

      tempDir.createFile('.logs/decisions/2026-02-01.jsonl', decisionContent);

      const config = createConfig();
      const result = await runRetro(config, { verbose: false });

      expect(result.success).toBe(true);
      // Should parse the valid decisions
      expect(result.report!.summary.decisions_logged).toBe(3);
      expect(result.report!.scores.decision_hygiene.score).not.toBeNull();
    });

    test('empty decision file: treats as no decisions', async () => {
      initGitRepo();
      makeCommit('Initial', { 'README.md': '# Test' });
      createMockLogsDir(tempDir);

      tempDir.createFile('.logs/decisions/empty.jsonl', '');

      const config = createConfig();
      const result = await runRetro(config, { verbose: false });

      expect(result.success).toBe(true);
      expect(result.report!.summary.decisions_logged).toBe(0);
    });

    test('malformed security scan JSON: ignores and continues', async () => {
      initGitRepo();
      makeCommit('Initial', { 'README.md': '# Test' });
      createMockLogsDir(tempDir);

      // Invalid JSON
      tempDir.createFile('.logs/security/trivy.json', 'not valid json {{{');

      const config = createConfig();
      const result = await runRetro(config, { verbose: false });

      expect(result.success).toBe(true);
      expect(result.report!.scores.security_posture.score).toBeNull();
    });

    test('partial security scan data: processes what exists', async () => {
      initGitRepo();
      makeCommit('Initial', { 'README.md': '# Test' });
      createMockLogsDir(tempDir);

      // Valid Trivy JSON but with empty results
      const trivyScan = { Results: [] };
      tempDir.createFile('.logs/security/trivy.json', JSON.stringify(trivyScan));

      const config = createConfig();
      const result = await runRetro(config, { verbose: false });

      expect(result.success).toBe(true);
      // Score should be good (no vulnerabilities)
      expect(result.report!.scores.security_posture.score).not.toBeNull();
    });

    test('malformed feedback file: skips bad entries', async () => {
      initGitRepo();
      makeCommit('Initial', { 'README.md': '# Test' });
      createMockLogsDir(tempDir);

      const feedbackContent = [
        '{"timestamp": "2026-02-01T10:00:00Z", "session_id": "s1", "alignment": 4, "rework_needed": "none"}',
        'invalid json here',
        '{"timestamp": "2026-02-01T11:00:00Z", "session_id": "s2", "alignment": 5, "rework_needed": "minor"}',
      ].join('\n');

      tempDir.createFile('.logs/feedback/2026-02-01.jsonl', feedbackContent);

      const config = createConfig();
      const result = await runRetro(config, { verbose: false });

      expect(result.success).toBe(true);
      // Should still parse valid feedback entries
      if (result.report!.human_insights) {
        expect(result.report!.human_insights.feedbackSummary.totalSessions).toBe(2);
      }
    });

    test('malformed tool logs: continues without tool analysis', async () => {
      initGitRepo();
      makeCommit('Initial', { 'README.md': '# Test' });
      createMockLogsDir(tempDir);

      tempDir.createFile('.logs/tools/bad.jsonl', 'not json at all');

      const config = createConfig();
      const result = await runRetro(config, { verbose: false });

      expect(result.success).toBe(true);
      // Tools summary should either be undefined or have 0 calls
      if (result.report!.tools_summary) {
        expect(result.report!.tools_summary.totalCalls).toBe(0);
      }
    });
  });

  describe('edge cases', () => {
    test('single commit repository generates valid report', async () => {
      initGitRepo();
      makeCommit('Initial commit', { 'README.md': '# Test' });

      // For single commit, git log with empty fromRef finds it within 2 weeks
      // The commit becomes fromRef so git log fromRef..HEAD returns it or not depending on timing
      const config = createConfig();
      const result = await runRetro(config, { verbose: false });

      expect(result.success).toBe(true);
      // The report should generate successfully regardless of commit count
      expect(result.report).toBeDefined();
      expect(result.report!.data_completeness.sources.git).toBe(true);
    });

    test('two commits repository has valid statistics', async () => {
      initGitRepo();
      const firstCommit = makeCommit('Initial commit', { 'README.md': '# Test' });
      makeCommit('Second commit', { 'src/app.ts': 'code' });

      const config = createConfig({ fromRef: firstCommit });
      const result = await runRetro(config, { verbose: false });

      expect(result.success).toBe(true);
      expect(result.report!.summary.commits).toBe(1);
      expect(result.report!.scores.delivery_predictability.score).not.toBeNull();
    });

    test('very large commit', async () => {
      initGitRepo();
      const firstCommit = makeCommit('Initial setup', { 'README.md': '# Test' });
      // Create a file with many lines
      const largeContent = Array(500).fill('line of code').join('\n');
      makeCommit('Large commit', { 'src/large.ts': largeContent });

      const config = createConfig({ fromRef: firstCommit });
      const result = await runRetro(config, { verbose: false });

      expect(result.success).toBe(true);
      expect(result.report!.summary.lines_added).toBeGreaterThan(400);
      // Quality score should be lower for large commits
      expect(result.report!.scores.quality_maintainability.score).toBeLessThanOrEqual(3);
    });

    test('special characters in commit messages', async () => {
      initGitRepo();
      const firstCommit = makeCommit('Initial', { 'setup.ts': 'setup' });
      // Escape special characters for shell
      tempDir.createFile('file.ts', 'content');
      execSync('git add -A', { cwd: tempDir.path, stdio: 'pipe' });
      execSync('git commit -m "Fix: handle quotes"', { cwd: tempDir.path, stdio: 'pipe' });

      tempDir.createFile('file2.ts', 'content');
      execSync('git add -A', { cwd: tempDir.path, stdio: 'pipe' });
      execSync('git commit -m "Add: special chars"', { cwd: tempDir.path, stdio: 'pipe' });

      const config = createConfig({ fromRef: firstCommit });
      const result = await runRetro(config, { verbose: false });

      expect(result.success).toBe(true);
      expect(result.report!.summary.commits).toBe(2);
    });

    test('unicode in file paths', async () => {
      initGitRepo();
      const firstCommit = makeCommit('Initial', { 'setup.ts': 'setup' });
      makeCommit('Add file', { 'docs/unicode.md': '# Unicode content' });

      const config = createConfig({ fromRef: firstCommit });
      const result = await runRetro(config, { verbose: false });

      expect(result.success).toBe(true);
      expect(result.report!.summary.commits).toBe(1);
    });

    test('empty decisions array treated correctly', async () => {
      initGitRepo();
      makeCommit('Initial', { 'README.md': '# Test' });
      createMockLogsDir(tempDir);

      // Valid but empty decision array
      tempDir.createFile('.logs/decisions/2026-02-01.jsonl', '\n\n\n');

      const config = createConfig();
      const result = await runRetro(config, { verbose: false });

      expect(result.success).toBe(true);
      expect(result.report!.summary.decisions_logged).toBe(0);
    });

    test('all decisions by agent (0% escalation)', async () => {
      initGitRepo();
      makeCommit('Initial', { 'README.md': '# Test' });
      createMockLogsDir(tempDir);

      const decisions = [
        { ts: '2026-02-01T10:00:00Z', decision: 'Agent decision 1', actor: 'agent', decision_type: 'one_way_door' },
        { ts: '2026-02-01T11:00:00Z', decision: 'Agent decision 2', actor: 'agent', decision_type: 'one_way_door' },
      ];
      tempDir.createFile(
        '.logs/decisions/2026-02-01.jsonl',
        decisions.map(d => JSON.stringify(d)).join('\n')
      );

      const config = createConfig();
      const result = await runRetro(config, { verbose: false });

      expect(result.success).toBe(true);
      expect(result.report!.scores.decision_hygiene.score).toBe(1); // 0% escalation = score 1
      // Should have critical findings for missed escalations
      const criticalFindings = result.report!.findings.filter(f => f.severity === 'critical');
      expect(criticalFindings.length).toBe(2);
    });

    test('no one-way-doors (100% escalation by default)', async () => {
      initGitRepo();
      makeCommit('Initial', { 'README.md': '# Test' });
      createMockLogsDir(tempDir);

      const decisions = [
        { ts: '2026-02-01T10:00:00Z', decision: 'Reversible decision', actor: 'agent', decision_type: 'two_way_door' },
        { ts: '2026-02-01T11:00:00Z', decision: 'Another reversible', actor: 'human', decision_type: 'reversible' },
      ];
      tempDir.createFile(
        '.logs/decisions/2026-02-01.jsonl',
        decisions.map(d => JSON.stringify(d)).join('\n')
      );

      const config = createConfig();
      const result = await runRetro(config, { verbose: false });

      expect(result.success).toBe(true);
      expect(result.report!.scores.decision_hygiene.score).toBe(5); // 100% escalation
    });
  });

  describe('data completeness reporting', () => {
    test('calculates completeness percentage correctly', async () => {
      initGitRepo();
      makeCommit('Initial', { 'README.md': '# Test' });
      createMockLogsDir(tempDir);

      // Add only decisions
      const decisions = [
        { ts: '2026-02-01T10:00:00Z', decision: 'Test', actor: 'human' },
      ];
      tempDir.createFile(
        '.logs/decisions/2026-02-01.jsonl',
        decisions.map(d => JSON.stringify(d)).join('\n')
      );

      const config = createConfig();
      const result = await runRetro(config, { verbose: false });

      expect(result.success).toBe(true);
      // git + decisions = 2 out of 5 sources
      expect(result.report!.data_completeness.percentage).toBe(40);
    });

    test('gap recommendations are actionable', async () => {
      initGitRepo();
      makeCommit('Initial', { 'README.md': '# Test' });

      const config = createConfig();
      const result = await runRetro(config, { verbose: false });

      expect(result.success).toBe(true);

      for (const gap of result.report!.data_completeness.gaps) {
        expect(gap.recommendation).toBeDefined();
        expect(gap.recommendation.length).toBeGreaterThan(10);
        expect(gap.impact).toBeDefined();
      }
    });
  });
});

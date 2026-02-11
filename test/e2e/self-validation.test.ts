/**
 * Self-Validation Test
 *
 * Runs agentic-retrospective against its own repository to validate
 * that the tool produces useful insights on real data.
 */

import { describe, test, expect } from 'vitest';
import { join } from 'path';
import { existsSync } from 'fs';
import { runRetro } from '../../src/runner.js';
import type { RetroConfig } from '../../src/types.js';

describe('Self-Validation', () => {
  // Path to the agentic-retrospective project root
  const projectRoot = process.cwd();

  test('generates valid report for this repository', async () => {
    const config: RetroConfig = {
      fromRef: 'HEAD~20',
      toRef: 'HEAD',
      sprintId: 'self-test',
      decisionsPath: join(projectRoot, '.logs', 'decisions'),
      agentLogsPath: join(projectRoot, '.logs', 'agents'),
      outputDir: join(projectRoot, 'test-output'),
    };

    const result = await runRetro(config, { verbose: false });

    expect(result.success).toBe(true);
    expect(result.report).toBeDefined();
  });

  test('git analysis produces valid commit data', async () => {
    const config: RetroConfig = {
      fromRef: 'HEAD~20',
      toRef: 'HEAD',
      sprintId: 'self-test-git',
      decisionsPath: join(projectRoot, '.logs', 'decisions'),
      agentLogsPath: join(projectRoot, '.logs', 'agents'),
      outputDir: join(projectRoot, 'test-output'),
    };

    const result = await runRetro(config, { verbose: false });

    expect(result.success).toBe(true);
    expect(result.report!.summary.commits).toBeGreaterThan(0);
    expect(result.report!.summary.contributors).toBeGreaterThan(0);
    expect(result.report!.summary.lines_added).toBeGreaterThan(0);
    expect(result.report!.data_completeness.sources.git).toBe(true);
  });

  test('delivery predictability score is calculated', async () => {
    const config: RetroConfig = {
      fromRef: 'HEAD~20',
      toRef: 'HEAD',
      sprintId: 'self-test-scores',
      decisionsPath: join(projectRoot, '.logs', 'decisions'),
      agentLogsPath: join(projectRoot, '.logs', 'agents'),
      outputDir: join(projectRoot, 'test-output'),
    };

    const result = await runRetro(config, { verbose: false });

    expect(result.success).toBe(true);
    expect(result.report!.scores.delivery_predictability.score).not.toBeNull();
    expect(result.report!.scores.delivery_predictability.confidence).toBe('high');
    expect(result.report!.scores.delivery_predictability.evidence.length).toBeGreaterThan(0);
  });

  test('quality maintainability score is calculated', async () => {
    const config: RetroConfig = {
      fromRef: 'HEAD~20',
      toRef: 'HEAD',
      sprintId: 'self-test-quality',
      decisionsPath: join(projectRoot, '.logs', 'decisions'),
      agentLogsPath: join(projectRoot, '.logs', 'agents'),
      outputDir: join(projectRoot, 'test-output'),
    };

    const result = await runRetro(config, { verbose: false });

    expect(result.success).toBe(true);
    expect(result.report!.scores.quality_maintainability.score).not.toBeNull();
    expect(result.report!.scores.quality_maintainability.evidence.length).toBeGreaterThan(0);
  });

  test('git metrics are populated', async () => {
    const config: RetroConfig = {
      fromRef: 'HEAD~20',
      toRef: 'HEAD',
      sprintId: 'self-test-metrics',
      decisionsPath: join(projectRoot, '.logs', 'decisions'),
      agentLogsPath: join(projectRoot, '.logs', 'agents'),
      outputDir: join(projectRoot, 'test-output'),
    };

    const result = await runRetro(config, { verbose: false });

    expect(result.success).toBe(true);
    expect(result.report!.git_metrics).toBeDefined();
    expect(result.report!.git_metrics!.filesByExtension.length).toBeGreaterThan(0);
    expect(result.report!.git_metrics!.totalFilesChanged).toBeGreaterThan(0);
  });

  test('evidence map is built correctly', async () => {
    const config: RetroConfig = {
      fromRef: 'HEAD~20',
      toRef: 'HEAD',
      sprintId: 'self-test-evidence',
      decisionsPath: join(projectRoot, '.logs', 'decisions'),
      agentLogsPath: join(projectRoot, '.logs', 'agents'),
      outputDir: join(projectRoot, 'test-output'),
    };

    const result = await runRetro(config, { verbose: false });

    expect(result.success).toBe(true);
    expect(result.report!.evidence_map).toBeDefined();
    expect(result.report!.evidence_map.commits).toBeDefined();
    expect(result.report!.evidence_map.decisions).toBeDefined();
    expect(result.report!.evidence_map.orphans).toBeDefined();

    // Should have indexed commits
    const commitHashes = Object.keys(result.report!.evidence_map.commits);
    expect(commitHashes.length).toBeGreaterThan(0);
  });

  test('output files are created', async () => {
    const outputDir = join(projectRoot, 'test-output', 'self-test-files');

    const config: RetroConfig = {
      fromRef: 'HEAD~10',
      toRef: 'HEAD',
      sprintId: 'self-test-files',
      decisionsPath: join(projectRoot, '.logs', 'decisions'),
      agentLogsPath: join(projectRoot, '.logs', 'agents'),
      outputDir: join(projectRoot, 'test-output'),
    };

    const result = await runRetro(config, { verbose: false });

    expect(result.success).toBe(true);
    expect(result.outputPath).toBeDefined();
    expect(existsSync(join(result.outputPath!, 'retrospective.json'))).toBe(true);
    expect(existsSync(join(result.outputPath!, 'retrospective.md'))).toBe(true);
    expect(existsSync(join(result.outputPath!, 'evidence_map.json'))).toBe(true);
    expect(existsSync(join(result.outputPath!, 'alerts.json'))).toBe(true);
  });

  test('report metadata is correct', async () => {
    const config: RetroConfig = {
      fromRef: 'HEAD~10',
      toRef: 'HEAD',
      sprintId: 'self-test-metadata',
      decisionsPath: join(projectRoot, '.logs', 'decisions'),
      agentLogsPath: join(projectRoot, '.logs', 'agents'),
      outputDir: join(projectRoot, 'test-output'),
    };

    const result = await runRetro(config, { verbose: false });

    expect(result.success).toBe(true);
    expect(result.report!.metadata.generated_by).toBe('agentic-retrospective');
    expect(result.report!.metadata.tool_version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(result.report!.metadata.schema_version).toMatch(/^\d+\.\d+$/);
  });

  test('graceful handling of missing optional data', async () => {
    const config: RetroConfig = {
      fromRef: 'HEAD~10',
      toRef: 'HEAD',
      sprintId: 'self-test-graceful',
      decisionsPath: join(projectRoot, '.logs', 'nonexistent-decisions'),
      agentLogsPath: join(projectRoot, '.logs', 'nonexistent-agents'),
      outputDir: join(projectRoot, 'test-output'),
    };

    const result = await runRetro(config, { verbose: false });

    expect(result.success).toBe(true);
    // Should have gaps recorded for missing data
    expect(result.report!.data_completeness.gaps.length).toBeGreaterThan(0);
    // Decision hygiene should be null without decision logs
    expect(result.report!.scores.decision_hygiene.score).toBeNull();
  });
});

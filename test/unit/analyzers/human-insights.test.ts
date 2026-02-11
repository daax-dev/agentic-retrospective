/**
 * Unit tests for HumanInsightsAnalyzer
 */

import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { HumanInsightsAnalyzer } from '../../../src/analyzers/human-insights.js';
import { getFixturePath, createTempDir, type TempDir } from '../../fixtures/index.js';
import { copyFileSync } from 'fs';
import { join } from 'path';
import type { CommitInfo } from '../../../src/types.js';

describe('HumanInsightsAnalyzer', () => {
  let tempDir: TempDir;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    tempDir.cleanup();
  });

  describe('analyze', () => {
    test('returns empty insights for non-existent directory', () => {
      const analyzer = new HumanInsightsAnalyzer('/nonexistent/path');
      const result = analyzer.analyze();

      expect(result.feedbackSummary.totalSessions).toBe(0);
      expect(result.promptPatterns.effective).toHaveLength(0);
      expect(result.promptPatterns.problematic).toHaveLength(0);
    });

    test('calculates avgAlignment from feedback', () => {
      const logsDir = tempDir.createDir('.logs');
      tempDir.createDir('.logs/feedback');
      copyFileSync(
        getFixturePath('feedback/high-alignment.jsonl'),
        join(logsDir, 'feedback', 'high.jsonl')
      );

      const analyzer = new HumanInsightsAnalyzer(logsDir);
      const result = analyzer.analyze();

      // high-alignment.jsonl has alignment scores: 5, 4, 5, 4, 5 = avg 4.6
      expect(result.feedbackSummary.avgAlignment).toBeGreaterThan(4);
      expect(result.feedbackSummary.avgAlignment).toBeLessThanOrEqual(5);
    });

    test('calculates rework distribution', () => {
      const logsDir = tempDir.createDir('.logs');
      tempDir.createDir('.logs/feedback');
      copyFileSync(
        getFixturePath('feedback/high-alignment.jsonl'),
        join(logsDir, 'feedback', 'high.jsonl')
      );

      const analyzer = new HumanInsightsAnalyzer(logsDir);
      const result = analyzer.analyze();

      // high-alignment.jsonl has all rework_needed: "none"
      expect(result.feedbackSummary.reworkDistribution.none).toBe(5);
      expect(result.feedbackSummary.reworkDistribution.minor).toBe(0);
      expect(result.feedbackSummary.reworkDistribution.significant).toBe(0);
    });

    test('calculates avgRevisionCycles', () => {
      const logsDir = tempDir.createDir('.logs');
      tempDir.createDir('.logs/feedback');
      copyFileSync(
        getFixturePath('feedback/low-alignment.jsonl'),
        join(logsDir, 'feedback', 'low.jsonl')
      );

      const analyzer = new HumanInsightsAnalyzer(logsDir);
      const result = analyzer.analyze();

      // low-alignment.jsonl has revision_cycles: 4, 3, 5, 6, 3 = avg 4.2
      expect(result.feedbackSummary.avgRevisionCycles).toBeGreaterThan(3);
      expect(result.feedbackSummary.avgRevisionCycles).toBeLessThan(5);
    });

    test('extracts top improvements from feedback', () => {
      const logsDir = tempDir.createDir('.logs');
      tempDir.createDir('.logs/feedback');
      copyFileSync(
        getFixturePath('feedback/low-alignment.jsonl'),
        join(logsDir, 'feedback', 'low.jsonl')
      );

      const analyzer = new HumanInsightsAnalyzer(logsDir);
      const result = analyzer.analyze();

      expect(result.topImprovements.length).toBeGreaterThan(0);
      expect(result.topImprovements.some(i => i.includes('requirements') || i.includes('assume') || i.includes('instructions'))).toBe(true);
    });

    test('extracts top successes from feedback', () => {
      const logsDir = tempDir.createDir('.logs');
      tempDir.createDir('.logs/feedback');
      copyFileSync(
        getFixturePath('feedback/high-alignment.jsonl'),
        join(logsDir, 'feedback', 'high.jsonl')
      );

      const analyzer = new HumanInsightsAnalyzer(logsDir);
      const result = analyzer.analyze();

      expect(result.topSuccesses.length).toBeGreaterThan(0);
    });
  });

  describe('hasData', () => {
    test('returns false when no data loaded', () => {
      const analyzer = new HumanInsightsAnalyzer('/nonexistent/path');
      analyzer.loadLogs();
      expect(analyzer.hasData()).toBe(false);
    });

    test('returns true when feedback data exists', () => {
      const logsDir = tempDir.createDir('.logs');
      tempDir.createDir('.logs/feedback');
      copyFileSync(
        getFixturePath('feedback/high-alignment.jsonl'),
        join(logsDir, 'feedback', 'high.jsonl')
      );

      const analyzer = new HumanInsightsAnalyzer(logsDir);
      analyzer.loadLogs();
      expect(analyzer.hasData()).toBe(true);
    });
  });

  describe('getDataStatus', () => {
    test('reports correct counts', () => {
      const logsDir = tempDir.createDir('.logs');
      tempDir.createDir('.logs/feedback');
      tempDir.createDir('.logs/prompts');

      // Create feedback
      copyFileSync(
        getFixturePath('feedback/high-alignment.jsonl'),
        join(logsDir, 'feedback', 'high.jsonl')
      );

      // Create prompts
      tempDir.createFile('.logs/prompts/test.jsonl',
        '{"timestamp":"2026-02-01T10:00:00Z","session_id":"sess-001","prompt":"Test prompt"}\n' +
        '{"timestamp":"2026-02-01T11:00:00Z","session_id":"sess-002","prompt":"Another prompt"}\n'
      );

      const analyzer = new HumanInsightsAnalyzer(logsDir);
      analyzer.loadLogs();
      const status = analyzer.getDataStatus();

      expect(status.feedback).toBe(5);
      expect(status.prompts).toBe(2);
    });
  });

  describe('calculateFixToFeatureRatio', () => {
    test('identifies fix commits by message patterns', () => {
      const commits: CommitInfo[] = [
        { hash: '1', shortHash: '1', author: 'a', email: '', date: '', subject: 'fix: resolve bug', body: '', files: [], linesAdded: 10, linesRemoved: 5 },
        { hash: '2', shortHash: '2', author: 'a', email: '', date: '', subject: 'bugfix: handle edge case', body: '', files: [], linesAdded: 20, linesRemoved: 10 },
        { hash: '3', shortHash: '3', author: 'a', email: '', date: '', subject: 'hotfix: production issue', body: '', files: [], linesAdded: 5, linesRemoved: 2 },
      ];

      const result = HumanInsightsAnalyzer.calculateFixToFeatureRatio(commits);

      expect(result.fixCommits).toBe(3);
      expect(result.featureCommits).toBe(0);
    });

    test('identifies feature commits by message patterns', () => {
      const commits: CommitInfo[] = [
        { hash: '1', shortHash: '1', author: 'a', email: '', date: '', subject: 'feat: add login', body: '', files: [], linesAdded: 100, linesRemoved: 0 },
        { hash: '2', shortHash: '2', author: 'a', email: '', date: '', subject: 'add: new component', body: '', files: [], linesAdded: 50, linesRemoved: 0 },
        { hash: '3', shortHash: '3', author: 'a', email: '', date: '', subject: 'implement auth flow', body: '', files: [], linesAdded: 200, linesRemoved: 20 },
      ];

      const result = HumanInsightsAnalyzer.calculateFixToFeatureRatio(commits);

      expect(result.fixCommits).toBe(0);
      expect(result.featureCommits).toBe(3);
    });

    test('calculates ratio correctly', () => {
      const commits: CommitInfo[] = [
        { hash: '1', shortHash: '1', author: 'a', email: '', date: '', subject: 'feat: add login', body: '', files: [], linesAdded: 100, linesRemoved: 0 },
        { hash: '2', shortHash: '2', author: 'a', email: '', date: '', subject: 'fix: resolve bug', body: '', files: [], linesAdded: 10, linesRemoved: 5 },
        { hash: '3', shortHash: '3', author: 'a', email: '', date: '', subject: 'feat: add logout', body: '', files: [], linesAdded: 50, linesRemoved: 0 },
      ];

      const result = HumanInsightsAnalyzer.calculateFixToFeatureRatio(commits);

      expect(result.fixCommits).toBe(1);
      expect(result.featureCommits).toBe(2);
      expect(result.ratio).toBe(0.5); // 1/2 = 0.5
    });

    test('returns healthy status when ratio is low', () => {
      const commits: CommitInfo[] = [
        { hash: '1', shortHash: '1', author: 'a', email: '', date: '', subject: 'feat: add login', body: '', files: [], linesAdded: 100, linesRemoved: 0 },
        { hash: '2', shortHash: '2', author: 'a', email: '', date: '', subject: 'feat: add auth', body: '', files: [], linesAdded: 50, linesRemoved: 0 },
        { hash: '3', shortHash: '3', author: 'a', email: '', date: '', subject: 'feat: add logout', body: '', files: [], linesAdded: 50, linesRemoved: 0 },
        { hash: '4', shortHash: '4', author: 'a', email: '', date: '', subject: 'feat: add profile', body: '', files: [], linesAdded: 80, linesRemoved: 0 },
        { hash: '5', shortHash: '5', author: 'a', email: '', date: '', subject: 'feat: add settings', body: '', files: [], linesAdded: 60, linesRemoved: 0 },
        { hash: '6', shortHash: '6', author: 'a', email: '', date: '', subject: 'feat: add dashboard', body: '', files: [], linesAdded: 90, linesRemoved: 0 },
        { hash: '7', shortHash: '7', author: 'a', email: '', date: '', subject: 'feat: add api', body: '', files: [], linesAdded: 70, linesRemoved: 0 },
        { hash: '8', shortHash: '8', author: 'a', email: '', date: '', subject: 'feat: add tests', body: '', files: [], linesAdded: 40, linesRemoved: 0 },
        { hash: '9', shortHash: '9', author: 'a', email: '', date: '', subject: 'feat: add docs', body: '', files: [], linesAdded: 30, linesRemoved: 0 },
        { hash: '10', shortHash: '10', author: 'a', email: '', date: '', subject: 'feat: add readme', body: '', files: [], linesAdded: 20, linesRemoved: 0 },
      ];

      const result = HumanInsightsAnalyzer.calculateFixToFeatureRatio(commits);

      expect(result.ratio).toBe(0); // 0 fixes / 10 features
      expect(result.isHealthy).toBe(true);
    });

    test('handles empty commit list', () => {
      const result = HumanInsightsAnalyzer.calculateFixToFeatureRatio([]);

      expect(result.fixCommits).toBe(0);
      expect(result.featureCommits).toBe(0);
      expect(result.ratio).toBe(0);
    });

    test('handles commits that are neither fix nor feature', () => {
      const commits: CommitInfo[] = [
        { hash: '1', shortHash: '1', author: 'a', email: '', date: '', subject: 'chore: update deps', body: '', files: [], linesAdded: 10, linesRemoved: 5 },
        { hash: '2', shortHash: '2', author: 'a', email: '', date: '', subject: 'docs: update readme', body: '', files: [], linesAdded: 20, linesRemoved: 0 },
        { hash: '3', shortHash: '3', author: 'a', email: '', date: '', subject: 'refactor: cleanup', body: '', files: [], linesAdded: 30, linesRemoved: 30 },
      ];

      const result = HumanInsightsAnalyzer.calculateFixToFeatureRatio(commits);

      expect(result.fixCommits).toBe(0);
      expect(result.featureCommits).toBe(0);
      expect(result.ratio).toBe(0);
    });
  });

  describe('analyzePromptQuality', () => {
    test('returns zero metrics when no prompts with signals', () => {
      const logsDir = tempDir.createDir('logs');
      tempDir.createDir('logs/prompts');
      tempDir.createFile('logs/prompts/test.jsonl',
        '{"session_id":"s1","prompt":"Test prompt"}\n'
      );

      const analyzer = new HumanInsightsAnalyzer(logsDir);
      analyzer.loadLogs();
      const result = analyzer.analyzePromptQuality();

      expect(result.sampleSize).toBe(0);
      expect(result.avgAmbiguityScore).toBe(0);
    });

    test('calculates quality metrics correctly', () => {
      const logsDir = tempDir.createDir('logs');
      tempDir.createDir('logs/prompts');

      // Create prompts with complexity signals
      const prompts = [
        {
          session_id: 's1',
          prompt: 'Fix the bug in src/auth.ts',
          complexity_signals: {
            ambiguity_score: 0.2,
            has_constraints: true,
            has_examples: false,
            has_acceptance_criteria: true,
            file_references: 1,
          },
        },
        {
          session_id: 's2',
          prompt: 'Make it work better',
          complexity_signals: {
            ambiguity_score: 0.8,
            has_constraints: false,
            has_examples: false,
            has_acceptance_criteria: false,
            file_references: 0,
          },
        },
        {
          session_id: 's3',
          prompt: 'Add validation like this example',
          complexity_signals: {
            ambiguity_score: 0.3,
            has_constraints: true,
            has_examples: true,
            has_acceptance_criteria: true,
            file_references: 2,
          },
        },
      ];

      tempDir.createFile('logs/prompts/test.jsonl',
        prompts.map(p => JSON.stringify(p)).join('\n') + '\n'
      );

      const analyzer = new HumanInsightsAnalyzer(logsDir);
      analyzer.loadLogs();
      const result = analyzer.analyzePromptQuality();

      expect(result.sampleSize).toBe(3);
      // Avg ambiguity: (0.2 + 0.8 + 0.3) / 3 ≈ 0.433
      expect(result.avgAmbiguityScore).toBeCloseTo(0.433, 2);
      // Constraint rate: 2/3 = 66.67%
      expect(result.constraintUsageRate).toBeCloseTo(66.67, 1);
      // Example rate: 1/3 = 33.33%
      expect(result.exampleUsageRate).toBeCloseTo(33.33, 1);
      // AC rate: 2/3 = 66.67%
      expect(result.acceptanceCriteriaRate).toBeCloseTo(66.67, 1);
      // Avg file refs: (1 + 0 + 2) / 3 = 1
      expect(result.avgFileReferences).toBe(1);
    });
  });

  describe('correlateQualityWithOutcomes', () => {
    test('identifies prompts leading to rework', () => {
      const logsDir = tempDir.createDir('logs');
      tempDir.createDir('logs/prompts');
      tempDir.createDir('logs/feedback');

      const prompts = [
        {
          session_id: 's1',
          prompt: 'Make it better somehow',
          complexity_signals: {
            ambiguity_score: 0.7,
            has_constraints: false,
            has_examples: false,
            has_acceptance_criteria: false,
            file_references: 0,
          },
        },
      ];

      const feedback = [
        {
          session_id: 's1',
          alignment: 2,
          rework_needed: 'significant',
        },
      ];

      tempDir.createFile('logs/prompts/test.jsonl',
        prompts.map(p => JSON.stringify(p)).join('\n') + '\n'
      );
      tempDir.createFile('logs/feedback/test.jsonl',
        feedback.map(f => JSON.stringify(f)).join('\n') + '\n'
      );

      const analyzer = new HumanInsightsAnalyzer(logsDir);
      analyzer.loadLogs();
      const result = analyzer.correlateQualityWithOutcomes();

      expect(result.promptsLeadingToRework).toHaveLength(1);
      expect(result.promptsLeadingToRework[0].sessionId).toBe('s1');
      expect(result.promptsLeadingToRework[0].issue).toBe('High ambiguity');
    });

    test('calculates alignment difference between quality levels', () => {
      const logsDir = tempDir.createDir('logs');
      tempDir.createDir('logs/prompts');
      tempDir.createDir('logs/feedback');

      // High quality prompts
      const highQualityPrompts = [
        {
          session_id: 'high1',
          prompt: 'Fix bug in src/auth.ts, only modify this file',
          complexity_signals: {
            ambiguity_score: 0.1,
            has_constraints: true,
            has_examples: false,
            has_acceptance_criteria: true,
            file_references: 1,
          },
        },
        {
          session_id: 'high2',
          prompt: 'Add test for src/utils.ts using existing patterns',
          complexity_signals: {
            ambiguity_score: 0.2,
            has_constraints: true,
            has_examples: true,
            has_acceptance_criteria: true,
            file_references: 2,
          },
        },
      ];

      // Low quality prompts
      const lowQualityPrompts = [
        {
          session_id: 'low1',
          prompt: 'Make it work',
          complexity_signals: {
            ambiguity_score: 0.9,
            has_constraints: false,
            has_examples: false,
            has_acceptance_criteria: false,
            file_references: 0,
          },
        },
      ];

      const feedback = [
        { session_id: 'high1', alignment: 5, rework_needed: 'none' },
        { session_id: 'high2', alignment: 4, rework_needed: 'minor' },
        { session_id: 'low1', alignment: 2, rework_needed: 'significant' },
      ];

      tempDir.createFile('logs/prompts/test.jsonl',
        [...highQualityPrompts, ...lowQualityPrompts].map(p => JSON.stringify(p)).join('\n') + '\n'
      );
      tempDir.createFile('logs/feedback/test.jsonl',
        feedback.map(f => JSON.stringify(f)).join('\n') + '\n'
      );

      const analyzer = new HumanInsightsAnalyzer(logsDir);
      analyzer.loadLogs();
      const result = analyzer.correlateQualityWithOutcomes();

      // High quality: (5 + 4) / 2 = 4.5
      expect(result.highQualityAvgAlignment).toBe(4.5);
      // Low quality: 2 / 1 = 2
      expect(result.lowQualityAvgAlignment).toBe(2);
      expect(result.effectivePromptPatterns).toContain('file_references');
    });
  });
});

/**
 * Unit tests for ToolsAnalyzer
 */

import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { ToolsAnalyzer } from '../../../src/analyzers/tools.js';
import { getFixturePath, createTempDir, type TempDir } from '../../fixtures/index.js';
import { copyFileSync } from 'fs';
import { join } from 'path';

describe('ToolsAnalyzer', () => {
  let tempDir: TempDir;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    tempDir.cleanup();
  });

  describe('analyze', () => {
    test('returns empty result for non-existent directory', () => {
      const analyzer = new ToolsAnalyzer('/nonexistent/path');
      const result = analyzer.analyze();

      expect(result.totalCalls).toBe(0);
      expect(result.uniqueTools).toBe(0);
      expect(result.toolStats).toHaveLength(0);
      expect(result.findings).toContain('No tool call logs found in .logs/tools/');
    });

    test('calculates total calls and unique tools correctly', () => {
      const logsDir = tempDir.createDir('.logs');
      tempDir.createDir('.logs/tools');
      copyFileSync(
        getFixturePath('tools/healthy.jsonl'),
        join(logsDir, 'tools', 'healthy.jsonl')
      );

      const analyzer = new ToolsAnalyzer(logsDir);
      const result = analyzer.analyze();

      expect(result.totalCalls).toBe(20);
      // Tools: Read, Glob, Edit, Bash, Grep
      expect(result.uniqueTools).toBe(5);
    });

    test('calculates avgDuration correctly per tool', () => {
      const logsDir = tempDir.createDir('.logs');
      tempDir.createDir('.logs/tools');
      copyFileSync(
        getFixturePath('tools/healthy.jsonl'),
        join(logsDir, 'tools', 'healthy.jsonl')
      );

      const analyzer = new ToolsAnalyzer(logsDir);
      const result = analyzer.analyze();

      // Find Read tool stats
      const readStats = result.toolStats.find(s => s.toolName === 'Read');
      expect(readStats).toBeDefined();
      expect(readStats?.avgDuration).toBeGreaterThan(0);
      expect(readStats?.avgDuration).toBeLessThan(20); // Avg of 15, 12, 18, 16, 14, 11, 13 = ~14ms
    });

    test('calculates successRate correctly per tool', () => {
      const logsDir = tempDir.createDir('.logs');
      tempDir.createDir('.logs/tools');
      copyFileSync(
        getFixturePath('tools/healthy.jsonl'),
        join(logsDir, 'tools', 'healthy.jsonl')
      );

      const analyzer = new ToolsAnalyzer(logsDir);
      const result = analyzer.analyze();

      // Edit has 1 failure out of multiple calls
      const editStats = result.toolStats.find(s => s.toolName === 'Edit');
      expect(editStats).toBeDefined();
      expect(editStats?.successRate).toBeLessThan(1); // Has one failure
      expect(editStats?.successRate).toBeGreaterThan(0.5);

      // Read should be 100% success
      const readStats = result.toolStats.find(s => s.toolName === 'Read');
      expect(readStats?.successRate).toBe(1);
    });

    test('collects errors correctly', () => {
      const logsDir = tempDir.createDir('.logs');
      tempDir.createDir('.logs/tools');
      copyFileSync(
        getFixturePath('tools/high-errors.jsonl'),
        join(logsDir, 'tools', 'high-errors.jsonl')
      );

      const analyzer = new ToolsAnalyzer(logsDir);
      const result = analyzer.analyze();

      // Edit tool should have multiple "No match found for old_string" errors
      const editStats = result.toolStats.find(s => s.toolName === 'Edit');
      expect(editStats?.errors.length).toBeGreaterThan(0);
      expect(editStats?.errors.some(e => e.includes('No match found'))).toBe(true);
    });

    test('calculates overall error rate correctly', () => {
      const logsDir = tempDir.createDir('.logs');
      tempDir.createDir('.logs/tools');
      copyFileSync(
        getFixturePath('tools/high-errors.jsonl'),
        join(logsDir, 'tools', 'high-errors.jsonl')
      );

      const analyzer = new ToolsAnalyzer(logsDir);
      const result = analyzer.analyze();

      // high-errors.jsonl has 8 failures out of 20 = 40%
      expect(result.errorRate).toBeGreaterThan(0.3);
      expect(result.errorRate).toBeLessThan(0.5);
    });

    test('identifies most used tools', () => {
      const logsDir = tempDir.createDir('.logs');
      tempDir.createDir('.logs/tools');
      copyFileSync(
        getFixturePath('tools/healthy.jsonl'),
        join(logsDir, 'tools', 'healthy.jsonl')
      );

      const analyzer = new ToolsAnalyzer(logsDir);
      const result = analyzer.analyze();

      expect(result.mostUsedTools.length).toBeLessThanOrEqual(5);
      // Read is used most frequently in healthy.jsonl
      expect(result.mostUsedTools[0]).toBe('Read');
    });

    test('calculates avgCallsPerSession', () => {
      const logsDir = tempDir.createDir('.logs');
      tempDir.createDir('.logs/tools');
      copyFileSync(
        getFixturePath('tools/healthy.jsonl'),
        join(logsDir, 'tools', 'healthy.jsonl')
      );

      const analyzer = new ToolsAnalyzer(logsDir);
      const result = analyzer.analyze();

      // healthy.jsonl has 2 sessions with 10 calls each
      expect(result.avgCallsPerSession).toBe(10);
    });

    test('generates findings for high error rate', () => {
      const logsDir = tempDir.createDir('.logs');
      tempDir.createDir('.logs/tools');
      copyFileSync(
        getFixturePath('tools/high-errors.jsonl'),
        join(logsDir, 'tools', 'high-errors.jsonl')
      );

      const analyzer = new ToolsAnalyzer(logsDir);
      const result = analyzer.analyze();

      expect(result.findings.some(f => f.includes('High tool error rate'))).toBe(true);
    });

    test('generates findings for heavy tool usage', () => {
      // Create a fixture with one tool used very heavily
      const logsDir = tempDir.createDir('.logs');
      tempDir.createDir('.logs/tools');

      // 10 Read calls (>20% of 12 total)
      let content = '';
      for (let i = 0; i < 10; i++) {
        content += `{"timestamp":"2026-02-01T10:00:0${i}Z","session_id":"sess-001","tool_name":"Read","duration_ms":15,"success":true}\n`;
      }
      content += `{"timestamp":"2026-02-01T10:00:10Z","session_id":"sess-001","tool_name":"Edit","duration_ms":25,"success":true}\n`;
      content += `{"timestamp":"2026-02-01T10:00:11Z","session_id":"sess-001","tool_name":"Bash","duration_ms":100,"success":true}\n`;

      tempDir.createFile('.logs/tools/heavy.jsonl', content);

      const analyzer = new ToolsAnalyzer(logsDir);
      const result = analyzer.analyze();

      expect(result.findings.some(f => f.includes('Heavy tool usage') && f.includes('Read'))).toBe(true);
    });

    test('sorts toolStats by usage count', () => {
      const logsDir = tempDir.createDir('.logs');
      tempDir.createDir('.logs/tools');
      copyFileSync(
        getFixturePath('tools/healthy.jsonl'),
        join(logsDir, 'tools', 'healthy.jsonl')
      );

      const analyzer = new ToolsAnalyzer(logsDir);
      const result = analyzer.analyze();

      // Verify sorted by count descending
      for (let i = 1; i < result.toolStats.length; i++) {
        expect(result.toolStats[i - 1].count).toBeGreaterThanOrEqual(result.toolStats[i].count);
      }
    });
  });
});

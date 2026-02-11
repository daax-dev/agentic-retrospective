/**
 * Unit tests for ReworkAnalyzer
 */

import { describe, test, expect } from 'vitest';
import { ReworkAnalyzer } from '../../../src/analyzers/rework.js';
import type { CommitInfo } from '../../../src/types.js';

function createCommit(overrides: Partial<CommitInfo>): CommitInfo {
  return {
    hash: 'default123',
    shortHash: 'default',
    author: 'Test Author',
    email: 'test@example.com',
    date: '2026-02-01T10:00:00Z',
    subject: 'Test commit',
    body: '',
    files: [],
    linesAdded: 10,
    linesRemoved: 5,
    ...overrides,
  };
}

describe('ReworkAnalyzer', () => {
  describe('detectReworkChains', () => {
    test('returns empty result for no commits', () => {
      const analyzer = new ReworkAnalyzer();
      const result = analyzer.detectReworkChains([]);

      expect(result.chains).toHaveLength(0);
      expect(result.totalReworkCommits).toBe(0);
      expect(result.reworkPercentage).toBe(0);
    });

    test('detects fix commit by message pattern', () => {
      const originalCommit = createCommit({
        hash: 'original1',
        shortHash: 'orig1',
        date: '2026-02-01T10:00:00Z',
        subject: 'Add authentication feature',
        files: [{ path: 'src/auth.ts', additions: 100, deletions: 0, changeType: 'add' }],
      });

      const fixCommit = createCommit({
        hash: 'fix12345',
        shortHash: 'fix12',
        date: '2026-02-01T12:00:00Z',
        subject: 'fix: correct auth validation',
        files: [{ path: 'src/auth.ts', additions: 10, deletions: 5, changeType: 'modify' }],
        linesAdded: 10,
        linesRemoved: 5,
      });

      const analyzer = new ReworkAnalyzer();
      const result = analyzer.detectReworkChains([originalCommit, fixCommit]);

      expect(result.chains).toHaveLength(1);
      expect(result.chains[0].originalCommit.hash).toBe('original1');
      expect(result.chains[0].fixCommits).toHaveLength(1);
      expect(result.chains[0].fixCommits[0].hash).toBe('fix12345');
    });

    test('detects revert commits', () => {
      const originalCommit = createCommit({
        hash: 'feature1',
        date: '2026-02-01T10:00:00Z',
        subject: 'Add new feature',
        files: [{ path: 'src/feature.ts', additions: 50, deletions: 0, changeType: 'add' }],
      });

      const revertCommit = createCommit({
        hash: 'revert12',
        date: '2026-02-01T11:00:00Z',
        subject: 'Revert "Add new feature"',
        files: [{ path: 'src/feature.ts', additions: 0, deletions: 50, changeType: 'delete' }],
      });

      const analyzer = new ReworkAnalyzer();
      const result = analyzer.detectReworkChains([originalCommit, revertCommit]);

      expect(result.chains).toHaveLength(1);
      expect(result.chains[0].originalCommit.hash).toBe('feature1');
    });

    test('detects fixup commits', () => {
      const originalCommit = createCommit({
        hash: 'main123',
        date: '2026-02-01T10:00:00Z',
        subject: 'Implement login',
        files: [{ path: 'src/login.ts', additions: 80, deletions: 0, changeType: 'add' }],
      });

      const fixupCommit = createCommit({
        hash: 'fixup12',
        date: '2026-02-01T10:30:00Z',
        subject: 'fixup! Implement login',
        files: [{ path: 'src/login.ts', additions: 5, deletions: 2, changeType: 'modify' }],
      });

      const analyzer = new ReworkAnalyzer();
      const result = analyzer.detectReworkChains([originalCommit, fixupCommit]);

      expect(result.chains).toHaveLength(1);
    });

    test('matches fix commits by file overlap within 48 hours', () => {
      const originalCommit = createCommit({
        hash: 'orig111',
        date: '2026-02-01T10:00:00Z',
        subject: 'Add API endpoint',
        files: [
          { path: 'src/api.ts', additions: 50, deletions: 0, changeType: 'add' },
          { path: 'src/types.ts', additions: 10, deletions: 0, changeType: 'add' },
        ],
      });

      const fixCommit = createCommit({
        hash: 'fix222',
        date: '2026-02-01T18:00:00Z', // 8 hours later
        subject: 'fix: handle edge case',
        files: [
          { path: 'src/api.ts', additions: 15, deletions: 5, changeType: 'modify' },
        ],
      });

      const analyzer = new ReworkAnalyzer();
      const result = analyzer.detectReworkChains([originalCommit, fixCommit]);

      expect(result.chains).toHaveLength(1);
      expect(result.chains[0].originalCommit.hash).toBe('orig111');
    });

    test('ignores fix commits more than 48 hours after original', () => {
      const originalCommit = createCommit({
        hash: 'old123',
        date: '2026-02-01T10:00:00Z',
        subject: 'Add feature',
        files: [{ path: 'src/feature.ts', additions: 50, deletions: 0, changeType: 'add' }],
      });

      const lateFixCommit = createCommit({
        hash: 'late12',
        date: '2026-02-05T10:00:00Z', // 4 days later
        subject: 'fix: belated fix',
        files: [{ path: 'src/feature.ts', additions: 5, deletions: 2, changeType: 'modify' }],
      });

      const analyzer = new ReworkAnalyzer();
      const result = analyzer.detectReworkChains([originalCommit, lateFixCommit]);

      // No chain detected because fix is too late
      expect(result.chains).toHaveLength(0);
    });

    test('calculates rework percentage correctly', () => {
      const commits = [
        createCommit({
          hash: 'feature1',
          date: '2026-02-01T10:00:00Z',
          subject: 'Add feature 1',
          files: [{ path: 'src/a.ts', additions: 50, deletions: 0, changeType: 'add' }],
        }),
        createCommit({
          hash: 'fix1',
          date: '2026-02-01T11:00:00Z',
          subject: 'fix: bug in feature 1',
          files: [{ path: 'src/a.ts', additions: 5, deletions: 2, changeType: 'modify' }],
        }),
        createCommit({
          hash: 'feature2',
          date: '2026-02-01T12:00:00Z',
          subject: 'Add feature 2',
          files: [{ path: 'src/b.ts', additions: 40, deletions: 0, changeType: 'add' }],
        }),
        createCommit({
          hash: 'feature3',
          date: '2026-02-01T13:00:00Z',
          subject: 'Add feature 3',
          files: [{ path: 'src/c.ts', additions: 30, deletions: 0, changeType: 'add' }],
        }),
      ];

      const analyzer = new ReworkAnalyzer();
      const result = analyzer.detectReworkChains(commits);

      // 1 fix commit out of 4 = 25%
      expect(result.totalReworkCommits).toBe(1);
      expect(result.reworkPercentage).toBe(25);
    });

    test('groups multiple fix commits under same original', () => {
      const originalCommit = createCommit({
        hash: 'orig999',
        date: '2026-02-01T10:00:00Z',
        subject: 'Add complex feature',
        files: [{ path: 'src/complex.ts', additions: 100, deletions: 0, changeType: 'add' }],
      });

      const fix1 = createCommit({
        hash: 'fix001',
        date: '2026-02-01T11:00:00Z',
        subject: 'fix: first bug',
        files: [{ path: 'src/complex.ts', additions: 10, deletions: 5, changeType: 'modify' }],
      });

      const fix2 = createCommit({
        hash: 'fix002',
        date: '2026-02-01T12:00:00Z',
        subject: 'fix: second bug',
        files: [{ path: 'src/complex.ts', additions: 8, deletions: 3, changeType: 'modify' }],
      });

      const analyzer = new ReworkAnalyzer();
      const result = analyzer.detectReworkChains([originalCommit, fix1, fix2]);

      expect(result.chains).toHaveLength(1);
      expect(result.chains[0].fixCommits).toHaveLength(2);
      expect(result.totalReworkCommits).toBe(2);
    });

    test('tracks files with most rework', () => {
      const commits = [
        createCommit({
          hash: 'orig1',
          date: '2026-02-01T10:00:00Z',
          subject: 'Add feature',
          files: [{ path: 'src/problematic.ts', additions: 50, deletions: 0, changeType: 'add' }],
        }),
        createCommit({
          hash: 'fix1',
          date: '2026-02-01T11:00:00Z',
          subject: 'fix: issue 1',
          files: [{ path: 'src/problematic.ts', additions: 5, deletions: 2, changeType: 'modify' }],
        }),
        createCommit({
          hash: 'fix2',
          date: '2026-02-01T12:00:00Z',
          subject: 'fix: issue 2',
          files: [{ path: 'src/problematic.ts', additions: 3, deletions: 1, changeType: 'modify' }],
        }),
      ];

      const analyzer = new ReworkAnalyzer();
      const result = analyzer.detectReworkChains(commits);

      expect(result.filesWithMostRework[0].path).toBe('src/problematic.ts');
      expect(result.filesWithMostRework[0].reworkCount).toBe(2);
    });

    test('calculates average time to fix', () => {
      const commits = [
        createCommit({
          hash: 'orig1',
          date: '2026-02-01T10:00:00Z',
          subject: 'Feature 1',
          files: [{ path: 'src/a.ts', additions: 50, deletions: 0, changeType: 'add' }],
        }),
        createCommit({
          hash: 'fix1',
          date: '2026-02-01T14:00:00Z', // 4 hours later
          subject: 'fix: bug',
          files: [{ path: 'src/a.ts', additions: 5, deletions: 2, changeType: 'modify' }],
        }),
        createCommit({
          hash: 'orig2',
          date: '2026-02-02T10:00:00Z',
          subject: 'Feature 2',
          files: [{ path: 'src/b.ts', additions: 40, deletions: 0, changeType: 'add' }],
        }),
        createCommit({
          hash: 'fix2',
          date: '2026-02-02T12:00:00Z', // 2 hours later
          subject: 'fix: bug 2',
          files: [{ path: 'src/b.ts', additions: 3, deletions: 1, changeType: 'modify' }],
        }),
      ];

      const analyzer = new ReworkAnalyzer();
      const result = analyzer.detectReworkChains(commits);

      // (4 + 2) / 2 = 3 hours average
      expect(result.avgTimeToFix).toBe(3);
    });

    test('detects explicit commit reference in message', () => {
      const originalCommit = createCommit({
        hash: 'abc1234567890',
        shortHash: 'abc1234',
        date: '2026-02-01T10:00:00Z',
        subject: 'Original feature',
        files: [{ path: 'src/feature.ts', additions: 50, deletions: 0, changeType: 'add' }],
      });

      const fixCommit = createCommit({
        hash: 'def9876',
        date: '2026-02-02T10:00:00Z', // Next day
        subject: 'fix: addresses abc1234',
        files: [{ path: 'src/other.ts', additions: 5, deletions: 2, changeType: 'modify' }],
      });

      const analyzer = new ReworkAnalyzer();
      const result = analyzer.detectReworkChains([originalCommit, fixCommit]);

      // Should match via explicit reference even without file overlap
      expect(result.chains).toHaveLength(1);
    });
  });

  describe('getSummary', () => {
    test('provides formatted summary', () => {
      const commits = [
        createCommit({
          hash: 'orig1',
          date: '2026-02-01T10:00:00Z',
          subject: 'Add feature',
          files: [{ path: 'src/main.ts', additions: 50, deletions: 0, changeType: 'add' }],
        }),
        createCommit({
          hash: 'fix1',
          date: '2026-02-01T12:00:00Z',
          subject: 'fix: bug',
          files: [{ path: 'src/main.ts', additions: 10, deletions: 5, changeType: 'modify' }],
          linesAdded: 10,
          linesRemoved: 5,
        }),
      ];

      const analyzer = new ReworkAnalyzer();
      const summary = analyzer.getSummary(commits);

      expect(summary.hasRework).toBe(true);
      expect(summary.reworkCommits).toBe(1);
      expect(summary.reworkPercentage).toBe(50);
      expect(summary.avgTimeToFix).toBe('2.0 hours');
      expect(summary.topFiles).toContain('src/main.ts');
    });

    test('handles no rework scenario', () => {
      const commits = [
        createCommit({
          hash: 'feat1',
          date: '2026-02-01T10:00:00Z',
          subject: 'Add feature 1',
          files: [{ path: 'src/a.ts', additions: 50, deletions: 0, changeType: 'add' }],
        }),
        createCommit({
          hash: 'feat2',
          date: '2026-02-01T11:00:00Z',
          subject: 'Add feature 2',
          files: [{ path: 'src/b.ts', additions: 40, deletions: 0, changeType: 'add' }],
        }),
      ];

      const analyzer = new ReworkAnalyzer();
      const summary = analyzer.getSummary(commits);

      expect(summary.hasRework).toBe(false);
      expect(summary.reworkCommits).toBe(0);
      expect(summary.avgTimeToFix).toBe('N/A');
    });
  });
});

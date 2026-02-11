/**
 * Unit tests for GitHubAnalyzer
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { GitHubAnalyzer, type PRInfo } from '../../../src/analyzers/github.js';

// Mock child_process.execSync
vi.mock('child_process', () => ({
  execSync: vi.fn(),
}));

import { execSync } from 'child_process';
const mockExecSync = vi.mocked(execSync);

describe('GitHubAnalyzer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('isAvailable', () => {
    test('returns true when gh is authenticated', () => {
      mockExecSync.mockReturnValue('');
      const analyzer = new GitHubAnalyzer();
      expect(analyzer.isAvailable()).toBe(true);
    });

    test('returns false when gh is not available', () => {
      mockExecSync.mockImplementation(() => {
        throw new Error('gh not found');
      });
      const analyzer = new GitHubAnalyzer();
      expect(analyzer.isAvailable()).toBe(false);
    });
  });

  describe('analyze', () => {
    test('returns empty result when gh is not available', async () => {
      mockExecSync.mockImplementation(() => {
        throw new Error('not authenticated');
      });

      const analyzer = new GitHubAnalyzer();
      const result = await analyzer.analyze();

      expect(result.available).toBe(false);
      expect(result.totalPRs).toBe(0);
      expect(result.bottlenecks).toHaveLength(0);
    });

    test('fetches PRs with review data', async () => {
      const mockPRs = [
        {
          number: 1,
          title: 'Add feature',
          author: { login: 'user1' },
          state: 'MERGED',
          createdAt: '2026-02-01T10:00:00Z',
          mergedAt: '2026-02-01T12:00:00Z',
          additions: 100,
          deletions: 50,
          changedFiles: 5,
          labels: [],
        },
      ];

      const mockReviewData = {
        reviews: [{ id: 1 }, { id: 2 }],
        comments: [{ id: 1 }],
        commits: [{ sha: 'a' }, { sha: 'b' }],
      };

      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd.includes('gh auth status')) return '';
        if (cmd.includes('gh pr list')) return JSON.stringify(mockPRs);
        if (cmd.includes('gh pr view')) return JSON.stringify(mockReviewData);
        return '';
      });

      const analyzer = new GitHubAnalyzer();
      const result = await analyzer.analyze();

      expect(result.available).toBe(true);
      expect(result.totalPRs).toBe(1);
      expect(result.mergedPRs).toBe(1);
      expect(result.prs[0].reviewCount).toBe(2);
      expect(result.prs[0].commentCount).toBe(1);
      expect(result.prs[0].commits).toBe(2);
    });

    test('calculates average review time correctly', async () => {
      const mockPRs = [
        {
          number: 1,
          title: 'PR 1',
          author: { login: 'user1' },
          state: 'MERGED',
          createdAt: '2026-02-01T10:00:00Z',
          mergedAt: '2026-02-01T14:00:00Z', // 4 hours
          additions: 10,
          deletions: 5,
          changedFiles: 1,
          labels: [],
        },
        {
          number: 2,
          title: 'PR 2',
          author: { login: 'user1' },
          state: 'MERGED',
          createdAt: '2026-02-02T10:00:00Z',
          mergedAt: '2026-02-02T18:00:00Z', // 8 hours
          additions: 20,
          deletions: 10,
          changedFiles: 2,
          labels: [],
        },
      ];

      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd.includes('gh auth status')) return '';
        if (cmd.includes('gh pr list')) return JSON.stringify(mockPRs);
        if (cmd.includes('gh pr view')) return JSON.stringify({ reviews: [], comments: [], commits: [] });
        return '';
      });

      const analyzer = new GitHubAnalyzer();
      const result = await analyzer.analyze();

      // Average of 4 and 8 hours = 6 hours
      expect(result.avgReviewTime).toBe(6);
    });

    test('groups PRs by author', async () => {
      const mockPRs = [
        { number: 1, title: 'PR 1', author: { login: 'alice' }, state: 'MERGED', createdAt: '2026-02-01T10:00:00Z', mergedAt: '2026-02-01T12:00:00Z' },
        { number: 2, title: 'PR 2', author: { login: 'bob' }, state: 'MERGED', createdAt: '2026-02-01T10:00:00Z', mergedAt: '2026-02-01T12:00:00Z' },
        { number: 3, title: 'PR 3', author: { login: 'alice' }, state: 'MERGED', createdAt: '2026-02-01T10:00:00Z', mergedAt: '2026-02-01T12:00:00Z' },
      ];

      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd.includes('gh auth status')) return '';
        if (cmd.includes('gh pr list')) return JSON.stringify(mockPRs);
        if (cmd.includes('gh pr view')) return JSON.stringify({ reviews: [], comments: [], commits: [] });
        return '';
      });

      const analyzer = new GitHubAnalyzer();
      const result = await analyzer.analyze();

      expect(result.prsByAuthor.get('alice')).toBe(2);
      expect(result.prsByAuthor.get('bob')).toBe(1);
    });
  });

  describe('detectBottlenecks', () => {
    test('detects slow merge PRs (> 48 hours)', () => {
      const prs: PRInfo[] = [
        {
          number: 1,
          title: 'Slow PR',
          author: 'user1',
          state: 'MERGED',
          createdAt: '2026-02-01T10:00:00Z',
          mergedAt: '2026-02-04T10:00:00Z', // 72 hours
          additions: 10,
          deletions: 5,
          reviewCount: 1,
          commentCount: 0,
          commits: 1,
          changedFiles: 1,
          labels: [],
        },
        {
          number: 2,
          title: 'Fast PR',
          author: 'user1',
          state: 'MERGED',
          createdAt: '2026-02-01T10:00:00Z',
          mergedAt: '2026-02-01T12:00:00Z', // 2 hours
          additions: 10,
          deletions: 5,
          reviewCount: 1,
          commentCount: 0,
          commits: 1,
          changedFiles: 1,
          labels: [],
        },
      ];

      const analyzer = new GitHubAnalyzer();
      const bottlenecks = analyzer.detectBottlenecks(prs);

      const slowMerge = bottlenecks.filter(b => b.issue === 'slow_merge');
      expect(slowMerge).toHaveLength(1);
      expect(slowMerge[0].pr.number).toBe(1);
      expect(slowMerge[0].metric).toBe(72);
    });

    test('detects high revision PRs (> 3 commits)', () => {
      const prs: PRInfo[] = [
        {
          number: 1,
          title: 'Many commits PR',
          author: 'user1',
          state: 'MERGED',
          createdAt: '2026-02-01T10:00:00Z',
          mergedAt: '2026-02-01T12:00:00Z',
          additions: 100,
          deletions: 50,
          reviewCount: 3,
          commentCount: 5,
          commits: 8, // Many revisions
          changedFiles: 10,
          labels: [],
        },
        {
          number: 2,
          title: 'Normal PR',
          author: 'user1',
          state: 'MERGED',
          createdAt: '2026-02-01T10:00:00Z',
          mergedAt: '2026-02-01T12:00:00Z',
          additions: 10,
          deletions: 5,
          reviewCount: 1,
          commentCount: 0,
          commits: 2,
          changedFiles: 1,
          labels: [],
        },
      ];

      const analyzer = new GitHubAnalyzer();
      const bottlenecks = analyzer.detectBottlenecks(prs);

      const highRevisions = bottlenecks.filter(b => b.issue === 'high_revisions');
      expect(highRevisions).toHaveLength(1);
      expect(highRevisions[0].pr.number).toBe(1);
      expect(highRevisions[0].metric).toBe(8);
    });

    test('detects stale PRs (open > 7 days)', () => {
      // Create a date 10 days ago
      const tenDaysAgo = new Date();
      tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);

      const prs: PRInfo[] = [
        {
          number: 1,
          title: 'Stale PR',
          author: 'user1',
          state: 'OPEN',
          createdAt: tenDaysAgo.toISOString(),
          mergedAt: null,
          additions: 10,
          deletions: 5,
          reviewCount: 0,
          commentCount: 0,
          commits: 1,
          changedFiles: 1,
          labels: [],
        },
      ];

      const analyzer = new GitHubAnalyzer();
      const bottlenecks = analyzer.detectBottlenecks(prs);

      const stale = bottlenecks.filter(b => b.issue === 'stale');
      expect(stale).toHaveLength(1);
      expect(stale[0].pr.number).toBe(1);
      expect(stale[0].metric).toBeGreaterThanOrEqual(10);
    });

    test('returns empty array for healthy PRs', () => {
      const prs: PRInfo[] = [
        {
          number: 1,
          title: 'Good PR',
          author: 'user1',
          state: 'MERGED',
          createdAt: '2026-02-01T10:00:00Z',
          mergedAt: '2026-02-01T12:00:00Z', // 2 hours - fast
          additions: 50,
          deletions: 20,
          reviewCount: 1,
          commentCount: 1,
          commits: 2, // Normal
          changedFiles: 3,
          labels: [],
        },
      ];

      const analyzer = new GitHubAnalyzer();
      const bottlenecks = analyzer.detectBottlenecks(prs);

      expect(bottlenecks).toHaveLength(0);
    });
  });

  // GAP-05: Supersession Detection
  describe('detectSupersession', () => {
    test('detects "Supersedes #X" pattern', () => {
      const prs: PRInfo[] = [
        { number: 1, title: 'Original PR', author: 'user', state: 'CLOSED', createdAt: '2026-02-01T10:00:00Z', mergedAt: null, additions: 0, deletions: 0, reviewCount: 0, commentCount: 0, commits: 1, changedFiles: 1, labels: [] },
        { number: 2, title: 'Updated PR', author: 'user', state: 'MERGED', createdAt: '2026-02-02T10:00:00Z', mergedAt: '2026-02-02T12:00:00Z', additions: 0, deletions: 0, reviewCount: 0, commentCount: 0, commits: 1, changedFiles: 1, labels: [], body: 'Supersedes #1' },
      ];

      const analyzer = new GitHubAnalyzer();
      const result = analyzer.detectSupersession(prs);

      expect(result.supersededPRs).toHaveLength(1);
      expect(result.supersededPRs[0].prNumber).toBe(1);
      expect(result.supersededPRs[0].supersededBy).toBe(2);
      expect(result.supersededPRs[0].pattern).toBe('Supersedes');
    });

    test('detects "Replaces #X" pattern', () => {
      const prs: PRInfo[] = [
        { number: 5, title: 'Original', author: 'user', state: 'CLOSED', createdAt: '2026-02-01T10:00:00Z', mergedAt: null, additions: 0, deletions: 0, reviewCount: 0, commentCount: 0, commits: 1, changedFiles: 1, labels: [] },
        { number: 6, title: 'Replaces #5', author: 'user', state: 'MERGED', createdAt: '2026-02-02T10:00:00Z', mergedAt: '2026-02-02T12:00:00Z', additions: 0, deletions: 0, reviewCount: 0, commentCount: 0, commits: 1, changedFiles: 1, labels: [] },
      ];

      const analyzer = new GitHubAnalyzer();
      const result = analyzer.detectSupersession(prs);

      expect(result.supersededPRs).toHaveLength(1);
      expect(result.supersededPRs[0].pattern).toBe('Replaces');
    });

    test('detects v2/v3 patterns in title', () => {
      const prs: PRInfo[] = [
        { number: 10, title: 'Add auth feature', author: 'user', state: 'CLOSED', createdAt: '2026-02-01T10:00:00Z', mergedAt: null, additions: 0, deletions: 0, reviewCount: 0, commentCount: 0, commits: 1, changedFiles: 1, labels: [] },
        { number: 11, title: 'Add auth feature v2', author: 'user', state: 'MERGED', createdAt: '2026-02-02T10:00:00Z', mergedAt: '2026-02-02T12:00:00Z', additions: 0, deletions: 0, reviewCount: 0, commentCount: 0, commits: 1, changedFiles: 1, labels: [] },
      ];

      const analyzer = new GitHubAnalyzer();
      const result = analyzer.detectSupersession(prs);

      expect(result.supersededPRs.length).toBeGreaterThanOrEqual(1);
      expect(result.supersededPRs[0].pattern).toBe('v2');
    });

    test('builds supersession chains', () => {
      const prs: PRInfo[] = [
        { number: 1, title: 'PR 1', author: 'user', state: 'CLOSED', createdAt: '2026-02-01T10:00:00Z', mergedAt: null, additions: 0, deletions: 0, reviewCount: 0, commentCount: 0, commits: 1, changedFiles: 1, labels: [] },
        { number: 2, title: 'PR 2', author: 'user', state: 'CLOSED', createdAt: '2026-02-02T10:00:00Z', mergedAt: null, additions: 0, deletions: 0, reviewCount: 0, commentCount: 0, commits: 1, changedFiles: 1, labels: [], body: 'Supersedes #1' },
        { number: 3, title: 'PR 3', author: 'user', state: 'MERGED', createdAt: '2026-02-03T10:00:00Z', mergedAt: '2026-02-03T12:00:00Z', additions: 0, deletions: 0, reviewCount: 0, commentCount: 0, commits: 1, changedFiles: 1, labels: [], body: 'Supersedes #2' },
      ];

      const analyzer = new GitHubAnalyzer();
      const result = analyzer.detectSupersession(prs);

      expect(result.supersededPRs.length).toBe(2);
      expect(result.chains.length).toBeGreaterThan(0);
    });

    test('calculates supersession rate', () => {
      const prs: PRInfo[] = [
        { number: 1, title: 'PR 1', author: 'user', state: 'CLOSED', createdAt: '2026-02-01T10:00:00Z', mergedAt: null, additions: 0, deletions: 0, reviewCount: 0, commentCount: 0, commits: 1, changedFiles: 1, labels: [] },
        { number: 2, title: 'PR 2', author: 'user', state: 'MERGED', createdAt: '2026-02-02T10:00:00Z', mergedAt: '2026-02-02T12:00:00Z', additions: 0, deletions: 0, reviewCount: 0, commentCount: 0, commits: 1, changedFiles: 1, labels: [], body: 'Supersedes #1' },
        { number: 3, title: 'PR 3', author: 'user', state: 'MERGED', createdAt: '2026-02-03T10:00:00Z', mergedAt: '2026-02-03T12:00:00Z', additions: 0, deletions: 0, reviewCount: 0, commentCount: 0, commits: 1, changedFiles: 1, labels: [] },
        { number: 4, title: 'PR 4', author: 'user', state: 'MERGED', createdAt: '2026-02-04T10:00:00Z', mergedAt: '2026-02-04T12:00:00Z', additions: 0, deletions: 0, reviewCount: 0, commentCount: 0, commits: 1, changedFiles: 1, labels: [] },
      ];

      const analyzer = new GitHubAnalyzer();
      const result = analyzer.detectSupersession(prs);

      expect(result.supersessionRate).toBe(25); // 1/4 = 25%
    });
  });

  // GAP-06: Test File Detection
  describe('analyzeTestCoverage', () => {
    test('detects test files in PRs', () => {
      const prs: PRInfo[] = [
        { number: 1, title: 'PR with tests', author: 'user', state: 'MERGED', createdAt: '2026-02-01T10:00:00Z', mergedAt: '2026-02-01T12:00:00Z', additions: 100, deletions: 0, reviewCount: 1, commentCount: 0, commits: 1, changedFiles: 3, labels: [], files: ['src/feature.ts', 'src/feature.test.ts'] },
        { number: 2, title: 'PR without tests', author: 'user', state: 'MERGED', createdAt: '2026-02-02T10:00:00Z', mergedAt: '2026-02-02T12:00:00Z', additions: 50, deletions: 0, reviewCount: 1, commentCount: 0, commits: 1, changedFiles: 1, labels: [], files: ['src/other.ts'] },
      ];

      const analyzer = new GitHubAnalyzer();
      const result = analyzer.analyzeTestCoverage(prs);

      expect(result.prsWithTests).toBe(1);
      expect(result.totalPRs).toBe(2);
      expect(result.coverageRate).toBe(50);
    });

    test('detects various test file patterns', () => {
      const prs: PRInfo[] = [
        { number: 1, title: 'PR', author: 'user', state: 'MERGED', createdAt: '2026-02-01T10:00:00Z', mergedAt: '2026-02-01T12:00:00Z', additions: 0, deletions: 0, reviewCount: 0, commentCount: 0, commits: 1, changedFiles: 1, labels: [], files: ['app.spec.ts'] },
        { number: 2, title: 'PR', author: 'user', state: 'MERGED', createdAt: '2026-02-02T10:00:00Z', mergedAt: '2026-02-02T12:00:00Z', additions: 0, deletions: 0, reviewCount: 0, commentCount: 0, commits: 1, changedFiles: 1, labels: [], files: ['test/unit.ts'] },
        { number: 3, title: 'PR', author: 'user', state: 'MERGED', createdAt: '2026-02-03T10:00:00Z', mergedAt: '2026-02-03T12:00:00Z', additions: 0, deletions: 0, reviewCount: 0, commentCount: 0, commits: 1, changedFiles: 1, labels: [], files: ['__tests__/app.ts'] },
      ];

      const analyzer = new GitHubAnalyzer();
      const result = analyzer.analyzeTestCoverage(prs);

      expect(result.prsWithTests).toBe(3);
      expect(result.coverageRate).toBe(100);
    });

    test('handles PRs without files data', () => {
      const prs: PRInfo[] = [
        { number: 1, title: 'PR', author: 'user', state: 'MERGED', createdAt: '2026-02-01T10:00:00Z', mergedAt: '2026-02-01T12:00:00Z', additions: 0, deletions: 0, reviewCount: 0, commentCount: 0, commits: 1, changedFiles: 1, labels: [] },
      ];

      const analyzer = new GitHubAnalyzer();
      const result = analyzer.analyzeTestCoverage(prs);

      expect(result.prsWithTests).toBe(0);
      expect(result.totalPRs).toBe(0);
      expect(result.coverageRate).toBe(0);
    });
  });

  // GAP-07: Negative Reviews
  describe('analyzeNegativeReviews', () => {
    test('detects PRs with CHANGES_REQUESTED reviews', () => {
      const prs: PRInfo[] = [
        {
          number: 1,
          title: 'PR with changes requested',
          author: 'user',
          state: 'MERGED',
          createdAt: '2026-02-01T10:00:00Z',
          mergedAt: '2026-02-01T12:00:00Z',
          additions: 0, deletions: 0,
          reviewCount: 2,
          commentCount: 0,
          commits: 1,
          changedFiles: 1,
          labels: [],
          reviews: [
            { state: 'CHANGES_REQUESTED', author: 'reviewer1' },
            { state: 'APPROVED', author: 'reviewer2' },
          ],
        },
        {
          number: 2,
          title: 'Clean PR',
          author: 'user',
          state: 'MERGED',
          createdAt: '2026-02-02T10:00:00Z',
          mergedAt: '2026-02-02T12:00:00Z',
          additions: 0, deletions: 0,
          reviewCount: 1,
          commentCount: 0,
          commits: 1,
          changedFiles: 1,
          labels: [],
          reviews: [{ state: 'APPROVED', author: 'reviewer1' }],
        },
      ];

      const analyzer = new GitHubAnalyzer();
      const result = analyzer.analyzeNegativeReviews(prs);

      expect(result.prsWithNegativeReviews).toBe(1);
      expect(result.totalReviewedPRs).toBe(2);
      expect(result.negativeReviewRate).toBe(50);
      expect(result.prsRequestingChanges).toHaveLength(1);
      expect(result.prsRequestingChanges[0].prNumber).toBe(1);
    });

    test('handles PRs without reviews', () => {
      const prs: PRInfo[] = [
        { number: 1, title: 'PR', author: 'user', state: 'MERGED', createdAt: '2026-02-01T10:00:00Z', mergedAt: '2026-02-01T12:00:00Z', additions: 0, deletions: 0, reviewCount: 0, commentCount: 0, commits: 1, changedFiles: 1, labels: [] },
      ];

      const analyzer = new GitHubAnalyzer();
      const result = analyzer.analyzeNegativeReviews(prs);

      expect(result.prsWithNegativeReviews).toBe(0);
      expect(result.totalReviewedPRs).toBe(0);
      expect(result.negativeReviewRate).toBe(0);
    });

    test('counts multiple negative reviews per PR', () => {
      const prs: PRInfo[] = [
        {
          number: 1,
          title: 'Troubled PR',
          author: 'user',
          state: 'MERGED',
          createdAt: '2026-02-01T10:00:00Z',
          mergedAt: '2026-02-01T12:00:00Z',
          additions: 0, deletions: 0,
          reviewCount: 3,
          commentCount: 0,
          commits: 1,
          changedFiles: 1,
          labels: [],
          reviews: [
            { state: 'CHANGES_REQUESTED', author: 'reviewer1' },
            { state: 'CHANGES_REQUESTED', author: 'reviewer2' },
            { state: 'APPROVED', author: 'reviewer1' },
          ],
        },
      ];

      const analyzer = new GitHubAnalyzer();
      const result = analyzer.analyzeNegativeReviews(prs);

      expect(result.prsRequestingChanges[0].reviewCount).toBe(2);
    });
  });

  // P3: CI Failure Rate Analysis
  describe('analyzeCIFailureRate', () => {
    test('calculates failure rate correctly', () => {
      const mockRuns = [
        { status: 'completed', conclusion: 'success', name: 'CI', createdAt: '2026-02-01T10:00:00Z', headBranch: 'main' },
        { status: 'completed', conclusion: 'success', name: 'CI', createdAt: '2026-02-01T11:00:00Z', headBranch: 'main' },
        { status: 'completed', conclusion: 'failure', name: 'CI', createdAt: '2026-02-01T12:00:00Z', headBranch: 'feature' },
        { status: 'completed', conclusion: 'success', name: 'CI', createdAt: '2026-02-01T13:00:00Z', headBranch: 'main' },
      ];

      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd.includes('gh run list')) return JSON.stringify(mockRuns);
        return '';
      });

      const analyzer = new GitHubAnalyzer();
      const result = analyzer.analyzeCIFailureRate();

      expect(result).toBeDefined();
      expect(result!.totalRuns).toBe(4);
      expect(result!.successfulRuns).toBe(3);
      expect(result!.failedRuns).toBe(1);
      expect(result!.failureRate).toBe(25); // 1/4 = 25%
      expect(result!.successRate).toBe(75);
    });

    test('groups failures by workflow', () => {
      const mockRuns = [
        { status: 'completed', conclusion: 'success', name: 'Build', createdAt: '2026-02-01T10:00:00Z', headBranch: 'main' },
        { status: 'completed', conclusion: 'failure', name: 'Test', createdAt: '2026-02-01T11:00:00Z', headBranch: 'main' },
        { status: 'completed', conclusion: 'failure', name: 'Test', createdAt: '2026-02-01T12:00:00Z', headBranch: 'main' },
        { status: 'completed', conclusion: 'success', name: 'Deploy', createdAt: '2026-02-01T13:00:00Z', headBranch: 'main' },
      ];

      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd.includes('gh run list')) return JSON.stringify(mockRuns);
        return '';
      });

      const analyzer = new GitHubAnalyzer();
      const result = analyzer.analyzeCIFailureRate();

      expect(result).toBeDefined();
      const testWorkflow = result!.byWorkflow.find(w => w.workflow === 'Test');
      expect(testWorkflow).toBeDefined();
      expect(testWorkflow!.runs).toBe(2);
      expect(testWorkflow!.failures).toBe(2);
      expect(testWorkflow!.failureRate).toBe(100);
    });

    test('tracks recent failures', () => {
      const mockRuns = [
        { status: 'completed', conclusion: 'failure', name: 'CI', createdAt: '2026-02-01T10:00:00Z', headBranch: 'feature-1' },
        { status: 'completed', conclusion: 'failure', name: 'CI', createdAt: '2026-02-01T11:00:00Z', headBranch: 'feature-2' },
      ];

      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd.includes('gh run list')) return JSON.stringify(mockRuns);
        return '';
      });

      const analyzer = new GitHubAnalyzer();
      const result = analyzer.analyzeCIFailureRate();

      expect(result).toBeDefined();
      expect(result!.recentFailures).toHaveLength(2);
      expect(result!.recentFailures[0].branch).toBe('feature-1');
    });

    test('handles cancelled runs', () => {
      const mockRuns = [
        { status: 'completed', conclusion: 'success', name: 'CI', createdAt: '2026-02-01T10:00:00Z', headBranch: 'main' },
        { status: 'completed', conclusion: 'cancelled', name: 'CI', createdAt: '2026-02-01T11:00:00Z', headBranch: 'main' },
      ];

      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd.includes('gh run list')) return JSON.stringify(mockRuns);
        return '';
      });

      const analyzer = new GitHubAnalyzer();
      const result = analyzer.analyzeCIFailureRate();

      expect(result).toBeDefined();
      expect(result!.cancelledRuns).toBe(1);
    });

    test('returns undefined when gh run list fails', () => {
      mockExecSync.mockImplementation(() => {
        throw new Error('gh run list failed');
      });

      const analyzer = new GitHubAnalyzer();
      const result = analyzer.analyzeCIFailureRate();

      expect(result).toBeUndefined();
    });

    test('returns undefined for empty runs', () => {
      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd.includes('gh run list')) return JSON.stringify([]);
        return '';
      });

      const analyzer = new GitHubAnalyzer();
      const result = analyzer.analyzeCIFailureRate();

      expect(result).toBeUndefined();
    });
  });

  // P3: PR Scope Analysis
  describe('analyzePRScope', () => {
    test('calculates average and median lines changed', () => {
      const prs: PRInfo[] = [
        { number: 1, title: 'Small PR', author: 'user', state: 'MERGED', createdAt: '2026-02-01T10:00:00Z', mergedAt: '2026-02-01T12:00:00Z', additions: 50, deletions: 10, reviewCount: 0, commentCount: 0, commits: 1, changedFiles: 2, labels: [] },
        { number: 2, title: 'Medium PR', author: 'user', state: 'MERGED', createdAt: '2026-02-02T10:00:00Z', mergedAt: '2026-02-02T12:00:00Z', additions: 150, deletions: 50, reviewCount: 0, commentCount: 0, commits: 1, changedFiles: 5, labels: [] },
        { number: 3, title: 'Large PR', author: 'user', state: 'MERGED', createdAt: '2026-02-03T10:00:00Z', mergedAt: '2026-02-03T12:00:00Z', additions: 400, deletions: 100, reviewCount: 0, commentCount: 0, commits: 1, changedFiles: 15, labels: [] },
      ];

      const analyzer = new GitHubAnalyzer();
      const result = analyzer.analyzePRScope(prs);

      expect(result).toBeDefined();
      // Lines changed: 60, 200, 500 -> avg = 253, median = 200
      expect(result!.averageLinesChanged).toBe(253);
      expect(result!.medianLinesChanged).toBe(200);
      expect(result!.maxLinesChanged).toBe(500);
      expect(result!.minLinesChanged).toBe(60);
    });

    test('identifies large PRs above threshold', () => {
      const prs: PRInfo[] = [
        { number: 1, title: 'Normal PR', author: 'user', state: 'MERGED', createdAt: '2026-02-01T10:00:00Z', mergedAt: '2026-02-01T12:00:00Z', additions: 100, deletions: 50, reviewCount: 0, commentCount: 0, commits: 1, changedFiles: 5, labels: [] },
        { number: 2, title: 'Massive PR', author: 'user', state: 'MERGED', createdAt: '2026-02-02T10:00:00Z', mergedAt: '2026-02-02T12:00:00Z', additions: 1500, deletions: 500, reviewCount: 0, commentCount: 0, commits: 1, changedFiles: 50, labels: [] },
      ];

      const analyzer = new GitHubAnalyzer();
      const result = analyzer.analyzePRScope(prs);

      expect(result).toBeDefined();
      expect(result!.largePRs.length).toBeGreaterThan(0);
      expect(result!.largePRs[0].prNumber).toBe(2);
      expect(result!.largePRs[0].linesChanged).toBe(2000);
    });

    test('calculates scope creep rate', () => {
      const prs: PRInfo[] = [
        { number: 1, title: 'PR 1', author: 'user', state: 'MERGED', createdAt: '2026-02-01T10:00:00Z', mergedAt: '2026-02-01T12:00:00Z', additions: 100, deletions: 50, reviewCount: 0, commentCount: 0, commits: 1, changedFiles: 5, labels: [] },
        { number: 2, title: 'PR 2', author: 'user', state: 'MERGED', createdAt: '2026-02-02T10:00:00Z', mergedAt: '2026-02-02T12:00:00Z', additions: 200, deletions: 100, reviewCount: 0, commentCount: 0, commits: 1, changedFiles: 8, labels: [] },
        { number: 3, title: 'Large PR', author: 'user', state: 'MERGED', createdAt: '2026-02-03T10:00:00Z', mergedAt: '2026-02-03T12:00:00Z', additions: 1000, deletions: 200, reviewCount: 0, commentCount: 0, commits: 1, changedFiles: 30, labels: [] },
      ];

      const analyzer = new GitHubAnalyzer();
      const result = analyzer.analyzePRScope(prs);

      expect(result).toBeDefined();
      expect(result!.scopeCreepRate).toBeGreaterThanOrEqual(0);
    });

    test('assigns concern levels based on size', () => {
      const prs: PRInfo[] = [
        { number: 1, title: 'Medium large', author: 'user', state: 'MERGED', createdAt: '2026-02-01T10:00:00Z', mergedAt: '2026-02-01T12:00:00Z', additions: 600, deletions: 100, reviewCount: 0, commentCount: 0, commits: 1, changedFiles: 15, labels: [] },
        { number: 2, title: 'Very large', author: 'user', state: 'MERGED', createdAt: '2026-02-02T10:00:00Z', mergedAt: '2026-02-02T12:00:00Z', additions: 1200, deletions: 300, reviewCount: 0, commentCount: 0, commits: 1, changedFiles: 30, labels: [] },
        { number: 3, title: 'Massive', author: 'user', state: 'MERGED', createdAt: '2026-02-03T10:00:00Z', mergedAt: '2026-02-03T12:00:00Z', additions: 2000, deletions: 500, reviewCount: 0, commentCount: 0, commits: 1, changedFiles: 50, labels: [] },
      ];

      const analyzer = new GitHubAnalyzer();
      const result = analyzer.analyzePRScope(prs);

      expect(result).toBeDefined();
      // With minimum threshold of 500, all should be flagged
      const concerns = result!.largePRs.map(p => p.concernLevel);
      expect(concerns).toContain('medium');
    });

    test('returns undefined for empty PRs', () => {
      const analyzer = new GitHubAnalyzer();
      const result = analyzer.analyzePRScope([]);

      expect(result).toBeUndefined();
    });

    test('calculates average files changed', () => {
      const prs: PRInfo[] = [
        { number: 1, title: 'PR 1', author: 'user', state: 'MERGED', createdAt: '2026-02-01T10:00:00Z', mergedAt: '2026-02-01T12:00:00Z', additions: 100, deletions: 50, reviewCount: 0, commentCount: 0, commits: 1, changedFiles: 5, labels: [] },
        { number: 2, title: 'PR 2', author: 'user', state: 'MERGED', createdAt: '2026-02-02T10:00:00Z', mergedAt: '2026-02-02T12:00:00Z', additions: 100, deletions: 50, reviewCount: 0, commentCount: 0, commits: 1, changedFiles: 15, labels: [] },
      ];

      const analyzer = new GitHubAnalyzer();
      const result = analyzer.analyzePRScope(prs);

      expect(result).toBeDefined();
      expect(result!.averageFilesChanged).toBe(10); // (5 + 15) / 2
    });
  });
});

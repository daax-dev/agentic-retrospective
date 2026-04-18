/**
 * Unit tests for GitAnalyzer
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { GitAnalyzer } from '../../../src/analyzers/git.js';
import {
  createMockCommit,
  createMockFileChange,
  hotspotCommits,
  agentCommitPatterns,
} from '../../fixtures/index.js';
import {
  emptyScenario,
  singleAuthorScenario,
  multiAuthorScenario,
  agentCommitsScenario,
} from '../../fixtures/git/scenarios.js';

// Mock child_process.execSync
vi.mock('child_process', () => ({
  execSync: vi.fn(),
}));

import { execSync } from 'child_process';
const mockExecSync = vi.mocked(execSync);

describe('GitAnalyzer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('detectAgentCommits', () => {
    test('detects Claude co-authored commits', () => {
      const analyzer = new GitAnalyzer();
      const result = analyzer.detectAgentCommits([agentCommitPatterns.claudeCoAuthor]);

      expect(result).toHaveLength(1);
      expect(result[0].hash).toBe(agentCommitPatterns.claudeCoAuthor.hash);
    });

    test('detects Copilot co-authored commits', () => {
      const analyzer = new GitAnalyzer();
      const result = analyzer.detectAgentCommits([agentCommitPatterns.copilotCoAuthor]);

      expect(result).toHaveLength(1);
    });

    test('detects bot email patterns', () => {
      const analyzer = new GitAnalyzer();
      const result = analyzer.detectAgentCommits([agentCommitPatterns.botEmail]);

      expect(result).toHaveLength(1);
    });

    test('detects anthropic email commits', () => {
      const analyzer = new GitAnalyzer();
      const result = analyzer.detectAgentCommits([agentCommitPatterns.anthropicEmail]);

      expect(result).toHaveLength(1);
    });

    test('detects agent session trailer commits', () => {
      const analyzer = new GitAnalyzer();
      const result = analyzer.detectAgentCommits([agentCommitPatterns.agentSessionTrailer]);

      expect(result).toHaveLength(1);
    });

    test('does not flag human-only commits', () => {
      const analyzer = new GitAnalyzer();
      const result = analyzer.detectAgentCommits([agentCommitPatterns.humanOnly]);

      expect(result).toHaveLength(0);
    });

    test('correctly counts mixed commit scenario', () => {
      const analyzer = new GitAnalyzer();
      const allCommits = [
        agentCommitPatterns.claudeCoAuthor,
        agentCommitPatterns.copilotCoAuthor,
        agentCommitPatterns.botEmail,
        agentCommitPatterns.anthropicEmail,
        agentCommitPatterns.agentSessionTrailer,
        agentCommitPatterns.humanOnly,
      ];
      const result = analyzer.detectAgentCommits(allCommits);

      // 5 agent commits, 1 human commit
      expect(result).toHaveLength(5);
    });
  });

  describe('isGitRepository', () => {
    test('returns true when in a git repository', async () => {
      mockExecSync.mockReturnValue('.git');
      const analyzer = new GitAnalyzer();
      const result = await analyzer.isGitRepository();
      expect(result).toBe(true);
    });

    test('returns false when not in a git repository', async () => {
      mockExecSync.mockImplementation(() => {
        throw new Error('Not a git repository');
      });
      const analyzer = new GitAnalyzer();
      const result = await analyzer.isGitRepository();
      expect(result).toBe(false);
    });

    test('passes explicit cwd to execSync when provided', async () => {
      mockExecSync.mockReturnValue('.git');
      const customCwd = '/some/other/path';
      const analyzer = new GitAnalyzer(customCwd);
      await analyzer.isGitRepository();

      expect(mockExecSync).toHaveBeenCalledWith(
        'git rev-parse --git-dir',
        expect.objectContaining({ cwd: customCwd })
      );
    });

    test('defaults cwd to process.cwd() when no arg', async () => {
      mockExecSync.mockReturnValue('.git');
      const analyzer = new GitAnalyzer();
      await analyzer.isGitRepository();

      expect(mockExecSync).toHaveBeenCalledWith(
        'git rev-parse --git-dir',
        expect.objectContaining({ cwd: process.cwd() })
      );
    });
  });

  describe('cwd parameter threading', () => {
    test('analyze() threads cwd through to all git commands', async () => {
      const customCwd = '/tmp/fake-repo-path';

      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd.includes('--format="%H"') && !cmd.includes('-1')) return '';
        return '';
      });

      const analyzer = new GitAnalyzer(customCwd);
      await analyzer.analyze('HEAD~5', 'HEAD');

      // Every execSync call should have been issued with the custom cwd
      const calls = mockExecSync.mock.calls;
      expect(calls.length).toBeGreaterThan(0);
      for (const call of calls) {
        const opts = call[1] as { cwd?: string } | undefined;
        expect(opts?.cwd).toBe(customCwd);
      }
    });
  });

  describe('analyze', () => {
    test('returns empty result for empty commit range', async () => {
      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd.includes('--format="%H"')) return '';
        return '';
      });

      const analyzer = new GitAnalyzer();
      const result = await analyzer.analyze('HEAD~10', 'HEAD');

      expect(result.commits).toHaveLength(0);
      expect(result.totalLinesAdded).toBe(0);
      expect(result.totalLinesRemoved).toBe(0);
      expect(result.hotspots).toHaveLength(0);
    });

    test('calculates hotspots for files changed 3+ times', async () => {
      // Setup mock to return commits that touch the same file multiple times
      const commits = hotspotCommits;
      const hashes = commits.map(c => c.hash).join('\n');

      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd.includes('--format="%H"')) return hashes;
        if (cmd.includes('--since=')) return commits[0].hash;

        // Match commit info request
        for (const commit of commits) {
          if (cmd.includes(commit.hash) && cmd.includes('--format=')) {
            return `${commit.hash}\n${commit.shortHash}\n${commit.author}\n${commit.email}\n${commit.date}\n${commit.subject}\n${commit.body}`;
          }
          if (cmd.includes(commit.hash) && cmd.includes('--numstat')) {
            return commit.files.map(f => `${f.additions}\t${f.deletions}\t${f.path}`).join('\n');
          }
        }
        return '';
      });

      const analyzer = new GitAnalyzer();
      const result = await analyzer.analyze('HEAD~10', 'HEAD');

      // src/runner.ts is changed in all 5 hotspot commits
      expect(result.hotspots.length).toBeGreaterThan(0);
      const runnerHotspot = result.hotspots.find(h => h.path === 'src/runner.ts');
      expect(runnerHotspot).toBeDefined();
      expect(runnerHotspot?.changes).toBe(5);
    });

    test('groups files by extension correctly', async () => {
      const commits = [
        createMockCommit({
          hash: 'a1a1a1a1',
          files: [
            createMockFileChange({ path: 'src/index.ts' }),
            createMockFileChange({ path: 'src/types.ts' }),
          ],
        }),
        createMockCommit({
          hash: 'b2b2b2b2',
          files: [
            createMockFileChange({ path: 'README.md' }),
            createMockFileChange({ path: 'package.json' }),
          ],
        }),
      ];

      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd.includes('--format="%H"')) return commits.map(c => c.hash).join('\n');
        if (cmd.includes('--since=')) return commits[0].hash;

        for (const commit of commits) {
          if (cmd.includes(commit.hash) && cmd.includes('--format=')) {
            return `${commit.hash}\n${commit.shortHash}\n${commit.author}\n${commit.email}\n${commit.date}\n${commit.subject}\n${commit.body}`;
          }
          if (cmd.includes(commit.hash) && cmd.includes('--numstat')) {
            return commit.files.map(f => `${f.additions}\t${f.deletions}\t${f.path}`).join('\n');
          }
        }
        return '';
      });

      const analyzer = new GitAnalyzer();
      const result = await analyzer.analyze('HEAD~10', 'HEAD');

      expect(result.filesByExtension.get('.ts')).toBe(2);
      expect(result.filesByExtension.get('.md')).toBe(1);
      expect(result.filesByExtension.get('.json')).toBe(1);
    });

    test('returns empty hotspots when no file changed 3+ times', async () => {
      // Single author scenario - each file touched only once
      const commits = singleAuthorScenario.commits;
      const hashes = commits.map(c => c.hash).join('\n');

      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd.includes('--format="%H"')) return hashes;
        if (cmd.includes('--since=')) return commits[0].hash;

        for (const commit of commits) {
          if (cmd.includes(commit.hash) && cmd.includes('--format=')) {
            return `${commit.hash}\n${commit.shortHash}\n${commit.author}\n${commit.email}\n${commit.date}\n${commit.subject}\n${commit.body}`;
          }
          if (cmd.includes(commit.hash) && cmd.includes('--numstat')) {
            return commit.files.map(f => `${f.additions}\t${f.deletions}\t${f.path}`).join('\n');
          }
        }
        return '';
      });

      const analyzer = new GitAnalyzer();
      const result = await analyzer.analyze('HEAD~10', 'HEAD');

      expect(result.hotspots).toHaveLength(0);
    });

    test('handles binary files (lines = "-") as 0 lines', async () => {
      const commits = [
        createMockCommit({
          hash: 'binary111',
          files: [createMockFileChange({ path: 'image.png' })],
        }),
      ];

      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd.includes('--format="%H"')) return commits[0].hash;
        if (cmd.includes('--since=')) return commits[0].hash;
        if (cmd.includes('binary111') && cmd.includes('--format=')) {
          return `binary111\nbinary1\nAuthor\nemail@test.com\n2026-01-01\nAdd image\n`;
        }
        if (cmd.includes('binary111') && cmd.includes('--numstat')) {
          return `-\t-\timage.png`; // Binary file format
        }
        return '';
      });

      const analyzer = new GitAnalyzer();
      const result = await analyzer.analyze('HEAD~1', 'HEAD');

      expect(result.commits).toHaveLength(1);
      expect(result.commits[0].linesAdded).toBe(0);
      expect(result.commits[0].linesRemoved).toBe(0);
    });

    test('calculates totals correctly', async () => {
      const commits = [
        createMockCommit({ hash: 'c1c1c1c1', linesAdded: 100, linesRemoved: 50 }),
        createMockCommit({ hash: 'c2c2c2c2', linesAdded: 200, linesRemoved: 75 }),
      ];

      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd.includes('--format="%H"')) return commits.map(c => c.hash).join('\n');
        if (cmd.includes('--since=')) return commits[0].hash;

        for (const commit of commits) {
          if (cmd.includes(commit.hash) && cmd.includes('--format=')) {
            return `${commit.hash}\n${commit.shortHash}\n${commit.author}\n${commit.email}\n${commit.date}\n${commit.subject}\n${commit.body}`;
          }
          if (cmd.includes(commit.hash) && cmd.includes('--numstat')) {
            return `${commit.linesAdded}\t${commit.linesRemoved}\tsrc/file.ts`;
          }
        }
        return '';
      });

      const analyzer = new GitAnalyzer();
      const result = await analyzer.analyze('HEAD~10', 'HEAD');

      expect(result.totalLinesAdded).toBe(300);
      expect(result.totalLinesRemoved).toBe(125);
    });
  });

  // GAP-01: Commit Type Classification
  describe('categorizeCommit', () => {
    test('categorizes conventional feat commits', () => {
      const analyzer = new GitAnalyzer();
      expect(analyzer.categorizeCommit('feat: add new feature')).toBe('feat');
      expect(analyzer.categorizeCommit('feat(auth): add login')).toBe('feat');
    });

    test('categorizes conventional fix commits', () => {
      const analyzer = new GitAnalyzer();
      expect(analyzer.categorizeCommit('fix: resolve bug')).toBe('fix');
      expect(analyzer.categorizeCommit('fix(api): handle null')).toBe('fix');
    });

    test('categorizes conventional docs commits', () => {
      const analyzer = new GitAnalyzer();
      expect(analyzer.categorizeCommit('docs: update README')).toBe('docs');
      expect(analyzer.categorizeCommit('docs(api): add examples')).toBe('docs');
    });

    test('categorizes conventional test commits', () => {
      const analyzer = new GitAnalyzer();
      expect(analyzer.categorizeCommit('test: add unit tests')).toBe('test');
      expect(analyzer.categorizeCommit('test(auth): cover edge case')).toBe('test');
    });

    test('categorizes conventional refactor commits', () => {
      const analyzer = new GitAnalyzer();
      expect(analyzer.categorizeCommit('refactor: clean up code')).toBe('refactor');
      expect(analyzer.categorizeCommit('refactor(utils): simplify logic')).toBe('refactor');
    });

    test('categorizes conventional chore commits', () => {
      const analyzer = new GitAnalyzer();
      expect(analyzer.categorizeCommit('chore: update deps')).toBe('chore');
      expect(analyzer.categorizeCommit('chore(ci): fix workflow')).toBe('chore');
    });

    test('categorizes by heuristics when not conventional', () => {
      const analyzer = new GitAnalyzer();
      expect(analyzer.categorizeCommit('Add new user feature')).toBe('feat');
      expect(analyzer.categorizeCommit('Fix null pointer bug')).toBe('fix');
      expect(analyzer.categorizeCommit('Update documentation')).toBe('docs');
      expect(analyzer.categorizeCommit('Add unit tests')).toBe('test');
      expect(analyzer.categorizeCommit('Refactor auth module')).toBe('refactor');
      expect(analyzer.categorizeCommit('Bump version')).toBe('chore');
    });

    test('returns other for unrecognized commits', () => {
      const analyzer = new GitAnalyzer();
      expect(analyzer.categorizeCommit('WIP')).toBe('other');
      expect(analyzer.categorizeCommit('misc changes')).toBe('other');
    });
  });

  // GAP-02: Checkpoint Detection
  describe('isCheckpointCommit', () => {
    test('detects WIP commits', () => {
      const analyzer = new GitAnalyzer();
      expect(analyzer.isCheckpointCommit('wip')).toBe(true);
      expect(analyzer.isCheckpointCommit('WIP: in progress')).toBe(true);
      expect(analyzer.isCheckpointCommit('Work in progress')).toBe(true);
    });

    test('detects save/tmp commits', () => {
      const analyzer = new GitAnalyzer();
      expect(analyzer.isCheckpointCommit('save')).toBe(true);
      expect(analyzer.isCheckpointCommit('tmp')).toBe(true);
      expect(analyzer.isCheckpointCommit('temp')).toBe(true);
      expect(analyzer.isCheckpointCommit('checkpoint')).toBe(true);
    });

    test('detects placeholder commits', () => {
      const analyzer = new GitAnalyzer();
      expect(analyzer.isCheckpointCommit('...')).toBe(true);
      expect(analyzer.isCheckpointCommit('x')).toBe(true);
      expect(analyzer.isCheckpointCommit('-')).toBe(true);
      expect(analyzer.isCheckpointCommit('.')).toBe(true);
    });

    test('does not flag normal commits', () => {
      const analyzer = new GitAnalyzer();
      expect(analyzer.isCheckpointCommit('feat: add login')).toBe(false);
      expect(analyzer.isCheckpointCommit('Update README')).toBe(false);
    });
  });

  // GAP-03: Work Classification
  describe('calculateWorkClassification', () => {
    test('calculates proactive/reactive ratio correctly', () => {
      const analyzer = new GitAnalyzer();
      const breakdown = {
        feat: 5,   // proactive
        docs: 2,   // proactive
        test: 3,   // proactive
        fix: 4,    // reactive
        refactor: 2, // reactive
        chore: 2,  // reactive
        other: 0,
      };

      const result = analyzer.calculateWorkClassification(breakdown);

      expect(result.proactive).toBe(10); // 5+2+3
      expect(result.reactive).toBe(8);   // 4+2+2
      expect(result.ratio).toBeCloseTo(10/18, 2);
    });

    test('handles all proactive commits', () => {
      const analyzer = new GitAnalyzer();
      const breakdown = {
        feat: 10, docs: 0, test: 0,
        fix: 0, refactor: 0, chore: 0, other: 0,
      };

      const result = analyzer.calculateWorkClassification(breakdown);
      expect(result.ratio).toBe(1);
    });

    test('handles all reactive commits', () => {
      const analyzer = new GitAnalyzer();
      const breakdown = {
        feat: 0, docs: 0, test: 0,
        fix: 10, refactor: 0, chore: 0, other: 0,
      };

      const result = analyzer.calculateWorkClassification(breakdown);
      expect(result.ratio).toBe(0);
    });

    test('handles empty breakdown', () => {
      const analyzer = new GitAnalyzer();
      const breakdown = {
        feat: 0, docs: 0, test: 0,
        fix: 0, refactor: 0, chore: 0, other: 0,
      };

      const result = analyzer.calculateWorkClassification(breakdown);
      expect(result.ratio).toBe(0);
    });
  });

  // P3: Commit Cadence Analysis
  describe('calculateCommitCadence', () => {
    test('returns default metrics for single commit', () => {
      const analyzer = new GitAnalyzer();
      const commits = [createMockCommit({ hash: 'single', date: '2026-01-15T10:00:00Z' })];

      const result = analyzer.calculateCommitCadence(commits);

      expect(result.averageTimeBetweenCommits).toBe(0);
      expect(result.trend).toBe('stable');
    });

    test('returns default metrics for empty commits', () => {
      const analyzer = new GitAnalyzer();
      const result = analyzer.calculateCommitCadence([]);

      expect(result.averageTimeBetweenCommits).toBe(0);
      expect(result.commitsPerDay).toBe(0);
    });

    test('calculates average time between commits correctly', () => {
      const analyzer = new GitAnalyzer();
      const commits = [
        createMockCommit({ hash: 'c1', date: '2026-01-15T10:00:00Z' }),
        createMockCommit({ hash: 'c2', date: '2026-01-15T14:00:00Z' }), // 4 hours later
        createMockCommit({ hash: 'c3', date: '2026-01-15T16:00:00Z' }), // 2 hours later
      ];

      const result = analyzer.calculateCommitCadence(commits);

      // Average gap: (4 + 2) / 2 = 3 hours
      expect(result.averageTimeBetweenCommits).toBe(3);
    });

    test('calculates commits per day correctly', () => {
      const analyzer = new GitAnalyzer();
      const commits = [
        createMockCommit({ hash: 'c1', date: '2026-01-15T10:00:00Z' }),
        createMockCommit({ hash: 'c2', date: '2026-01-16T10:00:00Z' }),
        createMockCommit({ hash: 'c3', date: '2026-01-17T10:00:00Z' }),
      ];

      const result = analyzer.calculateCommitCadence(commits);

      // 3 commits over 2 days = 1.5 commits per day
      expect(result.commitsPerDay).toBe(1.5);
    });

    test('detects increasing commit frequency (trend)', () => {
      const analyzer = new GitAnalyzer();
      // Commits get closer together over time
      const commits = [
        createMockCommit({ hash: 'c1', date: '2026-01-10T10:00:00Z' }),
        createMockCommit({ hash: 'c2', date: '2026-01-15T10:00:00Z' }), // 5 days gap
        createMockCommit({ hash: 'c3', date: '2026-01-16T10:00:00Z' }), // 1 day gap
        createMockCommit({ hash: 'c4', date: '2026-01-16T14:00:00Z' }), // 4 hours gap
      ];

      const result = analyzer.calculateCommitCadence(commits);

      expect(result.trend).toBe('increasing');
    });

    test('detects decreasing commit frequency (trend)', () => {
      const analyzer = new GitAnalyzer();
      // Commits get further apart over time
      const commits = [
        createMockCommit({ hash: 'c1', date: '2026-01-10T10:00:00Z' }),
        createMockCommit({ hash: 'c2', date: '2026-01-10T14:00:00Z' }), // 4 hours gap
        createMockCommit({ hash: 'c3', date: '2026-01-11T10:00:00Z' }), // 20 hours gap
        createMockCommit({ hash: 'c4', date: '2026-01-16T10:00:00Z' }), // 5 days gap
      ];

      const result = analyzer.calculateCommitCadence(commits);

      expect(result.trend).toBe('decreasing');
    });

    test('calculates max gap in days correctly', () => {
      const analyzer = new GitAnalyzer();
      const commits = [
        createMockCommit({ hash: 'c1', date: '2026-01-10T10:00:00Z' }),
        createMockCommit({ hash: 'c2', date: '2026-01-11T10:00:00Z' }), // 1 day
        createMockCommit({ hash: 'c3', date: '2026-01-18T10:00:00Z' }), // 7 days (max)
      ];

      const result = analyzer.calculateCommitCadence(commits);

      expect(result.maxGapDays).toBe(7);
    });

    test('identifies busiest day correctly', () => {
      const analyzer = new GitAnalyzer();
      // More commits on Tuesday (2026-01-13 is Tuesday)
      const commits = [
        createMockCommit({ hash: 'c1', date: '2026-01-13T10:00:00Z' }), // Tuesday
        createMockCommit({ hash: 'c2', date: '2026-01-13T12:00:00Z' }), // Tuesday
        createMockCommit({ hash: 'c3', date: '2026-01-13T14:00:00Z' }), // Tuesday
        createMockCommit({ hash: 'c4', date: '2026-01-14T10:00:00Z' }), // Wednesday
      ];

      const result = analyzer.calculateCommitCadence(commits);

      expect(result.busiestDay).toBe('Tuesday');
    });

    test('calculates irregularity score', () => {
      const analyzer = new GitAnalyzer();
      // Very irregular - some gaps are small, some are large
      const commits = [
        createMockCommit({ hash: 'c1', date: '2026-01-10T10:00:00Z' }),
        createMockCommit({ hash: 'c2', date: '2026-01-10T11:00:00Z' }), // 1 hour
        createMockCommit({ hash: 'c3', date: '2026-01-15T10:00:00Z' }), // 5 days
        createMockCommit({ hash: 'c4', date: '2026-01-15T12:00:00Z' }), // 2 hours
      ];

      const result = analyzer.calculateCommitCadence(commits);

      // High irregularity expected due to varying gaps
      expect(result.irregularityScore).toBeGreaterThan(0.5);
    });

    test('calculates regular pattern with low irregularity', () => {
      const analyzer = new GitAnalyzer();
      // Regular - consistent 24 hour gaps
      const commits = [
        createMockCommit({ hash: 'c1', date: '2026-01-10T10:00:00Z' }),
        createMockCommit({ hash: 'c2', date: '2026-01-11T10:00:00Z' }),
        createMockCommit({ hash: 'c3', date: '2026-01-12T10:00:00Z' }),
        createMockCommit({ hash: 'c4', date: '2026-01-13T10:00:00Z' }),
      ];

      const result = analyzer.calculateCommitCadence(commits);

      // Low irregularity expected due to consistent gaps
      expect(result.irregularityScore).toBe(0);
    });
  });
});

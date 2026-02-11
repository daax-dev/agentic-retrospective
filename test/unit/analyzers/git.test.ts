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
});

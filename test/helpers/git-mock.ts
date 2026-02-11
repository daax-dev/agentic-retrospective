/**
 * Git operation mocking utilities for tests
 */

import { vi } from 'vitest';
import type { CommitInfo } from '../../src/types.js';
import type { GitAnalysisResult } from '../../src/analyzers/git.js';

/**
 * Create a mock GitAnalysisResult
 */
export function createMockGitResult(overrides: Partial<GitAnalysisResult> = {}): GitAnalysisResult {
  return {
    commits: [],
    totalLinesAdded: 0,
    totalLinesRemoved: 0,
    filesByExtension: new Map(),
    hotspots: [],
    ...overrides,
  };
}

/**
 * Create a mock GitAnalyzer that returns predefined results
 */
export function createMockGitAnalyzer(commits: CommitInfo[]) {
  const fileChangeCounts = new Map<string, number>();
  const filesByExtension = new Map<string, number>();
  let totalLinesAdded = 0;
  let totalLinesRemoved = 0;

  for (const commit of commits) {
    totalLinesAdded += commit.linesAdded;
    totalLinesRemoved += commit.linesRemoved;

    for (const file of commit.files) {
      const current = fileChangeCounts.get(file.path) || 0;
      fileChangeCounts.set(file.path, current + 1);

      const ext = getExtension(file.path);
      const extCount = filesByExtension.get(ext) || 0;
      filesByExtension.set(ext, extCount + 1);
    }
  }

  const hotspots = Array.from(fileChangeCounts.entries())
    .filter(([_, count]) => count >= 3)
    .map(([path, changes]) => ({ path, changes }))
    .sort((a, b) => b.changes - a.changes)
    .slice(0, 10);

  return {
    isGitRepository: vi.fn().mockResolvedValue(true),
    analyze: vi.fn().mockResolvedValue({
      commits,
      totalLinesAdded,
      totalLinesRemoved,
      filesByExtension,
      hotspots,
    }),
  };
}

function getExtension(path: string): string {
  const parts = path.split('.');
  return parts.length > 1 ? `.${parts[parts.length - 1]}` : '(none)';
}

/**
 * Mock execSync to return predefined git output
 */
export function mockGitCommands(commitData: CommitInfo[]) {
  const hashes = commitData.map(c => c.hash).join('\n');

  return vi.fn((command: string) => {
    if (command.includes('rev-parse --git-dir')) {
      return '.git';
    }
    if (command.includes('git log') && command.includes('--format="%H"')) {
      return hashes;
    }
    // Add more command mocks as needed
    return '';
  });
}

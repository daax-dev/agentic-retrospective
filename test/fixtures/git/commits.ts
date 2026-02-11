/**
 * Mock commit data for testing GitAnalyzer
 */

import type { CommitInfo, FileChange } from '../../../src/types.js';

export function createMockCommit(overrides: Partial<CommitInfo> = {}): CommitInfo {
  const hash = overrides.hash || `${Math.random().toString(16).slice(2, 10)}`;
  return {
    hash,
    shortHash: hash.slice(0, 7),
    author: 'Test Author',
    email: 'test@example.com',
    date: new Date().toISOString(),
    subject: 'Test commit',
    body: '',
    files: [],
    linesAdded: 10,
    linesRemoved: 5,
    ...overrides,
  };
}

export function createMockFileChange(overrides: Partial<FileChange> = {}): FileChange {
  return {
    path: 'src/test.ts',
    additions: 10,
    deletions: 5,
    changeType: 'modify',
    ...overrides,
  };
}

// Agent commit patterns for testing detection
export const agentCommitPatterns = {
  claudeCoAuthor: createMockCommit({
    hash: 'aaa1111111111111',
    author: 'Human Developer',
    email: 'human@example.com',
    subject: 'Add authentication feature',
    body: 'Implements JWT auth\n\nCo-authored-by: Claude <noreply@anthropic.com>',
  }),

  copilotCoAuthor: createMockCommit({
    hash: 'bbb2222222222222',
    author: 'Human Developer',
    email: 'human@example.com',
    subject: 'Refactor utils',
    body: 'Clean up utility functions\n\nCo-authored-by: GitHub Copilot <copilot@github.com>',
  }),

  botEmail: createMockCommit({
    hash: 'ccc3333333333333',
    author: 'dependabot[bot]',
    email: 'dependabot[bot]@users.noreply.github.com',
    subject: 'Bump lodash from 4.17.20 to 4.17.21',
  }),

  anthropicEmail: createMockCommit({
    hash: 'ddd4444444444444',
    author: 'Claude',
    email: 'noreply@anthropic.com',
    subject: 'Implement feature X',
  }),

  agentSessionTrailer: createMockCommit({
    hash: 'eee5555555555555',
    author: 'Human Developer',
    email: 'human@example.com',
    subject: 'Fix bug in parser',
    body: 'Fixes edge case handling\n\nAgent-Session: sess-12345',
  }),

  humanOnly: createMockCommit({
    hash: 'fff6666666666666',
    author: 'Human Developer',
    email: 'human@example.com',
    subject: 'Manual fix for production issue',
    body: 'Hotfix applied manually',
  }),
};

// Commits that touch the same file multiple times (for hotspot detection)
export const hotspotCommits: CommitInfo[] = [
  createMockCommit({
    hash: '1111111111111111',
    subject: 'Initial implementation',
    files: [createMockFileChange({ path: 'src/runner.ts', additions: 100, deletions: 0 })],
    linesAdded: 100,
    linesRemoved: 0,
  }),
  createMockCommit({
    hash: '2222222222222222',
    subject: 'Add error handling',
    files: [createMockFileChange({ path: 'src/runner.ts', additions: 50, deletions: 10 })],
    linesAdded: 50,
    linesRemoved: 10,
  }),
  createMockCommit({
    hash: '3333333333333333',
    subject: 'Fix edge case',
    files: [createMockFileChange({ path: 'src/runner.ts', additions: 20, deletions: 5 })],
    linesAdded: 20,
    linesRemoved: 5,
  }),
  createMockCommit({
    hash: '4444444444444444',
    subject: 'Refactor for clarity',
    files: [createMockFileChange({ path: 'src/runner.ts', additions: 80, deletions: 60 })],
    linesAdded: 80,
    linesRemoved: 60,
  }),
  createMockCommit({
    hash: '5555555555555555',
    subject: 'Add new feature',
    files: [createMockFileChange({ path: 'src/runner.ts', additions: 40, deletions: 5 })],
    linesAdded: 40,
    linesRemoved: 5,
  }),
];

/**
 * Git test scenarios for various analyzer states
 */

import type { CommitInfo } from '../../../src/types.js';
import { createMockCommit, createMockFileChange, hotspotCommits, agentCommitPatterns } from './commits.js';

export interface GitScenario {
  name: string;
  description: string;
  commits: CommitInfo[];
  expectedHotspots: string[];
  expectedAgentCommits: number;
}

/**
 * Empty repository - no commits
 */
export const emptyScenario: GitScenario = {
  name: 'empty',
  description: 'Empty repository with no commits',
  commits: [],
  expectedHotspots: [],
  expectedAgentCommits: 0,
};

/**
 * Single author, few commits, no hotspots
 */
export const singleAuthorScenario: GitScenario = {
  name: 'single-author',
  description: 'Single author with 5 commits, no file changed 3+ times',
  commits: [
    createMockCommit({
      hash: 'a1a1a1a1',
      author: 'Solo Dev',
      subject: 'Add file A',
      files: [createMockFileChange({ path: 'src/a.ts' })],
    }),
    createMockCommit({
      hash: 'b2b2b2b2',
      author: 'Solo Dev',
      subject: 'Add file B',
      files: [createMockFileChange({ path: 'src/b.ts' })],
    }),
    createMockCommit({
      hash: 'c3c3c3c3',
      author: 'Solo Dev',
      subject: 'Add file C',
      files: [createMockFileChange({ path: 'src/c.ts' })],
    }),
    createMockCommit({
      hash: 'd4d4d4d4',
      author: 'Solo Dev',
      subject: 'Add file D',
      files: [createMockFileChange({ path: 'src/d.ts' })],
    }),
    createMockCommit({
      hash: 'e5e5e5e5',
      author: 'Solo Dev',
      subject: 'Add file E',
      files: [createMockFileChange({ path: 'src/e.ts' })],
    }),
  ],
  expectedHotspots: [],
  expectedAgentCommits: 0,
};

/**
 * Multi-author scenario with hotspots
 */
export const multiAuthorScenario: GitScenario = {
  name: 'multi-author',
  description: 'Multiple authors with 15 commits, some files are hotspots',
  commits: [
    ...hotspotCommits, // 5 commits all touching src/runner.ts
    createMockCommit({
      hash: 'f1f1f1f1',
      author: 'Alice',
      subject: 'Update types',
      files: [createMockFileChange({ path: 'src/types.ts' })],
    }),
    createMockCommit({
      hash: 'f2f2f2f2',
      author: 'Bob',
      subject: 'Fix type',
      files: [createMockFileChange({ path: 'src/types.ts' })],
    }),
    createMockCommit({
      hash: 'f3f3f3f3',
      author: 'Alice',
      subject: 'Add type',
      files: [createMockFileChange({ path: 'src/types.ts' })],
    }),
    createMockCommit({
      hash: 'g1g1g1g1',
      author: 'Charlie',
      subject: 'Add util',
      files: [createMockFileChange({ path: 'src/utils.ts' })],
    }),
    createMockCommit({
      hash: 'g2g2g2g2',
      author: 'Charlie',
      subject: 'Fix util',
      files: [createMockFileChange({ path: 'src/utils.ts' })],
    }),
    createMockCommit({
      hash: 'h1h1h1h1',
      author: 'Bob',
      subject: 'Update readme',
      files: [createMockFileChange({ path: 'README.md' })],
    }),
    createMockCommit({
      hash: 'h2h2h2h2',
      author: 'Alice',
      subject: 'Update config',
      files: [createMockFileChange({ path: 'config.json' })],
    }),
    createMockCommit({
      hash: 'h3h3h3h3',
      author: 'Charlie',
      subject: 'Add tests',
      files: [createMockFileChange({ path: 'test/runner.test.ts' })],
    }),
    createMockCommit({
      hash: 'h4h4h4h4',
      author: 'Bob',
      subject: 'More tests',
      files: [createMockFileChange({ path: 'test/utils.test.ts' })],
    }),
    createMockCommit({
      hash: 'h5h5h5h5',
      author: 'Alice',
      subject: 'Final polish',
      files: [createMockFileChange({ path: 'src/index.ts' })],
    }),
  ],
  expectedHotspots: ['src/runner.ts', 'src/types.ts'], // Changed 5 and 3 times respectively
  expectedAgentCommits: 0,
};

/**
 * Large commits scenario (unhealthy pattern)
 */
export const largeCommitsScenario: GitScenario = {
  name: 'large-commits',
  description: '8 large commits (>200 lines each)',
  commits: [
    createMockCommit({ hash: 'l1l1l1l1', subject: 'Big refactor 1', linesAdded: 500, linesRemoved: 200 }),
    createMockCommit({ hash: 'l2l2l2l2', subject: 'Big refactor 2', linesAdded: 300, linesRemoved: 100 }),
    createMockCommit({ hash: 'l3l3l3l3', subject: 'Big refactor 3', linesAdded: 400, linesRemoved: 150 }),
    createMockCommit({ hash: 'l4l4l4l4', subject: 'Big refactor 4', linesAdded: 250, linesRemoved: 50 }),
    createMockCommit({ hash: 'l5l5l5l5', subject: 'Big refactor 5', linesAdded: 350, linesRemoved: 100 }),
    createMockCommit({ hash: 'l6l6l6l6', subject: 'Big refactor 6', linesAdded: 280, linesRemoved: 80 }),
    createMockCommit({ hash: 'l7l7l7l7', subject: 'Big refactor 7', linesAdded: 320, linesRemoved: 90 }),
    createMockCommit({ hash: 'l8l8l8l8', subject: 'Big refactor 8', linesAdded: 450, linesRemoved: 200 }),
  ],
  expectedHotspots: [],
  expectedAgentCommits: 0,
};

/**
 * Agent-heavy scenario with various detection patterns
 */
export const agentCommitsScenario: GitScenario = {
  name: 'agent-commits',
  description: '12 commits including various agent commit patterns',
  commits: [
    agentCommitPatterns.claudeCoAuthor,
    agentCommitPatterns.copilotCoAuthor,
    agentCommitPatterns.botEmail,
    agentCommitPatterns.anthropicEmail,
    agentCommitPatterns.agentSessionTrailer,
    agentCommitPatterns.humanOnly,
    createMockCommit({ hash: 'h1h1h1h1', author: 'Human 1', email: 'h1@example.com', subject: 'Human commit 1' }),
    createMockCommit({ hash: 'h2h2h2h2', author: 'Human 2', email: 'h2@example.com', subject: 'Human commit 2' }),
    createMockCommit({ hash: 'h3h3h3h3', author: 'Human 3', email: 'h3@example.com', subject: 'Human commit 3' }),
    createMockCommit({ hash: 'h4h4h4h4', author: 'Human 1', email: 'h1@example.com', subject: 'Human commit 4' }),
    createMockCommit({ hash: 'h5h5h5h5', author: 'Human 2', email: 'h2@example.com', subject: 'Human commit 5' }),
    createMockCommit({ hash: 'h6h6h6h6', author: 'Human 3', email: 'h3@example.com', subject: 'Human commit 6' }),
  ],
  expectedHotspots: [],
  expectedAgentCommits: 5, // claude, copilot, bot, anthropic email, agent session
};

/**
 * Scope drift scenario - unrelated files modified together
 */
export const scopeDriftScenario: GitScenario = {
  name: 'scope-drift',
  description: 'Commits touching unrelated files together (scope drift pattern)',
  commits: [
    createMockCommit({
      hash: 'd1d1d1d1',
      subject: 'Add auth feature',
      files: [
        createMockFileChange({ path: 'src/auth/login.ts', additions: 50 }),
        createMockFileChange({ path: 'src/utils/format.ts', additions: 30 }), // Unrelated
        createMockFileChange({ path: 'src/components/Header.tsx', additions: 20 }), // Unrelated
      ],
      linesAdded: 100,
    }),
    createMockCommit({
      hash: 'd2d2d2d2',
      subject: 'Fix validation',
      files: [
        createMockFileChange({ path: 'src/validation/schema.ts', additions: 40 }),
        createMockFileChange({ path: 'src/styles/global.css', additions: 15 }), // Unrelated
      ],
      linesAdded: 55,
    }),
    // More commits with mixed scope...
    createMockCommit({ hash: 'd3d3d3d3', subject: 'Cleanup' }),
    createMockCommit({ hash: 'd4d4d4d4', subject: 'More cleanup' }),
    createMockCommit({ hash: 'd5d5d5d5', subject: 'Final fixes' }),
    createMockCommit({ hash: 'd6d6d6d6', subject: 'polish' }),
    createMockCommit({ hash: 'd7d7d7d7', subject: 'readme' }),
    createMockCommit({ hash: 'd8d8d8d8', subject: 'config' }),
    createMockCommit({ hash: 'd9d9d9d9', subject: 'deps' }),
    createMockCommit({ hash: 'd10d10d10', subject: 'ci' }),
    createMockCommit({ hash: 'd11d11d11', subject: 'lint' }),
    createMockCommit({ hash: 'd12d12d12', subject: 'format' }),
  ],
  expectedHotspots: [],
  expectedAgentCommits: 0,
};

export const allScenarios: GitScenario[] = [
  emptyScenario,
  singleAuthorScenario,
  multiAuthorScenario,
  largeCommitsScenario,
  agentCommitsScenario,
  scopeDriftScenario,
];

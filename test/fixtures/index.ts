/**
 * Central export for all test fixtures
 */

// Git fixtures
export * from './git/commits.js';
export * from './git/scenarios.js';

// Re-export helper functions
export { loadJsonlFixture, loadJsonFixture, getFixturePath, getFixturesDir } from '../helpers/fixture-loader.js';
export { createTempDir, createMockLogsDir, type TempDir } from '../helpers/temp-dir.js';
export { createMockGitResult, createMockGitAnalyzer, mockGitCommands } from '../helpers/git-mock.js';

// Fixture paths for direct access
export const FIXTURE_PATHS = {
  decisions: {
    minimal: 'decisions/minimal.jsonl',
    full: 'decisions/full.jsonl',
    oneWayDoors: 'decisions/one-way-doors.jsonl',
    mixedActors: 'decisions/mixed-actors.jsonl',
    malformed: 'decisions/malformed.jsonl',
  },
  feedback: {
    highAlignment: 'feedback/high-alignment.jsonl',
    lowAlignment: 'feedback/low-alignment.jsonl',
  },
  tools: {
    healthy: 'tools/healthy.jsonl',
    highErrors: 'tools/high-errors.jsonl',
  },
} as const;

/**
 * Temporary directory management for tests
 */

import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

export interface TempDir {
  path: string;
  cleanup: () => void;
  createFile: (relativePath: string, content: string) => string;
  createDir: (relativePath: string) => string;
}

/**
 * Create a temporary directory for testing
 */
export function createTempDir(prefix = 'agentic-retro-test-'): TempDir {
  const path = mkdtempSync(join(tmpdir(), prefix));

  return {
    path,
    cleanup: () => {
      try {
        rmSync(path, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    },
    createFile: (relativePath: string, content: string) => {
      const fullPath = join(path, relativePath);
      const dir = join(fullPath, '..');
      mkdirSync(dir, { recursive: true });
      writeFileSync(fullPath, content);
      return fullPath;
    },
    createDir: (relativePath: string) => {
      const fullPath = join(path, relativePath);
      mkdirSync(fullPath, { recursive: true });
      return fullPath;
    },
  };
}

/**
 * Create a mock .logs directory structure for testing
 */
export function createMockLogsDir(tempDir: TempDir): string {
  const logsDir = tempDir.createDir('.logs');
  tempDir.createDir('.logs/decisions');
  tempDir.createDir('.logs/feedback');
  tempDir.createDir('.logs/prompts');
  tempDir.createDir('.logs/tools');
  tempDir.createDir('.logs/security');
  return logsDir;
}

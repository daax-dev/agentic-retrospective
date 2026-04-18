/**
 * Unit tests for findRetroConfig().
 */

import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { writeFileSync } from 'fs';
import { join } from 'path';
import { createTempDir, type TempDir } from '../helpers/temp-dir.js';
import { findRetroConfig } from '../../src/config.js';

describe('findRetroConfig', () => {
  let tempDir: TempDir;

  beforeEach(() => {
    tempDir = createTempDir('retro-config-');
  });

  afterEach(() => {
    tempDir.cleanup();
  });

  test('returns null when no .retro.toml exists anywhere up to root', () => {
    // tmpdir should not contain a .retro.toml all the way up
    // (this is a best-effort assumption — if one exists in /tmp it would shadow)
    // Create a nested dir and search from there.
    const nested = tempDir.createDir('a/b/c');
    const result = findRetroConfig(nested);
    // If any ancestor happens to have a `.retro.toml`, this test would fail.
    // Under CI / dev environments that is not expected.
    expect(result).toBeNull();
  });

  test('returns parsed object when .retro.toml is in the start directory', () => {
    tempDir.createFile(
      '.retro.toml',
      `[retrospective]
sprint_id = "sprint-42"
output_dir = "docs/retrospectives"

[[repos]]
path = "."
label = "frontend"

[[repos]]
path = "../api"
label = "api"
`
    );

    const result = findRetroConfig(tempDir.path);
    expect(result).not.toBeNull();
    expect(result?.retrospective?.sprint_id).toBe('sprint-42');
    expect(result?.retrospective?.output_dir).toBe('docs/retrospectives');
    expect(result?.repos).toHaveLength(2);
    expect(result?.repos?.[0]).toEqual({ path: '.', label: 'frontend' });
    expect(result?.repos?.[1]).toEqual({ path: '../api', label: 'api' });
  });

  test('walks up to find .retro.toml in a parent directory', () => {
    tempDir.createFile(
      '.retro.toml',
      `[retrospective]
sprint_id = "parent-sprint"
`
    );
    const nested = tempDir.createDir('deep/nested/dir');

    const result = findRetroConfig(nested);
    expect(result).not.toBeNull();
    expect(result?.retrospective?.sprint_id).toBe('parent-sprint');
  });

  test('throws a user-readable error for malformed TOML', () => {
    tempDir.createFile('.retro.toml', 'this is = = not valid ]]]] toml');
    expect(() => findRetroConfig(tempDir.path)).toThrow(/Failed to parse/);
  });

  test('parses empty repos array gracefully (single-repo config-only mode)', () => {
    tempDir.createFile(
      '.retro.toml',
      `[retrospective]
sprint_id = "solo"
`
    );
    const result = findRetroConfig(tempDir.path);
    expect(result).not.toBeNull();
    expect(result?.repos).toBeUndefined();
  });

  test('defaults startDir to process.cwd() when no arg', () => {
    // Just verify no crash and returns null|object.
    const result = findRetroConfig();
    // We do not make assertions on the value since this depends on the
    // test runner's cwd; the worktree may itself have a .retro.toml added
    // by a future change.
    expect(result === null || typeof result === 'object').toBe(true);
  });

  test('path field from nested config is relative to file, consumer resolves', () => {
    // Documenting behavior: findRetroConfig does not resolve repo paths.
    // That is the consumer's responsibility.
    tempDir.createFile(
      '.retro.toml',
      `[[repos]]
path = "./sub"
label = "sub"
`
    );
    const result = findRetroConfig(tempDir.path);
    expect(result?.repos?.[0]?.path).toBe('./sub');
  });
});

// Verify the exported module path also resolves from the root file
describe('findRetroConfig import shape', () => {
  test('findRetroConfig is a named export', async () => {
    const mod = await import('../../src/config.js');
    expect(typeof mod.findRetroConfig).toBe('function');
  });
});

// Use join() to silence unused-import in some environments.
void join;

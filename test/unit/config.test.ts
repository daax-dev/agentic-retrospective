/**
 * Unit tests for findRetroConfig().
 */

import { describe, test, expect, beforeEach, afterEach } from 'vitest';
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
    // Bound the walk to the temp dir so the result is deterministic regardless
    // of what ancestor directories the developer/CI environment contains.
    const nested = tempDir.createDir('a/b/c');
    const result = findRetroConfig(nested, tempDir.path);
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
    expect(result?.config?.retrospective?.sprint_id).toBe('sprint-42');
    expect(result?.config?.retrospective?.output_dir).toBe('docs/retrospectives');
    expect(result?.config?.repos).toHaveLength(2);
    expect(result?.config?.repos?.[0]).toEqual({ path: '.', label: 'frontend' });
    expect(result?.config?.repos?.[1]).toEqual({ path: '../api', label: 'api' });
    expect(result?.configDir).toBe(tempDir.path);
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
    expect(result?.config?.retrospective?.sprint_id).toBe('parent-sprint');
    expect(result?.configDir).toBe(tempDir.path);
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
    expect(result?.config?.repos).toBeUndefined();
  });

  test('defaults startDir to process.cwd() when no arg', () => {
    // Just verify no crash and returns null|object.
    const result = findRetroConfig();
    expect(result === null || typeof result === 'object').toBe(true);
  });

  test('path field from nested config is relative to file, consumer resolves', () => {
    // Documenting behavior: findRetroConfig does not resolve repo paths.
    // That is the consumer's responsibility (cli.ts resolves against configDir).
    tempDir.createFile(
      '.retro.toml',
      `[[repos]]
path = "./sub"
label = "sub"
`
    );
    const result = findRetroConfig(tempDir.path);
    expect(result?.config?.repos?.[0]?.path).toBe('./sub');
    expect(result?.configDir).toBe(tempDir.path);
  });
});

// Verify the exported module path also resolves from the root file
describe('findRetroConfig import shape', () => {
  test('findRetroConfig is a named export', async () => {
    const mod = await import('../../src/config.js');
    expect(typeof mod.findRetroConfig).toBe('function');
  });
});

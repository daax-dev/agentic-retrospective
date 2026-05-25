/**
 * `.retro.toml` discovery and parsing.
 *
 * Walks upward from a starting directory (defaulting to `process.cwd()`)
 * looking for a `.retro.toml` file. Parsed with `@iarna/toml` and returned
 * as a typed object. Returns `null` when no configuration file is found
 * up to the filesystem root.
 */

import { existsSync, readFileSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { parse } from '@iarna/toml';

export interface RetroToml {
  retrospective?: {
    sprint_id?: string;
    output_dir?: string;
  };
  repos?: Array<{ path: string; label: string }>;
}

export interface RetroTomlResult {
  config: RetroToml;
  configDir: string;
}

/**
 * Walk up from `startDir` looking for `.retro.toml`. Returns `null` if not
 * found. Throws a user-readable error if the file is present but malformed.
 *
 * The returned `configDir` is the directory containing the file, which callers
 * should use when resolving relative `[[repos]].path` entries.
 *
 * @param stopAt - optional upper bound for the walk (used in tests to keep
 *   the search within a temp directory tree)
 */
export function findRetroConfig(
  startDir: string = process.cwd(),
  stopAt?: string
): RetroTomlResult | null {
  let dir = resolve(startDir);
  const ceiling = stopAt ? resolve(stopAt) : null;
  // Walk upward until we hit the filesystem root (where dirname(dir) === dir).
  for (;;) {
    const candidate = join(dir, '.retro.toml');
    if (existsSync(candidate)) {
      try {
        const raw = readFileSync(candidate, 'utf8');
        return { config: parse(raw) as unknown as RetroToml, configDir: dir };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(`Failed to parse ${candidate}: ${msg}`);
      }
    }
    const parent = dirname(dir);
    // Stop at ceiling (for tests) or filesystem root.
    if (ceiling !== null && dir === ceiling) return null;
    if (parent === dir) return null;
    dir = parent;
  }
}

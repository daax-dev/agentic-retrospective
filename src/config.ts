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
    from?: string;
    to?: string;
  };
  repos?: Array<{ path: string; label: string }>;
}

/**
 * Walk up from `startDir` looking for `.retro.toml`. Returns `null` if not
 * found. Throws a user-readable error if the file is present but malformed.
 */
export function findRetroConfig(startDir: string = process.cwd()): RetroToml | null {
  let dir = resolve(startDir);
  // Walk upward until we hit the filesystem root (where dirname(dir) === dir).
  for (;;) {
    const candidate = join(dir, '.retro.toml');
    if (existsSync(candidate)) {
      try {
        const raw = readFileSync(candidate, 'utf8');
        return parse(raw) as unknown as RetroToml;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(`Failed to parse ${candidate}: ${msg}`);
      }
    }
    const parent = dirname(dir);
    if (parent === dir) return null; // filesystem root
    dir = parent;
  }
}

/**
 * Multi-directory discovery of Claude session JSONL.
 *
 * Claude data may live under several roots depending on version/install
 * (inventory §1 note). A portable ingester searches all of them and honors
 * `CLAUDE_CONFIG_DIR` (comma-separated) as an override for the base config dir.
 */

import { existsSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

export interface DiscoveredSession {
  /** Session id (the JSONL file basename without extension). */
  sessionId: string;
  /** Absolute path to `<slug>/<session>.jsonl`. */
  filePath: string;
  /** Absolute path to the per-session sidecar dir `<slug>/<session>/` (may not exist). */
  sessionDir: string;
  /** Project directory slug the session lives under. */
  projectSlug: string;
  /** The discovery root the session was found under. */
  baseDir: string;
}

export interface DiscoveryOptions {
  /** Override the set of `projects`/`transcripts` roots to scan (used in tests). */
  baseDirs?: string[];
  /** Override `process.env` (used in tests). */
  env?: NodeJS.ProcessEnv;
  /** Override the home directory (used in tests). */
  home?: string;
}

/**
 * Resolve the ordered, de-duplicated list of directories to scan for session
 * JSONL files. Each returned dir is expected to contain `<slug>/<session>.jsonl`.
 */
export function resolveProjectDirs(options: DiscoveryOptions = {}): string[] {
  // Any DEFINED baseDirs is an explicit override — including `[]`, which means
  // "no roots" (e.g. test isolation), NOT "fall back to the user's ~/.claude".
  if (options.baseDirs !== undefined) {
    return dedupeExisting(options.baseDirs);
  }

  const env = options.env ?? process.env;
  const home = options.home ?? homedir();
  const candidates: string[] = [];

  // CLAUDE_CONFIG_DIR overrides the base Claude config/data dir (inventory §1).
  // When set, it REPLACES the home-based defaults — otherwise a custom profile
  // would be mixed with the user's normal ~/.claude data. Honor comma lists.
  const configDirs = (env.CLAUDE_CONFIG_DIR ?? '')
    .split(',')
    .map(d => d.trim())
    .filter(Boolean);
  if (configDirs.length > 0) {
    for (const dir of configDirs) {
      candidates.push(join(dir, 'projects'));
      candidates.push(join(dir, 'transcripts'));
    }
    return dedupeExisting(candidates);
  }

  // Default roots when no override is set (inventory §1).
  candidates.push(join(home, '.claude', 'projects'));
  candidates.push(join(home, '.config', 'claude', 'projects'));
  candidates.push(join(home, '.claude', 'transcripts'));

  return dedupeExisting(candidates);
}

/**
 * Discover sessions across the resolved roots.
 *
 * Only TOP-LEVEL `*.jsonl` files inside each `<root>/<slug>/` are treated as
 * sessions. Subagent transcripts live in `<slug>/<session>/subagents/` and are
 * resolved separately — discovering them recursively here would ingest them as
 * main sessions and double-count tokens.
 */
export function discoverSessions(options: DiscoveryOptions = {}): DiscoveredSession[] {
  const roots = resolveProjectDirs(options);
  const sessions: DiscoveredSession[] = [];

  for (const root of roots) {
    for (const slug of safeReadDir(root)) {
      const slugPath = join(root, slug);
      if (!isDir(slugPath)) continue;

      for (const entry of safeReadDir(slugPath)) {
        if (!entry.endsWith('.jsonl')) continue;
        const filePath = join(slugPath, entry);
        if (!isFile(filePath)) continue; // skip directories ending in .jsonl

        const sessionId = entry.slice(0, -'.jsonl'.length);
        sessions.push({
          sessionId,
          filePath,
          sessionDir: join(slugPath, sessionId),
          projectSlug: slug,
          baseDir: root,
        });
      }
    }
  }

  return sessions;
}

function dedupeExisting(dirs: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const dir of dirs) {
    if (seen.has(dir)) continue;
    seen.add(dir);
    if (existsSync(dir) && isDir(dir)) out.push(dir);
  }
  return out;
}

function safeReadDir(dir: string): string[] {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
}

function isDir(p: string): boolean {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function isFile(p: string): boolean {
  try {
    return statSync(p).isFile();
  } catch {
    return false;
  }
}

/**
 * Low-level file helpers for the Claude-native ingester.
 *
 * `streamLines` reads a transcript WITHOUT buffering the whole file, satisfying
 * the PRD's "never load whole files into memory unnecessarily" requirement while
 * staying synchronous to match the codebase's sync analyzers.
 */

import { closeSync, openSync, readSync } from 'fs';
import { StringDecoder } from 'string_decoder';

const CHUNK_BYTES = 64 * 1024;

/**
 * Yield a file line-by-line in fixed-size chunks. Only one chunk plus the
 * current partial line is held in memory at a time. A StringDecoder preserves
 * multi-byte UTF-8 sequences split across a chunk boundary. Fails soft: yields
 * nothing on any I/O error.
 */
export function* streamLines(filePath: string): Generator<string> {
  let fd: number;
  try {
    fd = openSync(filePath, 'r');
  } catch {
    return;
  }
  try {
    const decoder = new StringDecoder('utf8');
    const chunk = Buffer.alloc(CHUNK_BYTES);
    let pending = '';
    let bytesRead = 0;
    while ((bytesRead = readSync(fd, chunk, 0, chunk.length, null)) > 0) {
      pending += decoder.write(chunk.subarray(0, bytesRead));
      let nl: number;
      while ((nl = pending.indexOf('\n')) !== -1) {
        yield pending.slice(0, nl);
        pending = pending.slice(nl + 1);
      }
    }
    pending += decoder.end();
    let nl: number;
    while ((nl = pending.indexOf('\n')) !== -1) {
      yield pending.slice(0, nl);
      pending = pending.slice(nl + 1);
    }
    if (pending.length > 0) yield pending;
  } catch {
    // Truncated or unreadable mid-stream — stop yielding, fail soft.
  } finally {
    closeSync(fd);
  }
}

/** Parse an ISO-8601 timestamp to epoch milliseconds; null if absent/unparseable. */
export function parseInstant(ts: string | undefined): number | null {
  if (!ts) return null;
  const ms = Date.parse(ts);
  return Number.isNaN(ms) ? null : ms;
}

/**
 * True when `cwd` is `repoPath` itself or a descendant of it. Separator-agnostic
 * (handles Windows `\` and POSIX `/` regardless of the runtime platform) so a
 * `cwd` recorded on one OS still scopes correctly when analyzed on another.
 */
export function isWithinPath(cwd: string | undefined, repoPath: string): boolean {
  if (!cwd) return false;
  const norm = (p: string): string => p.replace(/\\/g, '/').replace(/\/+$/, '');
  const c = norm(cwd);
  const r = norm(repoPath);
  return c === r || c.startsWith(`${r}/`);
}

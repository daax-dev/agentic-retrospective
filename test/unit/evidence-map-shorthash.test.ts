/**
 * Unit tests for short-hash resolution in buildEvidenceMap (issue #18 / PR #22 review).
 *
 * A short commit prefix (7-12 chars) must only resolve when it is unique
 * across all collected commits. When two full hashes share the same prefix
 * the ref is ambiguous and must NOT resolve to an arbitrary commit — the
 * decision stays an honest orphan. Crafting a real SHA-1 prefix collision is
 * infeasible, so these tests drive buildEvidenceMap directly with synthetic
 * commit data via the (private) method.
 */

import { describe, test, expect } from 'vitest';
import { RetroRunner } from '../../src/runner.js';
import type { RetroConfig, EvidenceMap } from '../../src/types.js';

function makeRunner(): RetroRunner {
  const config: RetroConfig = {
    fromRef: '',
    toRef: 'HEAD',
    sprintId: 'shorthash-unit',
    decisionsPath: '.logs/decisions',
    agentLogsPath: '.logs/agents',
    outputDir: '/tmp/retro-shorthash-unit',
  };
  return new RetroRunner(config, { verbose: false });
}

function commit(hash: string) {
  return { hash, author: 'a', subject: 's', linesAdded: 1, linesRemoved: 0 };
}

function buildMap(
  runner: RetroRunner,
  commits: ReturnType<typeof commit>[],
  decisions: Array<Record<string, unknown>>
): EvidenceMap {
  // buildEvidenceMap is private; reach it through a typed cast for the test.
  const data = {
    git: { commits },
    decisions: { records: decisions },
  };
  return (runner as unknown as {
    buildEvidenceMap(d: unknown): EvidenceMap;
  }).buildEvidenceMap(data);
}

describe('buildEvidenceMap short-hash ambiguity', () => {
  // Full 40-char hex hashes. hashA and hashB share the first 7 chars
  // ("abcd123") but diverge at char 8, so "commit:abcd123" is ambiguous.
  // Hashes must be hex-only because the commit: ref regex is [0-9a-fA-F]+.
  const hashA = 'abcd123' + 'a'.repeat(33);
  const hashB = 'abcd123' + 'b'.repeat(33);
  // A hash whose 7-char prefix is unique to itself.
  const hashUnique = 'fedc987' + 'e'.repeat(33);
  const ambigPrefix = 'abcd123';
  const uniquePrefix = 'fedc987';

  test('ambiguous short prefix does NOT resolve (decision stays orphaned)', () => {
    const runner = makeRunner();
    const map = buildMap(
      runner,
      [commit(hashA), commit(hashB), commit(hashUnique)],
      [{ id: 'dec-ambig', ts: '2026-02-01T10:00:00Z', evidence_refs: [`commit:${ambigPrefix}`] }]
    );

    // The shared prefix must not link to either full hash.
    expect(map.decisions['dec-ambig'].commits).toHaveLength(0);
    expect(map.commits[hashA].decisions).not.toContain('dec-ambig');
    expect(map.commits[hashB].decisions).not.toContain('dec-ambig');
    expect(map.orphans.decisions_without_implementation).toContain('dec-ambig');
  });

  test('unique short prefix still resolves to its full hash', () => {
    const runner = makeRunner();
    const map = buildMap(
      runner,
      [commit(hashA), commit(hashB), commit(hashUnique)],
      [{ id: 'dec-unique', ts: '2026-02-01T10:00:00Z', evidence_refs: [`commit:${uniquePrefix}`] }]
    );

    expect(map.decisions['dec-unique'].commits).toContain(hashUnique);
    expect(map.commits[hashUnique].decisions).toContain('dec-unique');
    expect(map.orphans.decisions_without_implementation).not.toContain('dec-unique');
  });

  test('full hash still resolves even when a sibling shares its short prefix', () => {
    const runner = makeRunner();
    const map = buildMap(
      runner,
      [commit(hashA), commit(hashB)],
      [{ id: 'dec-full', ts: '2026-02-01T10:00:00Z', evidence_refs: [`commit:${hashA}`] }]
    );

    // Exact full hash is unambiguous and must resolve.
    expect(map.decisions['dec-full'].commits).toContain(hashA);
    expect(map.commits[hashA].decisions).toContain('dec-full');
  });

  test('uppercase short hash resolves case-insensitively', () => {
    const runner = makeRunner();
    const map = buildMap(
      runner,
      [commit(hashUnique)],
      [{ id: 'dec-upper', ts: '2026-02-01T10:00:00Z', evidence_refs: [`commit:${uniquePrefix.toUpperCase()}`] }]
    );

    expect(map.decisions['dec-upper'].commits).toContain(hashUnique);
    expect(map.commits[hashUnique].decisions).toContain('dec-upper');
  });
});

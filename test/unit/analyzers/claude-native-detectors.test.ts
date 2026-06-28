/**
 * Test harness for Claude-native waste & efficiency detectors (Issue #39).
 *
 * Validates PRD-04 acceptance criteria against ingested fixtures (raw session
 * JSONL → #36 ingester → buildDetectorInput → runDetectors), so the whole
 * boundary — including result-byte / error reconciliation — is exercised:
 *  - AC#1: every detector has a triggering AND a non-triggering fixture
 *    (true/false-positive control);
 *  - AC#2: every emitted finding carries an evidence ref that RESOLVES back to a
 *    real turn (`uuid`) or tool call (`toolUseId`) in the ingestion result;
 *  - AC#3: config is deterministic — disabling a detector removes exactly its
 *    findings, moving a threshold flips a fixture, and two runs are identical.
 *
 * Token-denominated: #37 (dollar cost) is not a prerequisite — findings quantify
 * waste in tokens from the `ClaudeUsage` ledger already on `main`.
 */

import { describe, test, expect } from 'vitest';
import { join } from 'path';
import {
  ClaudeNativeAnalyzer,
  buildDetectorInput,
  computeBaseline,
  modelTier,
  resolveConfig,
  runDetectors,
  sortFindings,
  DETECTOR_NAMES,
  defaultDetectorConfig,
  type ClaudeFinding,
  type DetectorConfig,
  type DetectorInput,
  type DetectorName,
} from '../../../src/analyzers/claude-native/index.js';
import { getFixturesDir } from '../../helpers/fixture-loader.js';

const DET = join(getFixturesDir(), 'claude-native', 'detectors');
const TREES = [
  'cohort',
  'errors',
  'giant',
  'model',
  'oneshot',
  'overuse',
  'reads',
  'skill',
  'thrash',
  'uniform',
] as const;

function ingest(...trees: string[]) {
  return new ClaudeNativeAnalyzer({
    baseDirs: trees.map(t => join(DET, t, 'projects')),
  }).analyze();
}

function inputFor(tree: string): DetectorInput {
  return buildDetectorInput(ingest(tree));
}

/** A config enabling only `name` (with overrides), every other detector off. */
function only(name: DetectorName, overrides: Record<string, unknown> = {}): DetectorConfig {
  const cfg = {} as Record<DetectorName, { enabled: boolean }>;
  for (const n of DETECTOR_NAMES) cfg[n] = { enabled: false };
  cfg[name] = { enabled: true, ...overrides };
  return cfg as DetectorConfig;
}

function sessionsOf(findings: ClaudeFinding[]): string[] {
  return [...new Set(findings.map(f => f.evidence.sessionId))].sort();
}

// ---------------------------------------------------------------------------
// AC#1 — each detector: triggering + non-triggering fixture
// ---------------------------------------------------------------------------

describe('AC#1 — triggering vs non-triggering control', () => {
  test('giant-tool-output: oversized result fires; small result does not', () => {
    const f = runDetectors(inputFor('giant'), only('giant-tool-output', { maxResultBytes: 100 }));
    expect(f.map(x => x.detector)).toEqual(['giant-tool-output']);
    expect(sessionsOf(f)).toEqual(['sess-giant']);
    expect(f[0].evidence.toolUseId).toBeTruthy();
    expect(f[0].estimatedWasteTokens).toBeGreaterThan(0);
    expect(f[0].dimension).toBe('Collaboration Efficiency');
  });

  test('repeated-file-reads: same file 3x fires; distinct files do not', () => {
    const f = runDetectors(inputFor('reads'), only('repeated-file-reads'));
    expect(sessionsOf(f)).toEqual(['sess-reads']);
    expect(f[0].detector).toBe('repeated-file-reads');
  });

  test('tool-overuse: dominant tool fires; balanced mix does not', () => {
    const f = runDetectors(
      inputFor('overuse'),
      only('tool-overuse', { minCalls: 4, dominanceRatio: 0.75 })
    );
    expect(sessionsOf(f)).toEqual(['sess-overuse']);
    expect(f[0].remediation).toContain('Bash');
  });

  test('thrash: ping-pong edits fire; repeated same-file edits do not', () => {
    const f = runDetectors(inputFor('thrash'), only('thrash'));
    expect(sessionsOf(f)).toEqual(['sess-thrash']);
    expect(f[0].detector).toBe('thrash');
  });

  test('error-storm: burst of errors fires; all-success does not', () => {
    const f = runDetectors(inputFor('errors'), only('error-storm'));
    expect(sessionsOf(f)).toEqual(['sess-errors']);
    expect(f[0].dimension).toBe('Quality & Maintainability');
  });

  test('retry-storm: repeated identical failures fire; distinct successes do not', () => {
    const f = runDetectors(inputFor('errors'), only('retry-storm'));
    expect(sessionsOf(f)).toEqual(['sess-errors']);
    expect(f[0].detector).toBe('retry-storm');
  });

  test('one-shot-failure: costly errored turn fires; costly success does not', () => {
    const f = runDetectors(
      inputFor('oneshot'),
      only('one-shot-failure', { minTurnTokens: 10000 })
    );
    expect(sessionsOf(f)).toEqual(['sess-oneshot']);
    expect(f[0].evidence.uuid).toBeTruthy();
    expect(f[0].estimatedWasteTokens).toBe(12000);
    expect(f[0].severity).toBe('high');
  });

  test('skill-over-firing: skill fired 3x fires; 2x does not', () => {
    const f = runDetectors(inputFor('skill'), only('skill-over-firing', { minFirings: 3 }));
    expect(sessionsOf(f)).toEqual(['sess-skill']);
    expect(f[0].remediation).toContain('codex:rescue');
  });

  test('model-substitution: heavy-on-haiku + trivial-on-opus fire; matched pairing does not', () => {
    const f = runDetectors(inputFor('model'), only('model-substitution'));
    expect(sessionsOf(f)).toEqual(['sess-model']);
    expect(f).toHaveLength(2);
    const severities = f.map(x => x.severity).sort();
    expect(severities).toEqual(['high', 'low']);
    expect(f.every(x => x.dimension === 'Delivery Predictability')).toBe(true);
  });

  test('cost-outlier: outlier session in cohort fires; uniform cohort does not', () => {
    const fired = runDetectors(inputFor('cohort'), only('cost-outlier'));
    expect(sessionsOf(fired)).toEqual(['sess-outlier']);
    expect(['medium', 'high']).toContain(fired[0].severity);
    expect(fired[0].estimatedWasteTokens).toBeGreaterThan(0);

    const clean = runDetectors(inputFor('uniform'), only('cost-outlier'));
    expect(clean).toEqual([]);
  });

  test('cost-outlier: cohort smaller than minCohort emits nothing', () => {
    // The `giant` tree has 2 sessions; default minCohort is 3.
    const f = runDetectors(inputFor('giant'), only('cost-outlier'));
    expect(f).toEqual([]);
  });

  test('cost-outlier: fires on a minimal 3-session cohort (leave-one-out baseline)', () => {
    // Regression: with an INCLUSIVE baseline a 1-in-3 outlier can never exceed
    // mean + 2σ (it inflates that very σ). Leave-one-out excludes the candidate,
    // so a genuine outlier in a small cohort is still caught at default thresholds.
    const mk = (id: string, tokens: number) => ({
      sessionId: id,
      turns: [{ uuid: `${id}-t`, tokens }],
      toolCalls: [],
      totalTokens: tokens,
    });
    const sessions = [mk('s1', 1000), mk('s2', 1000), mk('s3', 50000)];
    const input: DetectorInput = { sessions, cohortBaseline: computeBaseline(sessions) };
    const f = runDetectors(input, only('cost-outlier'));
    expect(sessionsOf(f)).toEqual(['s3']);
    expect(f[0].severity).toBe('high');
    expect(f[0].evidence.uuid).toBe('s3-t');
  });
});

// ---------------------------------------------------------------------------
// AC#2 — every finding's evidence resolves to a real record
// ---------------------------------------------------------------------------

describe('AC#2 — evidence is resolvable', () => {
  test('every finding cites a turn uuid or tool-use id present in the ingestion', () => {
    const result = ingest(...TREES);
    const input = buildDetectorInput(result);
    const findings = runDetectors(input, {
      'giant-tool-output': { enabled: true, maxResultBytes: 100 },
      'tool-overuse': { enabled: true, minCalls: 4, dominanceRatio: 0.75 },
      'one-shot-failure': { enabled: true, minTurnTokens: 10000 },
      'skill-over-firing': { enabled: true, minFirings: 3 },
    });
    expect(findings.length).toBeGreaterThan(0);

    const turnKeys = new Set(result.turns.map(t => `${t.sessionId}::${t.uuid}`));
    const callKeys = new Set(result.toolCalls.map(c => `${c.sessionId}::${c.toolUseId}`));
    for (const f of findings) {
      const e = f.evidence;
      const resolves =
        (!!e.uuid && turnKeys.has(`${e.sessionId}::${e.uuid}`)) ||
        (!!e.toolUseId && callKeys.has(`${e.sessionId}::${e.toolUseId}`));
      expect(resolves, `unresolvable evidence for ${f.detector}: ${JSON.stringify(e)}`).toBe(true);
    }
  });

  test('all initial detectors fire across the combined fixtures (full coverage)', () => {
    const input = buildDetectorInput(ingest(...TREES));
    const findings = runDetectors(input, {
      'giant-tool-output': { enabled: true, maxResultBytes: 100 },
      'tool-overuse': { enabled: true, minCalls: 4, dominanceRatio: 0.75 },
      'one-shot-failure': { enabled: true, minTurnTokens: 10000 },
      'skill-over-firing': { enabled: true, minFirings: 3 },
    });
    const detectors = new Set(findings.map(f => f.detector));
    for (const name of DETECTOR_NAMES) {
      expect(detectors.has(name), `detector ${name} produced no finding`).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// AC#3 — deterministic, config-driven output
// ---------------------------------------------------------------------------

describe('AC#3 — deterministic config-driven output', () => {
  const tunedAll: DetectorConfig = {
    'giant-tool-output': { maxResultBytes: 100 },
    'tool-overuse': { minCalls: 4, dominanceRatio: 0.75 },
    'one-shot-failure': { minTurnTokens: 10000 },
    'skill-over-firing': { minFirings: 3 },
  };

  test('two runs over the same input are byte-identical', () => {
    const input = buildDetectorInput(ingest(...TREES));
    const a = runDetectors(input, tunedAll);
    const b = runDetectors(input, tunedAll);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  test('disabling a detector removes exactly its findings and nothing else', () => {
    const input = buildDetectorInput(ingest(...TREES));
    const full = runDetectors(input, tunedAll);
    const withoutGiant = runDetectors(input, { ...tunedAll, 'giant-tool-output': { enabled: false } });

    expect(withoutGiant.some(f => f.detector === 'giant-tool-output')).toBe(false);
    expect(withoutGiant).toEqual(full.filter(f => f.detector !== 'giant-tool-output'));
  });

  test('raising a threshold flips a fixture from triggering to not', () => {
    const input = inputFor('giant');
    const fires = runDetectors(input, only('giant-tool-output', { maxResultBytes: 100 }));
    const silent = runDetectors(input, only('giant-tool-output', { maxResultBytes: 1_000_000 }));
    expect(fires).toHaveLength(1);
    expect(silent).toEqual([]);
  });

  test('default config is conservative: a clean cohort produces no findings', () => {
    expect(runDetectors(inputFor('uniform'))).toEqual([]);
  });

  test('tool-overuse with minCalls:0 over zero-tool-call sessions does not throw', () => {
    // `uniform` sessions have only text turns (no tool calls); minCalls:0 is a
    // valid threshold and must yield deterministic findings, never a crash.
    const input = inputFor('uniform');
    expect(() => runDetectors(input, only('tool-overuse', { minCalls: 0 }))).not.toThrow();
    expect(runDetectors(input, only('tool-overuse', { minCalls: 0 }))).toEqual([]);
  });

  test('resolveConfig rejects an invalid threshold at the boundary', () => {
    expect(() => resolveConfig({ 'giant-tool-output': { maxResultBytes: -1 } })).toThrow(RangeError);
    expect(() => resolveConfig({ thrash: { minRevisits: Number.NaN } })).toThrow(RangeError);
  });

  test('resolveConfig overrides do not mutate the shared defaults', () => {
    resolveConfig({ 'giant-tool-output': { maxResultBytes: 1 } });
    expect(defaultDetectorConfig['giant-tool-output'].maxResultBytes).toBe(50_000);
  });
});

// ---------------------------------------------------------------------------
// Unit-level helpers
// ---------------------------------------------------------------------------

describe('helpers', () => {
  test('modelTier maps known families and ignores unknown', () => {
    expect(modelTier('claude-opus-4')).toBe(3);
    expect(modelTier('claude-sonnet-4')).toBe(2);
    expect(modelTier('claude-haiku-4')).toBe(1);
    expect(modelTier('gpt-5')).toBeUndefined();
    expect(modelTier(undefined)).toBeUndefined();
  });

  test('computeBaseline returns population mean and stdev', () => {
    const base = computeBaseline([
      { sessionId: 's1', turns: [], toolCalls: [], totalTokens: 100 },
      { sessionId: 's2', turns: [], toolCalls: [], totalTokens: 300 },
    ]);
    expect(base.sessionCount).toBe(2);
    expect(base.meanTokens).toBe(200);
    expect(base.stdevTokens).toBe(100);
  });

  test('explicit baseline overrides the input-derived cohort baseline', () => {
    // A single-session input has stdev 0; an explicit large-cohort baseline lets
    // cost-outlier judge that lone session as an outlier.
    const input = inputFor('giant'); // 2 sessions, small spend
    const baseline = { sessionCount: 50, meanTokens: 10, stdevTokens: 1 };
    const f = runDetectors(input, only('cost-outlier'), baseline);
    expect(f.every(x => x.detector === 'cost-outlier')).toBe(true);
    expect(f.length).toBeGreaterThan(0);
    expect(f.every(x => x.severity === 'high')).toBe(true);
  });

  test('sortFindings yields a stable total order', () => {
    const unordered: ClaudeFinding[] = [
      { detector: 'b', severity: 'low', evidence: { sessionId: 's2' }, dimension: 'Collaboration Efficiency', remediation: '' },
      { detector: 'a', severity: 'low', evidence: { sessionId: 's1' }, dimension: 'Collaboration Efficiency', remediation: '' },
    ];
    const sorted = sortFindings(unordered);
    expect(sorted.map(f => f.evidence.sessionId)).toEqual(['s1', 's2']);
  });
});

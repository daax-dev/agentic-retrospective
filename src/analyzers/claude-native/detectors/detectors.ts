/**
 * The initial waste & efficiency detector set (Issue #39) and the registry that
 * runs them.
 *
 * Each detector is a small, pure function over aggregated per-session stats
 * (`DetectorInput`) plus an optional cohort baseline — `run(stats, baseline?)`,
 * exactly the interface in Issue #39. Detectors never do I/O; aggregation
 * happens upstream in `buildDetectorInput`. Every finding cites a resolvable
 * `sessionId` + `uuid`/`toolUseId` (AC#2). Output is sorted into a stable total
 * order so two runs over the same input are byte-identical (AC#3).
 */

import { type DetectorConfig, type FullDetectorConfig, resolveConfig } from './config.js';
import { modelTier } from './input.js';
import {
  type ClaudeFinding,
  type Detector,
  type DetectorInput,
  type CohortBaseline,
  type FindingSeverity,
  type SessionStats,
  type ToolCallStat,
} from './types.js';

/** bytes-per-token approximation for translating result bytes into wasted tokens. */
const BYTES_PER_TOKEN = 4;

const SEVERITY_RANK: Record<FindingSeverity, number> = { low: 0, medium: 1, high: 2 };

// ----------------------------------------------------------------------------
// Detector implementations. Each takes the resolved options for its own entry.
// ----------------------------------------------------------------------------

function giantToolOutput(
  input: DetectorInput,
  opts: FullDetectorConfig['giant-tool-output']
): ClaudeFinding[] {
  const out: ClaudeFinding[] = [];
  for (const session of input.sessions) {
    for (const call of session.toolCalls) {
      const bytes = call.resultBytes ?? 0;
      if (bytes <= opts.maxResultBytes) continue;
      out.push({
        detector: 'giant-tool-output',
        severity: byMultiple(bytes / opts.maxResultBytes, 2, 4),
        evidence: { sessionId: session.sessionId, toolUseId: call.toolUseId, uuid: call.turnUuid },
        estimatedWasteTokens: Math.round((bytes - opts.maxResultBytes) / BYTES_PER_TOKEN),
        dimension: 'Collaboration Efficiency',
        remediation: `Tool "${call.name}" returned ${bytes} bytes; cap the output or request a narrower result.`,
      });
    }
  }
  return out;
}

function repeatedFileReads(
  input: DetectorInput,
  opts: FullDetectorConfig['repeated-file-reads']
): ClaudeFinding[] {
  const out: ClaudeFinding[] = [];
  for (const session of input.sessions) {
    const byFile = new Map<string, ToolCallStat[]>();
    for (const call of session.toolCalls) {
      if (call.name !== 'Read' || !call.target) continue; // undefined targets are not collapsed
      const list = byFile.get(call.target);
      if (list) list.push(call);
      else byFile.set(call.target, [call]);
    }
    for (const [file, reads] of byFile) {
      if (reads.length < opts.minReads) continue;
      const redundantBytes = reads.slice(1).reduce((sum, r) => sum + (r.resultBytes ?? 0), 0);
      const last = reads[reads.length - 1];
      out.push({
        detector: 'repeated-file-reads',
        severity: reads.length >= opts.minReads * 2 ? 'medium' : 'low',
        evidence: { sessionId: session.sessionId, toolUseId: last.toolUseId, uuid: last.turnUuid },
        estimatedWasteTokens: Math.round(redundantBytes / BYTES_PER_TOKEN),
        dimension: 'Collaboration Efficiency',
        remediation: `File "${file}" read ${reads.length} times; read once and rely on cached context.`,
      });
    }
  }
  return out;
}

function toolOveruse(
  input: DetectorInput,
  opts: FullDetectorConfig['tool-overuse']
): ClaudeFinding[] {
  const out: ClaudeFinding[] = [];
  for (const session of input.sessions) {
    const total = session.toolCalls.length;
    // `total === 0` guard: with `minCalls: 0` (a valid config) an empty session
    // would otherwise reach the `counts` destructure below with no entries.
    if (total === 0 || total < opts.minCalls) continue;
    const counts = new Map<string, number>();
    const firstCall = new Map<string, ToolCallStat>();
    for (const call of session.toolCalls) {
      counts.set(call.name, (counts.get(call.name) ?? 0) + 1);
      if (!firstCall.has(call.name)) firstCall.set(call.name, call);
    }
    const [name, max] = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
    const ratio = max / total;
    if (ratio < opts.dominanceRatio) continue;
    const rep = firstCall.get(name)!;
    out.push({
      detector: 'tool-overuse',
      severity: ratio >= 0.95 ? 'medium' : 'low',
      evidence: { sessionId: session.sessionId, toolUseId: rep.toolUseId, uuid: rep.turnUuid },
      dimension: 'Collaboration Efficiency',
      remediation: `Tool "${name}" made ${max}/${total} calls; batch or restructure the workflow.`,
    });
  }
  return out;
}

function thrash(input: DetectorInput, opts: FullDetectorConfig['thrash']): ClaudeFinding[] {
  const out: ClaudeFinding[] = [];
  for (const session of input.sessions) {
    const edits = session.toolCalls.filter(
      c => (c.name === 'Edit' || c.name === 'Write') && c.target
    );
    const distinct = new Set(edits.map(c => c.target));
    if (distinct.size === 0 || distinct.size > opts.maxDistinctTargets) continue;
    const seen = new Set<string>();
    let prev: string | undefined;
    let revisits = 0;
    let lastRevisit: ToolCallStat | undefined;
    for (const call of edits) {
      if (call.target !== prev && seen.has(call.target!)) {
        revisits += 1;
        lastRevisit = call;
      }
      seen.add(call.target!);
      prev = call.target;
    }
    if (revisits < opts.minRevisits || !lastRevisit) continue;
    out.push({
      detector: 'thrash',
      severity: revisits >= opts.minRevisits * 2 ? 'medium' : 'low',
      evidence: {
        sessionId: session.sessionId,
        toolUseId: lastRevisit.toolUseId,
        uuid: lastRevisit.turnUuid,
      },
      dimension: 'Collaboration Efficiency',
      remediation: `Rapid alternation across ${distinct.size} file(s) (${revisits} revisits); plan the edits before making them.`,
    });
  }
  return out;
}

function errorStorm(
  input: DetectorInput,
  opts: FullDetectorConfig['error-storm']
): ClaudeFinding[] {
  const out: ClaudeFinding[] = [];
  const window = Math.max(1, Math.floor(opts.windowSize));
  for (const session of input.sessions) {
    const calls = session.toolCalls;
    if (calls.length === 0) continue;
    let bestErrors = 0;
    let bestLastError: ToolCallStat | undefined;
    const span = Math.min(window, calls.length);
    for (let start = 0; start + span <= calls.length; start++) {
      let errs = 0;
      let lastErr: ToolCallStat | undefined;
      for (let i = start; i < start + span; i++) {
        if (calls[i].isError) {
          errs += 1;
          lastErr = calls[i];
        }
      }
      if (errs > bestErrors) {
        bestErrors = errs;
        bestLastError = lastErr;
      }
    }
    if (bestErrors < opts.minErrors || !bestLastError) continue;
    out.push({
      detector: 'error-storm',
      severity: bestErrors >= span ? 'high' : 'medium',
      evidence: {
        sessionId: session.sessionId,
        toolUseId: bestLastError.toolUseId,
        uuid: bestLastError.turnUuid,
      },
      dimension: 'Quality & Maintainability',
      remediation: `${bestErrors} tool errors within ${span} calls; fix the root cause before retrying.`,
    });
  }
  return out;
}

function retryStorm(
  input: DetectorInput,
  opts: FullDetectorConfig['retry-storm']
): ClaudeFinding[] {
  const out: ClaudeFinding[] = [];
  for (const session of input.sessions) {
    const byCall = new Map<string, ToolCallStat[]>();
    for (const call of session.toolCalls) {
      if (!call.isError || !call.target) continue; // near-identical needs a concrete target
      const k = `${call.name}\u0000${call.target}`;
      const list = byCall.get(k);
      if (list) list.push(call);
      else byCall.set(k, [call]);
    }
    for (const [, fails] of byCall) {
      if (fails.length < opts.minRepeats) continue;
      const last = fails[fails.length - 1];
      out.push({
        detector: 'retry-storm',
        severity: fails.length >= opts.minRepeats * 2 ? 'high' : 'medium',
        evidence: { sessionId: session.sessionId, toolUseId: last.toolUseId, uuid: last.turnUuid },
        dimension: 'Quality & Maintainability',
        remediation: `"${last.name}" on the same target failed ${fails.length} times; add a stop condition or change approach.`,
      });
    }
  }
  return out;
}

function oneShotFailure(
  input: DetectorInput,
  opts: FullDetectorConfig['one-shot-failure']
): ClaudeFinding[] {
  const out: ClaudeFinding[] = [];
  for (const session of input.sessions) {
    const erroredTurns = new Set<string>();
    for (const call of session.toolCalls) if (call.isError) erroredTurns.add(call.turnUuid);
    for (const turn of session.turns) {
      if (turn.tokens < opts.minTurnTokens || !erroredTurns.has(turn.uuid)) continue;
      out.push({
        detector: 'one-shot-failure',
        severity: 'high',
        evidence: { sessionId: session.sessionId, uuid: turn.uuid },
        estimatedWasteTokens: turn.tokens,
        dimension: 'Quality & Maintainability',
        remediation: `High-cost turn (${turn.tokens} tokens) whose tool call errored; right-size the request and validate inputs first.`,
      });
    }
  }
  return out;
}

function skillOverFiring(
  input: DetectorInput,
  opts: FullDetectorConfig['skill-over-firing']
): ClaudeFinding[] {
  const out: ClaudeFinding[] = [];
  for (const session of input.sessions) {
    const bySkill = new Map<string, ToolCallStat[]>();
    for (const call of session.toolCalls) {
      if (call.name !== 'Skill') continue;
      const id = call.target ?? 'unknown';
      const list = bySkill.get(id);
      if (list) list.push(call);
      else bySkill.set(id, [call]);
    }
    for (const [id, firings] of bySkill) {
      if (firings.length < opts.minFirings) continue;
      const last = firings[firings.length - 1];
      out.push({
        detector: 'skill-over-firing',
        severity: firings.length >= opts.minFirings * 2 ? 'medium' : 'low',
        evidence: { sessionId: session.sessionId, toolUseId: last.toolUseId, uuid: last.turnUuid },
        dimension: 'Collaboration Efficiency',
        remediation: `Skill "${id}" fired ${firings.length} times; tighten its trigger (frequency is a proxy — value needs outcome correlation, PRD 05).`,
      });
    }
  }
  return out;
}

function modelSubstitution(
  input: DetectorInput,
  opts: FullDetectorConfig['model-substitution']
): ClaudeFinding[] {
  const out: ClaudeFinding[] = [];
  for (const session of input.sessions) {
    for (const turn of session.turns) {
      const tier = modelTier(turn.model);
      if (tier === undefined) continue; // unknown model — never guess
      if (turn.tokens >= opts.heavyTokens && tier <= 1) {
        out.push({
          detector: 'model-substitution',
          severity: 'high',
          evidence: { sessionId: session.sessionId, uuid: turn.uuid },
          dimension: 'Delivery Predictability',
          remediation: `Heavy turn (${turn.tokens} tokens) ran on under-powered model "${turn.model}"; match model to task complexity.`,
        });
      } else if (turn.tokens <= opts.lightTokens && tier >= 3) {
        out.push({
          detector: 'model-substitution',
          severity: 'low',
          evidence: { sessionId: session.sessionId, uuid: turn.uuid },
          estimatedWasteTokens: turn.tokens,
          dimension: 'Delivery Predictability',
          remediation: `Trivial turn (${turn.tokens} tokens) ran on over-powered model "${turn.model}"; downshift to reduce spend.`,
        });
      }
    }
  }
  return out;
}

function costOutlier(
  input: DetectorInput,
  opts: FullDetectorConfig['cost-outlier'],
  baseline?: CohortBaseline
): ClaudeFinding[] {
  // Cohort size is the EXPLICIT baseline's when one is provided (it represents an
  // external org/project cohort the candidates are judged against); otherwise the
  // candidates themselves form the cohort (leave-one-out). Guarding on the wrong
  // one would ignore a valid large baseline just because few sessions are analyzed.
  const cohortSize = baseline ? baseline.sessionCount : input.sessions.length;
  if (cohortSize < opts.minCohort) return []; // too small a cohort to judge
  const totals = input.sessions.map(s => s.totalTokens);
  const sum = totals.reduce((a, b) => a + b, 0);
  const sumSq = totals.reduce((a, b) => a + b * b, 0);

  const out: ClaudeFinding[] = [];
  for (let i = 0; i < input.sessions.length; i++) {
    const session = input.sessions[i];
    if (session.totalTokens <= 0) continue;
    // Baseline for judging THIS session. An explicit baseline (e.g. a project- or
    // org-wide cohort) does not contain the candidate, so use it as-is. Otherwise
    // derive a LEAVE-ONE-OUT baseline from the cohort: excluding the candidate
    // from the mean/stdev avoids the self-inclusion artifact that otherwise caps a
    // lone outlier's z-score below `stdevMultiplier` for small cohorts (a 1-in-3
    // outlier could never exceed mean + 2σ when it inflates that very σ).
    const ref = baseline ?? leaveOneOut(totals, sum, sumSq, i);
    const threshold = Math.max(
      ref.meanTokens + opts.stdevMultiplier * ref.stdevTokens,
      ref.meanTokens * opts.minMultipleOfMean
    );
    const highThreshold = ref.meanTokens + (opts.stdevMultiplier + 1) * ref.stdevTokens;
    if (session.totalTokens <= threshold) continue;
    const evidence = outlierEvidence(session);
    if (!evidence) continue; // no resolvable record to cite — never emit a vague finding
    out.push({
      detector: 'cost-outlier',
      severity: session.totalTokens > highThreshold ? 'high' : 'medium',
      evidence,
      estimatedWasteTokens: Math.round(session.totalTokens - ref.meanTokens),
      dimension: 'Delivery Predictability',
      remediation: `Session spend ${session.totalTokens} tokens is far above the cohort mean ${Math.round(ref.meanTokens)}; investigate the outlier turn(s).`,
    });
  }
  return out;
}

/** Mean/stdev of all session totals EXCEPT index `i` (leave-one-out baseline). */
function leaveOneOut(totals: number[], sum: number, sumSq: number, i: number): CohortBaseline {
  const n = totals.length - 1;
  if (n <= 0) return { sessionCount: 0, meanTokens: 0, stdevTokens: 0 };
  const s = sum - totals[i];
  const sq = sumSq - totals[i] * totals[i];
  const mean = s / n;
  const variance = Math.max(0, sq / n - mean * mean); // clamp float drift to >= 0
  return { sessionCount: n, meanTokens: mean, stdevTokens: Math.sqrt(variance) };
}

/** Cite the heaviest turn (or a tool call) so a cost-outlier finding is resolvable. */
function outlierEvidence(session: SessionStats): ClaudeFinding['evidence'] | undefined {
  let heaviest = session.turns[0];
  for (const turn of session.turns) if (turn.tokens > (heaviest?.tokens ?? -1)) heaviest = turn;
  if (heaviest) return { sessionId: session.sessionId, uuid: heaviest.uuid };
  if (session.toolCalls.length > 0) {
    return { sessionId: session.sessionId, toolUseId: session.toolCalls[0].toolUseId };
  }
  return undefined;
}

// ----------------------------------------------------------------------------
// Registry
// ----------------------------------------------------------------------------

/**
 * Build the enabled detectors with their thresholds bound. Disabled detectors
 * are omitted entirely, so a disabled detector emits nothing (AC#3).
 */
export function createDetectors(config?: DetectorConfig): Detector[] {
  const cfg = resolveConfig(config);
  const all: Detector[] = [
    detector('giant-tool-output', 'Collaboration Efficiency', i =>
      giantToolOutput(i, cfg['giant-tool-output'])
    ),
    detector('repeated-file-reads', 'Collaboration Efficiency', i =>
      repeatedFileReads(i, cfg['repeated-file-reads'])
    ),
    detector('tool-overuse', 'Collaboration Efficiency', i => toolOveruse(i, cfg['tool-overuse'])),
    detector('thrash', 'Collaboration Efficiency', i => thrash(i, cfg.thrash)),
    detector('error-storm', 'Quality & Maintainability', i => errorStorm(i, cfg['error-storm'])),
    detector('retry-storm', 'Quality & Maintainability', i => retryStorm(i, cfg['retry-storm'])),
    detector('one-shot-failure', 'Quality & Maintainability', i =>
      oneShotFailure(i, cfg['one-shot-failure'])
    ),
    detector('skill-over-firing', 'Collaboration Efficiency', i =>
      skillOverFiring(i, cfg['skill-over-firing'])
    ),
    detector('model-substitution', 'Delivery Predictability', i =>
      modelSubstitution(i, cfg['model-substitution'])
    ),
    detector('cost-outlier', 'Delivery Predictability', (i, b) =>
      costOutlier(i, cfg['cost-outlier'], b)
    ),
  ];
  return all.filter(d => cfg[d.name].enabled);
}

/** Helper to assemble a `Detector` object that satisfies `run(stats, baseline?)`. */
function detector(
  name: Detector['name'],
  dimension: Detector['dimension'],
  run: (stats: DetectorInput, baseline?: CohortBaseline) => ClaudeFinding[]
): Detector {
  return { name, dimension, run };
}

/**
 * Run every enabled detector and return findings in a stable total order.
 * `baseline` overrides the cohort baseline derived from the input (e.g. a
 * project- or org-wide baseline). Deterministic: same input + config => identical
 * output (AC#3).
 */
export function runDetectors(
  input: DetectorInput,
  config?: DetectorConfig,
  baseline?: CohortBaseline
): ClaudeFinding[] {
  const detectors = createDetectors(config);
  const findings: ClaudeFinding[] = [];
  for (const d of detectors) findings.push(...d.run(input, baseline));
  return sortFindings(findings);
}

/** Total order: session, detector, evidence ref, then severity (desc). Stable. */
export function sortFindings(findings: ClaudeFinding[]): ClaudeFinding[] {
  return [...findings].sort(
    (a, b) =>
      a.evidence.sessionId.localeCompare(b.evidence.sessionId) ||
      a.detector.localeCompare(b.detector) ||
      (a.evidence.toolUseId ?? '').localeCompare(b.evidence.toolUseId ?? '') ||
      (a.evidence.uuid ?? '').localeCompare(b.evidence.uuid ?? '') ||
      SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]
  );
}

/** Severity from how far a ratio exceeds the medium/high multiples of threshold. */
function byMultiple(ratio: number, mediumAt: number, highAt: number): FindingSeverity {
  if (ratio >= highAt) return 'high';
  if (ratio >= mediumAt) return 'medium';
  return 'low';
}

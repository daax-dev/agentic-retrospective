/**
 * Detector configuration — conservative, documented-as-uncalibrated defaults.
 *
 * Every threshold is tunable. Defaults are intentionally conservative to keep
 * false positives low on small samples; they are NOT calibrated on a real
 * cohort and SHOULD be tuned before findings are treated as authoritative
 * (PRD 04 §Risks). Disabling a detector or changing a threshold changes output
 * deterministically (AC#3).
 */

import { DETECTOR_NAMES, type DetectorName } from './types.js';

/** Fully-resolved per-detector options (every field present). */
export interface FullDetectorConfig {
  'giant-tool-output': { enabled: boolean; maxResultBytes: number };
  'repeated-file-reads': { enabled: boolean; minReads: number };
  'tool-overuse': { enabled: boolean; minCalls: number; dominanceRatio: number };
  thrash: { enabled: boolean; maxDistinctTargets: number; minRevisits: number };
  'error-storm': { enabled: boolean; windowSize: number; minErrors: number };
  'retry-storm': { enabled: boolean; minRepeats: number };
  'one-shot-failure': { enabled: boolean; minTurnTokens: number };
  'skill-over-firing': { enabled: boolean; minFirings: number };
  'model-substitution': { enabled: boolean; heavyTokens: number; lightTokens: number };
  'cost-outlier': {
    enabled: boolean;
    stdevMultiplier: number;
    minMultipleOfMean: number;
    minCohort: number;
  };
}

/** User-supplied overrides: any subset of detectors, any subset of their fields. */
export type DetectorConfig = {
  [K in keyof FullDetectorConfig]?: Partial<FullDetectorConfig[K]>;
};

/** Conservative defaults. See module doc — uncalibrated, tune before trusting. */
export const defaultDetectorConfig: FullDetectorConfig = {
  'giant-tool-output': { enabled: true, maxResultBytes: 50_000 },
  'repeated-file-reads': { enabled: true, minReads: 3 },
  'tool-overuse': { enabled: true, minCalls: 20, dominanceRatio: 0.8 },
  thrash: { enabled: true, maxDistinctTargets: 3, minRevisits: 3 },
  'error-storm': { enabled: true, windowSize: 5, minErrors: 3 },
  'retry-storm': { enabled: true, minRepeats: 3 },
  'one-shot-failure': { enabled: true, minTurnTokens: 10_000 },
  'skill-over-firing': { enabled: true, minFirings: 5 },
  'model-substitution': { enabled: true, heavyTokens: 20_000, lightTokens: 500 },
  'cost-outlier': { enabled: true, stdevMultiplier: 2, minMultipleOfMean: 2, minCohort: 3 },
};

/**
 * Merge user overrides onto the defaults and validate at this boundary. Throws
 * `RangeError` on a non-finite or negative threshold rather than silently
 * producing nonsense findings.
 */
export function resolveConfig(user?: DetectorConfig): FullDetectorConfig {
  const resolved = structuredCloneConfig(defaultDetectorConfig);
  if (user) {
    for (const name of DETECTOR_NAMES) {
      const override = user[name];
      if (!override) continue;
      Object.assign(resolved[name], override);
    }
  }
  validateConfig(resolved);
  return resolved;
}

function validateConfig(cfg: FullDetectorConfig): void {
  for (const name of DETECTOR_NAMES) {
    const entry = cfg[name] as Record<string, unknown>;
    for (const [field, value] of Object.entries(entry)) {
      if (field === 'enabled') {
        if (typeof value !== 'boolean') {
          throw new RangeError(`Detector ${name}.enabled must be a boolean`);
        }
        continue;
      }
      if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
        throw new RangeError(`Detector ${name}.${field} must be a finite, non-negative number`);
      }
    }
  }
}

/** Deep clone of the default config so overrides never mutate the shared default. */
function structuredCloneConfig(cfg: FullDetectorConfig): FullDetectorConfig {
  const out = {} as FullDetectorConfig;
  for (const name of DETECTOR_NAMES) {
    (out as Record<DetectorName, unknown>)[name] = { ...cfg[name] };
  }
  return out;
}

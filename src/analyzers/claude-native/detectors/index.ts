/**
 * Waste & efficiency detection (Tier 3 — Epic #44, Issue #39).
 *
 * Public surface: the finding/detector types, the conservative default config,
 * the aggregation boundary (`buildDetectorInput`), and the registry runner
 * (`runDetectors`). Detectors are pure `run(stats, baseline?) => Finding[]`
 * functions; all I/O happens upstream in the ingester (#36).
 */

export {
  type ClaudeFinding,
  type Detector,
  type DetectorInput,
  type DetectorName,
  type CohortBaseline,
  type FindingDimension,
  type FindingEvidence,
  type FindingSeverity,
  type SessionStats,
  type ToolCallStat,
  type TurnStat,
  DETECTOR_NAMES,
} from './types.js';
export {
  type DetectorConfig,
  type FullDetectorConfig,
  defaultDetectorConfig,
  resolveConfig,
} from './config.js';
export {
  MODEL_TIER,
  attributableTokens,
  buildDetectorInput,
  computeBaseline,
  modelTier,
} from './input.js';
export { createDetectors, runDetectors, sortFindings } from './detectors.js';

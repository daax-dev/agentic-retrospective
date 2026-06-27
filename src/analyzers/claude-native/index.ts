/**
 * Claude-native telemetry ingestion (Tier 1 foundation — Epic #44, Issue #36).
 *
 * Public surface for the read-only session ingester and its normalized data
 * contract. Downstream tiers (token accounting, attribution, detectors) consume
 * the shapes re-exported here.
 */

export * from './contract.js';
export {
  type DiscoveredSession,
  type DiscoveryOptions,
  discoverSessions,
  resolveProjectDirs,
} from './discovery.js';
export {
  ClaudeNativeAnalyzer,
  type ClaudeNativeOptions,
  type ScopeFilter,
} from './ingester.js';

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
export {
  type AttributedToolCall,
  type AttributionResult,
  type IdentitySpend,
  type PromptChain,
  type SourceCategory,
  type SourceSpend,
  type ToolCategory,
  type ToolClassification,
  type UnlinkedSubagentSpend,
  CATEGORY_PRIORITY,
  attributeSpend,
  classifyTool,
  parseMcpName,
  totalAttributedTokens,
} from './attribution.js';
export {
  type CostBucket,
  type KeyedCost,
  type LedgerUsage,
  type ModelCost,
  type TokenCostResult,
  type TurnLedger,
  accountTokenCost,
} from './accounting.js';
export {
  type ModelPricing,
  CACHE_READ_MULTIPLIER,
  CACHE_WRITE_MULTIPLIER,
  PRICES_AS_OF,
  PRICING_TABLE,
  getPricing,
  resolveModelKey,
} from './pricing.js';

/**
 * Test harness for Claude-native token & cost accounting (Issue #37).
 *
 * Validates PRD-02 acceptance criteria against a hand-computed fixture
 * (`fixtures/claude-native/accounting`):
 *  - AC#1: billable tokens (input + cache-creation) for the fixture match a
 *    hand-computed value, and per-class cost (input/cache-write/cache-read/output)
 *    is priced from the offline table — never the local `costUSD`.
 *  - AC#2: cache-read is reported on its own ledger field and excluded from
 *    billable input (it is whole-session overhead, billed ~0.1×).
 *  - AC#3: a turn on an unknown model counts tokens and is flagged "cost unknown"
 *    (cost `null`, never 0), and its raw id is recorded in `unknownModels`.
 *  - AC#4: sprint-window totals equal the sum of the in-window, de-duplicated
 *    turns the ingester emits — proven both via the reconciliation invariant
 *    (sum(byModel) === totals === ingestion.totals, field-exact) and via a scoped
 *    ingestion that windows out an earlier day.
 *  - the offline pricing table: model registry / alias + snapshot resolution and
 *    derived cache multipliers.
 */

import { describe, test, expect } from 'vitest';
import { join } from 'path';
import {
  ClaudeNativeAnalyzer,
  accountTokenCost,
  getPricing,
  resolveModelKey,
  emptyUsage,
  CACHE_READ_MULTIPLIER,
  CACHE_WRITE_MULTIPLIER,
  PRICES_AS_OF,
  type ClaudeIngestionResult,
  type ClaudeTurn,
  type TokenCostResult,
} from '../../../src/analyzers/claude-native/index.js';
import { getFixturesDir } from '../../helpers/fixture-loader.js';

const COST_PROJECTS = join(getFixturesDir(), 'claude-native', 'accounting', 'projects');

function ingest(scope?: { fromTimestamp?: string; toTimestamp?: string }): ClaudeIngestionResult {
  return new ClaudeNativeAnalyzer({ baseDirs: [COST_PROJECTS], scope }).analyze();
}

function account(scope?: { fromTimestamp?: string; toTimestamp?: string }): {
  result: TokenCostResult;
  ingestion: ClaudeIngestionResult;
} {
  const ingestion = ingest(scope);
  return { result: accountTokenCost(ingestion), ingestion };
}

// Hand-computed costs (USD), prices per MTok from the offline table:
//   opus-4-8:   100*5 + 200*6.25 + 50*0.5 + 10*25  = 2025  /1e6 = 0.002025
//   sonnet-4-6: 1000*3 + 500*15                    = 10500 /1e6 = 0.0105
const OPUS_COST = 0.002025;
const SONNET_COST = 0.0105;

describe('pricing — offline table, registry, and aliases', () => {
  test('exposes a versioned "prices as of" date', () => {
    expect(PRICES_AS_OF).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test('cache prices derive from the base input price by fixed multipliers', () => {
    const opus = getPricing('claude-opus-4-8')!;
    expect(opus.inputPerMTok).toBe(5);
    expect(opus.outputPerMTok).toBe(25);
    expect(opus.cacheWritePerMTok).toBe(5 * CACHE_WRITE_MULTIPLIER); // 6.25 (5-minute TTL)
    expect(opus.cacheReadPerMTok).toBe(5 * CACHE_READ_MULTIPLIER); // 0.5
  });

  test('resolveModelKey normalizes snapshots, provider prefixes, speed suffix, aliases', () => {
    expect(resolveModelKey('claude-opus-4-8-20260114')).toBe('claude-opus-4-8');
    expect(resolveModelKey('claude-sonnet-4-6@20251101')).toBe('claude-sonnet-4-6');
    expect(resolveModelKey('anthropic.claude-sonnet-4-6')).toBe('claude-sonnet-4-6');
    expect(resolveModelKey('us.anthropic.claude-haiku-4-5')).toBe('claude-haiku-4-5');
    expect(resolveModelKey('claude-opus-4-8-fast')).toBe('claude-opus-4-8');
    // Snapshot + speed suffix together, in either order.
    expect(resolveModelKey('claude-opus-4-8-20260114-fast')).toBe('claude-opus-4-8');
    expect(resolveModelKey('claude-mythos-preview')).toBe('claude-mythos-5');
  });

  test('a dated snapshot + -fast still resolves to a priced model', () => {
    expect(getPricing('claude-opus-4-8-20260114-fast')?.key).toBe('claude-opus-4-8');
  });

  test('missing price resolves to undefined — never a silent default', () => {
    expect(getPricing('claude-mystery-9')).toBeUndefined();
    expect(getPricing(undefined)).toBeUndefined();
    expect(getPricing('   ')).toBeUndefined();
  });
});

describe('accountTokenCost — ledger and cost', () => {
  test('AC#1: billable tokens match the hand-computed value (dedup applied)', () => {
    const { result } = account();
    // a1/a1b share message.id msg_a1 → deduped to one opus turn.
    expect(result.perTurn).toHaveLength(3);
    // billable input = input + cache-creation = (100+200) + 1000 + 30 = 1330.
    expect(result.totals.usage.billableInputTokens).toBe(1330);
    expect(result.totals.usage.inputTokens).toBe(1130);
    expect(result.totals.usage.outputTokens).toBe(515);
    expect(result.totals.turns).toBe(3);
    expect(result.totals.usage.serverWebSearch).toBe(1);
  });

  test('AC#1: cost is priced per token class from the offline table, not local costUSD', () => {
    const { result } = account();
    const opus = result.byModel.find(m => m.model === 'claude-opus-4-8')!;
    const sonnet = result.byModel.find(m => m.model === 'claude-sonnet-4-6')!;
    expect(opus.costUSD).toBeCloseTo(OPUS_COST, 9);
    expect(sonnet.costUSD).toBeCloseTo(SONNET_COST, 9);
    // a2's dated-snapshot id `claude-sonnet-4-6-20251114` resolved to the canonical key.
    expect(sonnet.priced).toBe(true);
  });

  test('AC#2: cache-read is on its own field and excluded from billable input', () => {
    const { result } = account();
    expect(result.totals.usage.cacheReadTokens).toBe(50);
    expect(result.totals.usage.cacheCreationTokens).toBe(200);
    // billable input does NOT include the 50 cache-read tokens.
    expect(result.totals.usage.billableInputTokens).toBe(
      result.totals.usage.inputTokens + result.totals.usage.cacheCreationTokens
    );
  });

  test('AC#3: unknown-model turn counts tokens and is flagged cost-unknown, never 0', () => {
    const { result } = account();
    const mystery = result.byModel.find(m => m.model === 'claude-mystery-9')!;
    expect(mystery.priced).toBe(false);
    expect(mystery.costKnown).toBe(false);
    expect(mystery.costUSD).toBeNull(); // unknown cost is null, NEVER a 0 that reads as free
    expect(mystery.knownCostUSD).toBe(0); // no priced turns contributed
    expect(mystery.usage.inputTokens).toBe(30); // tokens still counted
    expect(mystery.unpricedTokens).toBe(35); // 30 input + 0 cache-creation + 0 cache-read + 5 output

    const turn = result.perTurn.find(t => t.model === 'claude-mystery-9')!;
    expect(turn.costUSD).toBeNull();
    expect(turn.modelKey).toBeUndefined();

    expect(result.unknownModels).toEqual(['claude-mystery-9']);
    expect(result.totals.costKnown).toBe(false);
    expect(result.totals.costUSD).toBeNull(); // any unpriced turn => total cost not fully known
    expect(result.warnings.some(w => w.includes('claude-mystery-9'))).toBe(true);
  });

  test('known-cost portion is retained even when the total cost is unknown', () => {
    const { result } = account();
    // Total is null (unpriced turn present) but the priced portion is reported.
    expect(result.totals.costUSD).toBeNull();
    expect(result.totals.knownCostUSD).toBeCloseTo(OPUS_COST + SONNET_COST, 9);
  });

  test('AC#3: a blank/missing model is recorded as unknown, not silently dropped', () => {
    const usage = { ...emptyUsage(), inputTokens: 10, outputTokens: 2 };
    const turn: ClaudeTurn = {
      sessionId: 'sBlank',
      uuid: 'b1',
      parentUuid: null,
      kind: 'message',
      role: 'assistant',
      isSidechain: false,
      usage,
    };
    // accountTokenCost reads only `result.turns`; a minimal shape is sufficient.
    const result = accountTokenCost({ turns: [turn] } as unknown as ClaudeIngestionResult);
    expect(result.unknownModels).toContain('(unknown-model)');
    expect(result.totals.costKnown).toBe(false);
    expect(result.totals.usage.inputTokens).toBe(10);
    expect(result.byModel[0].priced).toBe(false);
    expect(result.byModel[0].costUSD).toBeNull();
  });
});

describe('accountTokenCost — reconciliation invariant (AC#4)', () => {
  test('sum(byModel) === totals === ingestion.totals, field-exact', () => {
    const { result, ingestion } = account();
    const fields = ['inputTokens', 'cacheCreationTokens', 'cacheReadTokens', 'outputTokens'] as const;
    for (const f of fields) {
      const summed = result.byModel.reduce((n, m) => n + m.usage[f], 0);
      expect(summed).toBe(result.totals.usage[f]);
      // The accounting layer reconciles to the ingester's grand totals exactly —
      // no double-count of subagent usage, no dropped turns.
      expect(result.totals.usage[f]).toBe(ingestion.totals[f]);
    }
  });

  test('by-day / by-session / by-project each reconcile to the grand totals', () => {
    const { result } = account();
    const sumInput = (rows: { usage: { inputTokens: number } }[]) =>
      rows.reduce((n, r) => n + r.usage.inputTokens, 0);
    expect(sumInput(result.byDay)).toBe(result.totals.usage.inputTokens);
    expect(sumInput(result.bySession)).toBe(result.totals.usage.inputTokens);
    expect(sumInput(result.byProject)).toBe(result.totals.usage.inputTokens);

    // Two distinct UTC days; the earlier day is fully priced, the later mixes
    // a priced and an unpriced turn.
    const may1 = result.byDay.find(d => d.key === '2026-05-01')!;
    const may2 = result.byDay.find(d => d.key === '2026-05-02')!;
    expect(may1.costKnown).toBe(true);
    expect(may1.costUSD).toBeCloseTo(OPUS_COST, 9);
    // 2026-05-02 mixes a priced (sonnet) and an unpriced turn: total cost is
    // null, but the priced portion is retained in knownCostUSD.
    expect(may2.costKnown).toBe(false);
    expect(may2.costUSD).toBeNull();
    expect(may2.knownCostUSD).toBeCloseTo(SONNET_COST, 9);
  });

  test('sprint-window totals equal the sum of in-window deduped turns', () => {
    // Scope to the second day: the ingester trims the 2026-05-01 turn out, so the
    // accounting window must reflect only a2 (sonnet, 1000/500) and a3 (unknown, 30/5).
    const { result, ingestion } = account({ fromTimestamp: '2026-05-02T00:00:00Z' });
    expect(result.totals.usage.inputTokens).toBe(1030); // 1000 + 30
    expect(result.totals.usage.outputTokens).toBe(505); // 500 + 5
    expect(result.totals.usage.cacheCreationTokens).toBe(0);
    expect(result.totals.usage.cacheReadTokens).toBe(0);
    expect(result.totals.costKnown).toBe(false); // a3 is unpriced
    expect(result.totals.costUSD).toBeNull();
    expect(result.totals.knownCostUSD).toBeCloseTo(SONNET_COST, 9);

    // And the windowed accounting totals match the ingester's windowed totals.
    expect(result.totals.usage.inputTokens).toBe(ingestion.totals.inputTokens);
    expect(result.totals.usage.outputTokens).toBe(ingestion.totals.outputTokens);
  });
});

describe('accountTokenCost — empty input', () => {
  test('an empty ingestion yields zeroed, no-throw accounting', () => {
    const ingestion = new ClaudeNativeAnalyzer({ baseDirs: [] }).analyze();
    const result = accountTokenCost(ingestion);
    expect(result.totals.usage.inputTokens).toBe(0);
    expect(result.totals.costUSD).toBe(0);
    expect(result.totals.costKnown).toBe(true);
    expect(result.byModel).toHaveLength(0);
    expect(result.perTurn).toHaveLength(0);
    expect(result.unknownModels).toHaveLength(0);
    expect(result.pricesAsOf).toBe(PRICES_AS_OF);
  });
});

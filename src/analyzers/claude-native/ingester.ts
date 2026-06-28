/**
 * Claude-native session ingester (Tier 1 foundation — Epic #44, Issue #36).
 *
 * Read-only. Parses Claude session JSONL under the discovered roots into the
 * normalized data contract (`contract.ts`, spec §3) and exposes it to downstream
 * analyzers. No scoring change — this produces the dataset everything consumes.
 *
 * Behaviour (PRD 01):
 *  1. Multi-dir discovery, honoring CLAUDE_CONFIG_DIR.
 *  2. Defensive streaming line-by-line parse; skip malformed; tolerate unknowns.
 *  3. Normalize turns + tool calls/results; extract tool targets.
 *  4. Resolve subagents via subagents/agent-<id>.{jsonl,meta.json}.
 *  5. Resolve externalized tool results via tool-results/<id>.txt.
 *  6. Deduplicate streaming records by message.id (keep last); recompute totals.
 *  7. Scope to the sprint window (--from/--to/--repo, pre-resolved to dates/path).
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import {
  type ClaudeIngestionResult,
  type ClaudeSessionSummary,
  type ClaudeSubagent,
  type ClaudeToolCall,
  type ClaudeTurn,
  type IngestionStats,
  addUsage,
  cloneUsage,
  emptyUsage,
  FIXTURE_SCHEMA_VERSION,
} from './contract.js';
import { isWithinPath, parseInstant, streamLines } from './io.js';
import {
  type DiscoveredSession,
  type DiscoveryOptions,
  discoverSessions,
} from './discovery.js';
import {
  type NormalizedRecord,
  type ToolResultRef,
  dedupeRecords,
  normalizeRecord,
  parseLine,
} from './parse.js';

/**
 * Sprint-window scope. Refs (`--from`/`--to`) are git refs at the CLI surface;
 * resolving them to timestamps is the caller's job (PR-2). This contract accepts
 * already-resolved ISO timestamps and an absolute repo path.
 */
export interface ScopeFilter {
  /** Inclusive lower bound (ISO-8601). Records without a timestamp are kept. */
  fromTimestamp?: string;
  /** Inclusive upper bound (ISO-8601). */
  toTimestamp?: string;
  /** Absolute repo path; sessions are kept when their `cwd` is within it. */
  repoPath?: string;
  /** Optional exact git branch match. */
  gitBranch?: string;
}

export interface ClaudeNativeOptions extends DiscoveryOptions {
  scope?: ScopeFilter;
  /** Schema version the field mapping targets; drift raises a warning. */
  expectedVersion?: string;
}

export class ClaudeNativeAnalyzer {
  private readonly options: ClaudeNativeOptions;
  private readonly expectedVersion: string;

  constructor(options: ClaudeNativeOptions = {}) {
    this.options = options;
    this.expectedVersion = options.expectedVersion ?? FIXTURE_SCHEMA_VERSION;
  }

  /** Run ingestion and emit the normalized dataset. */
  analyze(): ClaudeIngestionResult {
    const stats: IngestionStats = {
      baseDirsScanned: 0,
      sessionsDiscovered: 0,
      linesParsed: 0,
      linesSkipped: 0,
      recordsNormalized: 0,
      duplicatesCollapsed: 0,
      subagentsResolved: 0,
      externalToolResultsResolved: 0,
    };
    const warnings: string[] = [];
    const observedVersions = new Set<string>();

    const turns: ClaudeTurn[] = [];
    const toolCalls: ClaudeToolCall[] = [];
    const subagents: ClaudeSubagent[] = [];
    const sessions: ClaudeSessionSummary[] = [];
    const totals = emptyUsage();
    const mainStreamTotals = emptyUsage();

    const discovered = discoverSessions(this.options);
    stats.baseDirsScanned = new Set(discovered.map(s => s.baseDir)).size;

    for (const session of discovered) {
      const ingested = this.ingestSession(session, stats, observedVersions, warnings);
      if (!ingested) continue; // filtered out by scope
      stats.sessionsDiscovered += 1;

      turns.push(...ingested.turns);
      toolCalls.push(...ingested.toolCalls);
      subagents.push(...ingested.subagents);
      sessions.push(ingested.summary);
      addUsage(totals, ingested.summary.totals);
      addUsage(mainStreamTotals, ingested.summary.mainStreamTotals);
    }

    this.guardSchemaVersion(observedVersions, warnings);

    return {
      turns,
      toolCalls,
      subagents,
      sessions,
      totals,
      mainStreamTotals,
      observedVersions: [...observedVersions].sort(),
      warnings,
      stats,
    };
  }

  /** Parse + normalize one session file, resolve sidecars, apply scope. */
  private ingestSession(
    session: DiscoveredSession,
    stats: IngestionStats,
    observedVersions: Set<string>,
    warnings: string[]
  ): {
    turns: ClaudeTurn[];
    toolCalls: ClaudeToolCall[];
    subagents: ClaudeSubagent[];
    summary: ClaudeSessionSummary;
  } | null {
    const { deduped, version } = this.collectRecords(
      session.filePath,
      { sessionId: session.sessionId, projectSlug: session.projectSlug },
      stats,
      observedVersions
    );

    // Session-level gate: does this session belong to the requested repo/branch?
    if (!this.matchesRepoBranch(deduped)) return null;

    // Scope trim: drop turns outside the window / branch / repo so their usage
    // does not leak into scoped totals. A session whose turns all fall outside
    // the scope is excluded entirely.
    const scoped = this.applyScope(deduped);
    if (this.hasScope() && scoped.length === 0) return null;

    const mainTurns = scoped.map(r => r.turn);
    const mainToolCalls = this.buildToolCalls(session, scoped, stats);

    // Resolve subagents from the sidecar dir, emitting their turns + tool calls.
    // Only subagents whose spawning Agent/Task call survived the scope trim are
    // attributed — otherwise out-of-scope subagent usage would leak into totals.
    const retainedToolUseIds = new Set(mainToolCalls.map(c => c.toolUseId));
    const { subagents, subagentTurns, subagentToolCalls } = this.resolveSubagents(
      session,
      retainedToolUseIds,
      stats,
      observedVersions,
      warnings
    );

    const summary = this.summarizeSession(
      session,
      mainTurns,
      mainToolCalls.length + subagentToolCalls.length,
      subagents,
      version
    );

    return {
      turns: [...mainTurns, ...subagentTurns],
      toolCalls: [...mainToolCalls, ...subagentToolCalls],
      subagents,
      summary,
    };
  }

  /**
   * Read, parse, normalize, and deduplicate one JSONL transcript file (a main
   * session or a subagent). Updates `stats` and `observedVersions` in place.
   */
  private collectRecords(
    filePath: string,
    ctx: { sessionId: string; projectSlug?: string },
    stats: IngestionStats,
    observedVersions: Set<string>
  ): { deduped: NormalizedRecord[]; version?: string } {
    const records: NormalizedRecord[] = [];
    let version: string | undefined;
    for (const line of streamLines(filePath)) {
      if (!line.trim()) continue; // blank line, not malformed
      const parsed = parseLine(line);
      if (!parsed) {
        stats.linesSkipped += 1;
        continue;
      }
      stats.linesParsed += 1;
      const rec = normalizeRecord(parsed, ctx);
      if (!rec) continue; // control/unknown record type — tolerated, not an error
      if (rec.version) {
        observedVersions.add(rec.version);
        version = rec.version;
      }
      records.push(rec);
    }
    const { deduped, duplicatesCollapsed } = dedupeRecords(records);
    stats.duplicatesCollapsed += duplicatesCollapsed;
    stats.recordsNormalized += deduped.length;
    return { deduped, version };
  }

  private buildToolCalls(
    session: DiscoveredSession,
    deduped: NormalizedRecord[],
    stats: IngestionStats
  ): ClaudeToolCall[] {
    // Dedup tool calls/results by toolUseId (streamed partials repeat blocks).
    const callById = new Map<string, ClaudeToolCall>();
    const resultById = new Map<string, ToolResultRef>();
    for (const rec of deduped) {
      for (const call of rec.toolCalls) callById.set(call.toolUseId, call);
      for (const result of rec.toolResults) resultById.set(result.toolUseId, result);
    }

    const toolResultsDir = join(session.sessionDir, 'tool-results');
    const calls: ClaudeToolCall[] = [];
    for (const call of callById.values()) {
      const result = resultById.get(call.toolUseId);
      if (result) {
        call.isError = result.isError;
        call.resultBytes = this.resolveResultBytes(toolResultsDir, call.toolUseId, result, stats);
      }
      calls.push(call);
    }
    return calls;
  }

  /**
   * Prefer the externalized result file size over the inline body. The filename
   * parsed from the body (`externalFile`) is authoritative — it is arbitrary and
   * not necessarily `<id>.txt` (inventory §3.2) — with `<id>.txt` as a fallback
   * for builds that do name it that way. Falls back to the inline size.
   */
  private resolveResultBytes(
    toolResultsDir: string,
    toolUseId: string,
    result: ToolResultRef,
    stats: IngestionStats
  ): number {
    const candidates: string[] = [];
    if (result.externalFile) candidates.push(result.externalFile);
    candidates.push(`${toolUseId}.txt`);
    for (const name of candidates) {
      try {
        const st = statSync(join(toolResultsDir, name));
        if (st.isFile()) {
          stats.externalToolResultsResolved += 1;
          return st.size;
        }
      } catch {
        // Try the next candidate.
      }
    }
    return result.inlineBytes;
  }

  /**
   * Resolve subagents from `<session>/subagents/agent-<id>.{jsonl,meta.json}`.
   *
   * Each subagent's transcript is parsed into normalized turns and tool calls
   * (flagged `isSidechain`, stamped with `agentId`) and its deduped usage is
   * summed into `usageTotals`. Attribution to the parent is by linkage
   * (`spawnedByToolUseId`), NOT by folding subagent usage into the parent turn —
   * the per-turn ledger stays pristine for downstream accounting.
   */
  private resolveSubagents(
    session: DiscoveredSession,
    retainedToolUseIds: Set<string>,
    stats: IngestionStats,
    observedVersions: Set<string>,
    warnings: string[]
  ): {
    subagents: ClaudeSubagent[];
    subagentTurns: ClaudeTurn[];
    subagentToolCalls: ClaudeToolCall[];
  } {
    const empty = { subagents: [], subagentTurns: [], subagentToolCalls: [] };
    const subagentsDir = join(session.sessionDir, 'subagents');
    if (!existsSync(subagentsDir)) return empty;

    let entries: string[];
    try {
      entries = readdirSync(subagentsDir);
    } catch {
      return empty;
    }

    const subagents: ClaudeSubagent[] = [];
    const subagentTurns: ClaudeTurn[] = [];
    const subagentToolCalls: ClaudeToolCall[] = [];

    for (const entry of entries) {
      if (!entry.startsWith('agent-') || !entry.endsWith('.jsonl')) continue;
      const agentId = entry.slice('agent-'.length, -'.jsonl'.length);
      const meta = this.readMeta(join(subagentsDir, `agent-${agentId}.meta.json`));

      const { deduped } = this.collectRecords(
        join(subagentsDir, entry),
        { sessionId: session.sessionId, projectSlug: session.projectSlug },
        stats,
        observedVersions
      );
      const scoped = this.applyScope(deduped);

      // Skip sidecars with no in-scope activity (would otherwise show up in
      // subagentCount with zero usage).
      if (scoped.length === 0) continue;

      // Drop a linked subagent when its spawning Agent/Task call was trimmed out
      // of scope (parent not retained). Unlinked subagents (no toolUseId sidecar)
      // are attributed at session level and kept.
      const spawnedByToolUseId = meta.toolUseId;
      if (spawnedByToolUseId && !retainedToolUseIds.has(spawnedByToolUseId)) continue;

      const usageTotals = emptyUsage();
      for (const rec of scoped) {
        if (rec.turn.usage) addUsage(usageTotals, rec.turn.usage);
        // Guarantee the contract: subagent turns carry agentId + isSidechain.
        subagentTurns.push({ ...rec.turn, agentId: rec.turn.agentId ?? agentId, isSidechain: true });
      }
      subagentToolCalls.push(...this.buildToolCalls(session, scoped, stats));

      if (!spawnedByToolUseId) {
        warnings.push(
          `Subagent ${agentId} in session ${session.sessionId} has no toolUseId sidecar; lineage unknown (session-level attribution).`
        );
      }

      subagents.push({
        sessionId: session.sessionId,
        agentId,
        agentType: meta.agentType ?? 'unknown',
        description: meta.description,
        spawnedByToolUseId,
        lineageUnknown: !spawnedByToolUseId,
        usageTotals,
      });
      stats.subagentsResolved += 1;
    }
    return { subagents, subagentTurns, subagentToolCalls };
  }

  private readMeta(metaPath: string): {
    agentType?: string;
    description?: string;
    toolUseId?: string;
  } {
    try {
      const obj = JSON.parse(readFileSync(metaPath, 'utf-8'));
      if (obj && typeof obj === 'object') {
        const m = obj as Record<string, unknown>;
        return {
          agentType: typeof m.agentType === 'string' ? m.agentType : undefined,
          description: typeof m.description === 'string' ? m.description : undefined,
          toolUseId: typeof m.toolUseId === 'string' ? m.toolUseId : undefined,
        };
      }
    } catch {
      // Missing/malformed sidecar — only agentType is guaranteed anyway (§3.1).
    }
    return {};
  }

  private summarizeSession(
    session: DiscoveredSession,
    mainTurns: ClaudeTurn[],
    toolCallCount: number,
    subagents: ClaudeSubagent[],
    version: string | undefined
  ): ClaudeSessionSummary {
    // mainTurns are the (non-sidechain) main-stream turns; subagent usage is
    // added on top to form `totals` but kept out of `mainStreamTotals`.
    const mainStreamTotals = emptyUsage();
    let cwd: string | undefined;
    let gitBranch: string | undefined;
    let firstTimestamp: string | undefined;
    let lastTimestamp: string | undefined;
    let firstMs = Infinity;
    let lastMs = -Infinity;

    for (const turn of mainTurns) {
      if (turn.usage) addUsage(mainStreamTotals, turn.usage);
      cwd = cwd ?? turn.cwd;
      gitBranch = gitBranch ?? turn.gitBranch;
      // Track bounds by parsed instant (not string order) so timezone offsets do
      // not skew them; keep the original ISO string for evidence.
      const t = parseInstant(turn.timestamp);
      if (t !== null) {
        if (t < firstMs) { firstMs = t; firstTimestamp = turn.timestamp; }
        if (t > lastMs) { lastMs = t; lastTimestamp = turn.timestamp; }
      }
    }

    const totals = cloneUsage(mainStreamTotals);
    for (const sub of subagents) addUsage(totals, sub.usageTotals);

    return {
      sessionId: session.sessionId,
      projectSlug: session.projectSlug,
      cwd,
      gitBranch,
      version,
      firstTimestamp,
      lastTimestamp,
      turnCount: mainTurns.length,
      toolCallCount,
      subagentCount: subagents.length,
      mainStreamTotals,
      totals,
    };
  }

  /** True when any scope constraint is configured. */
  private hasScope(): boolean {
    const s = this.options.scope;
    return Boolean(s && (s.fromTimestamp || s.toTimestamp || s.repoPath || s.gitBranch));
  }

  /**
   * Trim records to the scope window. Applied per-turn so usage from out-of-window
   * timestamps, other branches, or other working dirs does not leak into scoped
   * totals — `gitBranch`/`cwd` are per-record envelope fields and can change
   * mid-session. Records lacking a constrained field are kept (cannot disprove).
   */
  private applyScope(records: NormalizedRecord[]): NormalizedRecord[] {
    if (!this.hasScope()) return records;
    const { fromTimestamp, toTimestamp, repoPath, gitBranch } = this.options.scope!;
    // Compare parsed instants, not ISO strings: lexicographic order breaks across
    // timezone offsets and fractional seconds. An unparseable bound is ignored.
    const fromMs = parseInstant(fromTimestamp);
    const toMs = parseInstant(toTimestamp);
    return records.filter(({ turn }) => {
      const t = parseInstant(turn.timestamp);
      if (t !== null) {
        if (fromMs !== null && t < fromMs) return false;
        if (toMs !== null && t > toMs) return false;
      }
      if (gitBranch && turn.gitBranch !== undefined && turn.gitBranch !== gitBranch) return false;
      if (repoPath && turn.cwd !== undefined && !isWithinPath(turn.cwd, repoPath)) return false;
      return true;
    });
  }

  /** Session-level repo/branch gate: each constraint must match some turn. */
  private matchesRepoBranch(records: NormalizedRecord[]): boolean {
    const scope = this.options.scope;
    if (!scope) return true;
    const { repoPath, gitBranch } = scope;
    if (!repoPath && !gitBranch) return true;

    const hasCwd = records.some(r => r.turn.cwd !== undefined);
    const hasBranch = records.some(r => r.turn.gitBranch !== undefined);

    const repoOk = !repoPath || !hasCwd || records.some(r => isWithinPath(r.turn.cwd, repoPath));
    const branchOk = !gitBranch || !hasBranch || records.some(r => r.turn.gitBranch === gitBranch);
    return repoOk && branchOk;
  }

  private guardSchemaVersion(observedVersions: Set<string>, warnings: string[]): void {
    if (observedVersions.size === 0) return;
    const drifted = [...observedVersions].filter(v => v !== this.expectedVersion);
    if (drifted.length > 0) {
      warnings.push(
        `Schema version drift: expected ${this.expectedVersion}, observed ${drifted
          .sort()
          .join(', ')}. Field mapping is best-effort; verify against the data inventory.`
      );
    }
  }

}

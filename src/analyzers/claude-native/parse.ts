/**
 * Defensive normalization of raw Claude session JSONL records.
 *
 * Parsing rules (inventory §2, §7, §8):
 *  - Require only a `type` discriminator; tolerate unknown fields and types.
 *  - Skip malformed lines without aborting.
 *  - Normalize `user`/`assistant`/`attachment` into `ClaudeTurn`, and
 *    `tool_use`/`tool_result` blocks into `ClaudeToolCall`.
 *  - Deduplicate streaming records by `message.id` (keep last); never sum partials.
 */

import {
  type ClaudeTurn,
  type ClaudeToolCall,
  type ClaudeUsage,
  emptyUsage,
} from './contract.js';

/** Loosely-typed raw record; only `type` is assumed. */
export interface RawRecord {
  type?: unknown;
  uuid?: unknown;
  parentUuid?: unknown;
  sessionId?: unknown;
  cwd?: unknown;
  gitBranch?: unknown;
  version?: unknown;
  timestamp?: unknown;
  isSidechain?: unknown;
  agentId?: unknown;
  message?: unknown;
  [key: string]: unknown;
}

export interface NormalizedRecord {
  turn: ClaudeTurn;
  toolCalls: ClaudeToolCall[];
  /** tool_result blocks (carried on `user` records) to reconcile against calls. */
  toolResults: ToolResultRef[];
  /** Dedup key: prefer `message.id`; fall back to `uuid`. Scoped per session. */
  dedupKey: string;
  /** Observed schema `version`, if present. */
  version?: string;
}

export interface ToolResultRef {
  toolUseId: string;
  isError: boolean;
  /** Byte size of the inline result body (overridden by externalized files). */
  inlineBytes: number;
  /**
   * Externalized result filename referenced inline (inventory §3.2). The name is
   * arbitrary (e.g. `bqyti0sz3.txt`) — NOT necessarily `<tool_use_id>.txt` — so
   * it is parsed from the body rather than constructed. A single path segment
   * (no slashes / `..`) to keep resolution inside the `tool-results/` dir.
   */
  externalFile?: string;
}

const TURN_TYPES = new Set(['user', 'assistant', 'attachment']);

/** Parse a single JSONL line. Returns `null` for malformed or non-object lines. */
export function parseLine(line: string): RawRecord | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  try {
    const obj = JSON.parse(trimmed);
    if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
      return obj as RawRecord;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Normalize one raw record into a turn (+ any tool calls / results).
 * Returns `null` for records that are not normalizable turns (e.g. control
 * records like `last-prompt`, `permission-mode`, or unknown types).
 */
export function normalizeRecord(
  raw: RawRecord,
  ctx: { sessionId: string; projectSlug?: string }
): NormalizedRecord | null {
  const type = typeof raw.type === 'string' ? raw.type : undefined;
  if (!type || !TURN_TYPES.has(type)) return null;

  const sessionId = str(raw.sessionId) ?? ctx.sessionId;
  const uuid = str(raw.uuid);
  if (!uuid) return null;
  const message = isObject(raw.message) ? (raw.message as Record<string, unknown>) : undefined;
  const version = str(raw.version);

  const kind: ClaudeTurn['kind'] = type === 'attachment' ? 'attachment' : 'message';
  const role: ClaudeTurn['role'] | undefined =
    type === 'user' ? 'user' : type === 'assistant' ? 'assistant' : undefined;

  const turn: ClaudeTurn = {
    sessionId,
    uuid,
    parentUuid: str(raw.parentUuid) ?? null,
    kind,
    role,
    model: message ? str(message.model) : undefined,
    timestamp: str(raw.timestamp),
    gitBranch: str(raw.gitBranch),
    cwd: str(raw.cwd),
    projectSlug: ctx.projectSlug,
    usage: type === 'assistant' && message ? normalizeUsage(message.usage) : undefined,
    isSidechain: raw.isSidechain === true,
    agentId: str(raw.agentId),
  };

  const toolCalls: ClaudeToolCall[] = [];
  const toolResults: ToolResultRef[] = [];

  const content = message?.content;
  if (Array.isArray(content)) {
    for (const block of content) {
      if (!isObject(block)) continue;
      const b = block as Record<string, unknown>;
      if (b.type === 'tool_use') {
        const toolUseId = str(b.id);
        const name = str(b.name);
        if (!toolUseId || !name) continue;
        toolCalls.push({
          sessionId,
          turnUuid: uuid,
          toolUseId,
          name,
          target: extractToolTarget(name, b.input),
        });
      } else if (b.type === 'tool_result') {
        const toolUseId = str(b.tool_use_id);
        if (!toolUseId) continue;
        toolResults.push({
          toolUseId,
          isError: b.is_error === true,
          inlineBytes: byteLength(b.content),
          externalFile: extractExternalFile(b.content),
        });
      }
    }
  }

  // Dedup: streamed partials share `message.id` but each has a distinct `uuid`,
  // so prefer `message.id`; `uuid` is only a fallback identity (inventory §8).
  const messageId = message ? str(message.id) : undefined;
  const dedupKey = `${sessionId}::${messageId ?? `uuid:${uuid}`}`;

  return { turn, toolCalls, toolResults, dedupKey, version };
}

/**
 * Deduplicate normalized records by `dedupKey`, keeping the LAST occurrence
 * (final usage tally). Preserves first-seen ordering of the surviving records.
 */
export function dedupeRecords(records: NormalizedRecord[]): {
  deduped: NormalizedRecord[];
  duplicatesCollapsed: number;
} {
  const lastByKey = new Map<string, NormalizedRecord>();
  const order: string[] = [];
  for (const rec of records) {
    if (!lastByKey.has(rec.dedupKey)) order.push(rec.dedupKey);
    lastByKey.set(rec.dedupKey, rec);
  }
  const deduped = order.map(k => lastByKey.get(k)!);
  return { deduped, duplicatesCollapsed: records.length - deduped.length };
}

/** Normalize `message.usage` (snake_case, inventory §2.1) into `ClaudeUsage`. */
export function normalizeUsage(raw: unknown): ClaudeUsage {
  const usage = emptyUsage();
  if (!isObject(raw)) return usage;
  const u = raw as Record<string, unknown>;
  usage.inputTokens = num(u.input_tokens);
  usage.cacheCreationTokens = num(u.cache_creation_input_tokens);
  usage.cacheReadTokens = num(u.cache_read_input_tokens);
  usage.outputTokens = num(u.output_tokens);
  usage.serviceTier = str(u.service_tier);
  usage.speed = str(u.speed);
  if (isObject(u.server_tool_use)) {
    const s = u.server_tool_use as Record<string, unknown>;
    usage.serverToolUse.webSearch = num(s.web_search_requests);
    usage.serverToolUse.webFetch = num(s.web_fetch_requests);
  }
  return usage;
}

/** Extract the tool-specific target field (inventory §2.2). */
export function extractToolTarget(name: string, input: unknown): string | undefined {
  if (!isObject(input)) return undefined;
  const i = input as Record<string, unknown>;
  switch (name) {
    case 'Read':
    case 'Edit':
    case 'Write':
    case 'NotebookEdit':
      return str(i.file_path);
    case 'Grep':
    case 'Glob':
      return str(i.pattern);
    case 'Bash':
      return str(i.command);
    case 'WebFetch':
      return str(i.url);
    case 'Agent':
    case 'Task':
      return str(i.subagent_type);
    case 'Skill':
      // Skill invocations carry the skill identity in `input.skill`
      // (e.g. `codex:rescue`); capture it so attribution records *which*
      // skill ran, not just that a skill ran (inventory §2.2, PRD 03).
      return str(i.skill);
    default:
      return undefined;
  }
}

/** Tool names that spawn subagents (inventory §2.2 — match BOTH). */
export const SUBAGENT_LAUNCH_TOOLS = new Set(['Agent', 'Task']);

/**
 * Find an externalized `tool-results/<file>.txt` reference in a tool_result body.
 * Restricted to a single path segment (alphanumerics, `.`, `_`, `-`) so a
 * crafted body cannot escape the `tool-results/` directory via `/` or `..`.
 */
export function extractExternalFile(content: unknown): string | undefined {
  if (content == null) return undefined;
  const s = typeof content === 'string' ? content : JSON.stringify(content);
  const m = s.match(/tool-results\/([A-Za-z0-9._-]+\.txt)/);
  return m ? m[1] : undefined;
}

function byteLength(content: unknown): number {
  if (content == null) return 0;
  const s = typeof content === 'string' ? content : JSON.stringify(content);
  return Buffer.byteLength(s, 'utf8');
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

# Claude Code Local Data Inventory

**Purpose:** Authoritative, primary-source catalog of the telemetry available under `~/.claude/`
for the agentic-retrospective tool. Every entry was verified against a live install on
**Claude Code version `2.1.150`** (field present in session records as `version`). Schema is
versioned and undocumented by Anthropic; treat every field as best-effort and parse defensively.

**Verification date:** 2026-05-24. **Sample host:** single user, ~172 project slugs, 404 sessions,
213,813 messages (`~/.claude/stats-cache.json`), `projects/` ≈ 391 MB.

> ⚠️ **Version drift is the central risk.** The session format is undocumented and versioned; several
> assumptions that held on older versions are **stale on 2.1.150** — see [§7 Schema drift](#7-schema-drift).
> Verify against this inventory before implementing.

---

## 1. Directory map of `~/.claude/`

| Path | Type | Contains | Retro value |
|---|---|---|---|
| `projects/<slug>/<session>.jsonl` | JSONL | Full per-session event stream (prompts, assistant turns, tool calls, usage) | **Primary source.** Token use, tool/skill/MCP attribution, prompts, decisions |
| `projects/<slug>/<session>/subagents/agent-<agentId>.jsonl` | JSONL | Full transcript of each spawned subagent | **Subagent cost attribution** (current schema) |
| `projects/<slug>/<session>/subagents/agent-<agentId>.meta.json` | JSON | sidecar; `agentType` always present, `description`/`toolUseId`/`name`/`worktreePath` optional (§3.1) | **Lineage join when `toolUseId` present**; else session-level attribution |
| `projects/<slug>/<session>/tool-results/<id>.txt` | text | Externalized large tool-result bodies, referenced by path from the JSONL | Accurate tool-result size; inline-only estimation under-counts |
| `projects/<slug>/memory/` | dir | Per-project agent memory (this repo's auto-memory) | Out of scope for usage metrics |
| `stats-cache.json` | JSON | Pre-aggregated lifetime stats (see §4) | Fast cross-project baseline without reparsing |
| `history.jsonl` | JSONL | Prompt/command history per project+session (see §5) | Lightweight prompt index, command-vs-prompt classification |
| `sessions/<pid>.json` | JSON | Live process metadata per session pid (see §6) | Session start/cwd/version/entrypoint |
| `telemetry/1p_failed_events.*.json` | JSONL | Failed first-party telemetry events (multi-object files) | Error/instrumentation signal; low priority |
| `audit.jsonl` | JSONL | `{timestamp, tool, session, cwd}` audit records (sparse on sample) | Minimal; mostly `Unknown` tool |
| `file-history/<sessionId>/` | dir | Per-session file backups/snapshots | Rework signal (files repeatedly rewritten) |
| `settings.json` / `settings.local.json` | JSON | User + local config (model, hooks, permissions) | Config-aware detectors (ghost-asset detection) |
| `agents/`, `skills/`, `commands/`, `plugins/` | dirs | Installed agents/skills/commands/plugins | "Ghost asset" detection (loaded but never invoked) |
| `tasks/<uuid>/`, `teams/`, `session-env/` | dirs | Background-task / team / per-session env state | Out of scope (runtime, not retro telemetry) |
| `shell-snapshots/`, `paste-cache/`, `cache/`, `backups/` | dirs | Transient caches | Out of scope |

> **Note:** Depending on version and install, Claude data may also live under
> `~/.config/claude/projects/` and `~/.claude/transcripts/`. On the sample host only
> `~/.claude/projects/` exists, but a portable ingester must search all three and honor
> `CLAUDE_CONFIG_DIR` (see §3).

---

## 2. Session JSONL record schema (`projects/<slug>/<session>.jsonl`)

Each line is one JSON object discriminated by `type`. Observed `type` values on 2.1.150:

| `type` | Meaning | Key fields |
|---|---|---|
| `user` | User prompt OR tool_result carrier | `message.role`, `message.content` (string for prompts; array of `tool_result` blocks otherwise), `promptId`, `uuid`, `parentUuid`, `cwd`, `gitBranch`, `version`, `timestamp` |
| `assistant` | One assistant API response | `message.model`, `message.usage` (see §2.1), `message.content[]` (blocks: `text`, `thinking`, `tool_use`), `requestId`, `uuid`, `parentUuid`, `advisorModel` (when advisor used) |
| `attachment` | Hook output, injected files, system events | `attachment.type` (`hook_success`, `hook_non_blocking_error`, `file`, …), `attachment.hookName`, `attachment.durationMs`, `toolUseID` |
| `file-history-snapshot` | File backup checkpoint | `messageId`, `snapshot.trackedFileBackups`, `snapshot.timestamp` |
| `last-prompt` | Pointer to most recent prompt leaf | `leafUuid`, `sessionId` |
| `permission-mode` | Permission mode change | `permissionMode` (e.g. `bypassPermissions`), `sessionId` |
| `ai-title` | Model-generated session title | `aiTitle`, `sessionId` |

Common envelope fields on `user`/`assistant`/`attachment`: `parentUuid` (linked-list to prior record),
`isSidechain` (bool), `sessionId`, `cwd`, `gitBranch`, `version`, `entrypoint` (`cli`), `userType`
(`external`), `timestamp` (ISO-8601).

### 2.1 `message.usage` (assistant records) — the token ledger

Verified live object:

```json
{
  "input_tokens": 7985,
  "cache_creation_input_tokens": 19186,
  "cache_read_input_tokens": 0,
  "output_tokens": 1066,
  "server_tool_use": { "web_search_requests": 0, "web_fetch_requests": 0 },
  "service_tier": "standard",
  "cache_creation": { "ephemeral_1h_input_tokens": 19186, "ephemeral_5m_input_tokens": 0 },
  "inference_geo": "",
  "iterations": [ { "input_tokens": 7985, "output_tokens": 1066, "cache_read_input_tokens": 0,
                    "cache_creation_input_tokens": 19186, "type": "message" } ],
  "speed": "standard"
}
```

Field meaning for cost/accounting:
- **Billable input** = `input_tokens + cache_creation_input_tokens`.
- **Cache read** = `cache_read_input_tokens` — billed at ~0.1× and is whole-session overhead, **not**
  attributable to a single tool.
- **Cache TTL split** = `cache_creation.ephemeral_5m_input_tokens` vs `ephemeral_1h_input_tokens`.
- **`service_tier` / `speed`** = `standard` vs other tiers; affects pricing. A `speed=="fast"` value
  was **not** present on the sample (`speed` was `"standard"`); confirm before relying on it.
- **`server_tool_use`** = server-side web_search / web_fetch counts (billed separately).
- **`iterations[]`** = per-API-iteration breakdown within one logical turn (new; prior tools sum the
  top-level fields and ignore this).

### 2.2 Tool attribution

- `assistant` records contain `tool_use` blocks: `{type:"tool_use", id:"toolu_…", name, input}`.
  Tool-target extraction: `Read/Edit/Write → input.file_path`,
  `Grep/Glob → input.pattern`, `Bash → input.command`, `WebFetch → input.url`,
  `Agent`/`Task → input.subagent_type`.
- `user` records carry matching `tool_result` blocks: `{type:"tool_result", tool_use_id, is_error}`.
  **Result body may be externalized** to `tool-results/<id>.txt` (§3.2) — size must be read from disk,
  not estimated from the inline JSONL line.
- Subagents are spawned via the **`Agent`** tool with `input.subagent_type` — **verified**: 12 `Agent`
  launches and 0 `Task` in the 2.1.150 sample session. (`Task` is the documented spawn tool in some
  Claude Code builds.) **An ingester must match both `Agent` and `Task`.** Do not rely on a top-level
  `toolUseID` for lineage; use the subagent sidecar instead (§3.1).

---

## 3. External-storage subdirectories (current schema, 2.1.150)

These are the biggest divergence from older schema expectations and the highest-value accuracy fix.

### 3.1 `subagents/agent-<agentId>.jsonl` + `.meta.json`

Each spawned subagent gets its own full transcript file plus a sidecar:

```json
// agent-a1a325a3335f7fea7.meta.json  (fullest observed form)
{ "agentType": "general-purpose", "description": "<subagent task description>",
  "toolUseId": "toolu_01A9LgbyzU8DDRnizoq4RST4" }
```

- **Field presence is variable** — only `agentType` is universal. Verified across 351 local
  `.meta.json` files: `agentType` only (120), `+description` (99), `+description +toolUseId` (73),
  `+description +name` (42), and combinations with `name` / `worktreePath`. **Treat `description`,
  `toolUseId`, `name`, `worktreePath` as optional.**
- When present, the sidecar's `toolUseId` links the subagent file → the spawning `Agent`/`Task`
  tool_use block in the parent session, giving **deterministic lineage** without a two-pass tool-use-ID
  heuristic. **When `toolUseId` is absent, lineage is unknown** — attribute the subagent's spend at the
  session level and flag it, rather than guessing a parent.
- Subagent records carry `agentId`, `promptId`, `isSidechain:true`, and their own `message.usage` —
  so subagent token cost is summed (deduped) from the subagent file, then attributed to the parent
  turn via the sidecar when available. (Verified: one subagent emitted 8,647 output tokens.)
- **Consequence:** a usage total that scans only `<session>.jsonl` and ignores `subagents/`
  **undercounts** all subagent spend. A "scan one dir" approach misses this.

### 3.2 `tool-results/<id>.txt`

Large tool-result bodies are written to disk and referenced by path from the JSONL
(`grep` confirmed `tool-results/bqyti0sz3.txt` referenced inline). A `chars/4` estimate over the
inline body will under-count these results; size must come from the `.txt` file.

---

## 4. `stats-cache.json` — pre-aggregated lifetime stats

Top-level keys: `version, lastComputedDate, dailyActivity, dailyModelTokens, modelUsage,
totalSessions, totalMessages, longestSession, firstSessionDate, hourCounts,
totalSpeculationTimeSavedMs`.

`modelUsage[<model>]` carries `inputTokens, outputTokens, cacheReadInputTokens,
cacheCreationInputTokens, webSearchRequests, costUSD, contextWindow, maxOutputTokens`.
On the sample host `costUSD` was `0` for all models (not populated) — **do not trust it for cost**;
compute cost from tokens × offline pricing.

Value: a near-instant baseline (lifetime totals, daily activity, hour-of-day distribution) without
reparsing 391 MB of JSONL. Caveat: it is a cache Claude maintains; treat as a convenience projection,
recompute from JSONL when accuracy matters.

---

## 5. `history.jsonl` — prompt/command index

Record: `{display, pastedContents, timestamp (epoch ms), project (abs path), sessionId}`.
`display` is the prompt or slash-command text (e.g. `"config"`). Useful as a lightweight,
cross-project prompt index and to classify slash-commands vs free-text prompts without parsing
full sessions.

---

## 6. `sessions/<pid>.json` — process metadata

Record: `{pid, sessionId, cwd, startedAt (epoch ms), procStart, version, peerProtocol, kind
(e.g. "interactive"), entrypoint}`. Maps OS pids → sessionId and gives authoritative start time,
cwd, and entrypoint per session. Useful for cwd→project resolution and session timing.

---

## 7. Schema drift

Assumptions that held on older versions but are **stale on 2.1.150**. Verify against this inventory.

| Legacy assumption | Status on 2.1.150 | Correct current approach |
|---|---|---|
| Subagents spawned via one fixed tool name | **Build-dependent** — `Agent` observed in 2.1.150 sample (12 launches, 0 `Task`); `Task` documented elsewhere | Match **both** `Agent` and `Task`; read `subagents/*.meta.json` `toolUseId` for lineage |
| `.meta.json` always carries `description` + `toolUseId` | **Stale** — only `agentType` is universal (73/351 had all three) | Treat lineage fields as optional; session-level attribution when `toolUseId` absent |
| Top-level `toolUseID` for sidechain labeling | **Absent** at top level | Use `subagents/` files + `.meta.json` sidecar |
| Sidechains inline in main JSONL (`isSidechain:true`) | **Moved out** — 0 inline on sample; live in `subagents/` | Scan `subagents/agent-*.jsonl` |
| Tool-result size = inline body length | **Partial** — large results externalized | Resolve `tool-results/<id>.txt` |
| `usage.speed == "fast"` for fast-mode cost | **Not observed** (`speed:"standard"`) | Verify before relying; treat as optional |
| `costUSD` populated in stats/usage | **Zero** on sample | Compute from tokens × offline pricing |
| Single data dir under `~/.claude/projects` | Incomplete — also `~/.config/claude`, `transcripts/` | Multi-dir discovery + `CLAUDE_CONFIG_DIR` |
| `.meta.json` subagent sidecar | **Confirmed present** | Use it as the lineage source of truth |
| `advisorModel` / `iterations[]` fields | **New** on 2.1.150 | New signals available; not yet consumed |

---

## 8. Deduplication requirement

Assistant streaming emits multiple partial records that share one `message.id` but each carry a
**distinct `uuid`**. **Verified:** in the 2.1.150 sample, 54 of 84 `message.id`s spanned more than one
`uuid` (one spanned 4). Naive summation double-counts, and **`(sessionId, uuid)` does NOT collapse
these duplicates** — each streamed partial has its own `uuid`. The correct approach: dedup on
**`message.id`** (keep the **last** record, which holds the final usage tally) and recompute session
totals from the deduped turns. `(sessionId, uuid)` is only a fallback identity for records that lack a
`message.id` entirely — not a streaming-dedup key. Any retrospective ingester must do the same.

---

## 9. What is NOT in local data (gaps for scoring)

The token/session telemetry above informs **Collaboration Efficiency** and **Delivery Predictability**
well, but the local `~/.claude/` data alone does **not** contain:
- Decision rationale/context → the retrospective's own `.logs/decisions/` (Decision Hygiene).
- Test pass/fail outcomes → CI logs / git (Test Loop Completeness).
- Security findings → security scanners / `.logs/` (Security Posture).
- Commit/PR linkage (shipped vs reverted) → git (a yield correlation bridges telemetry↔git).

These dimensions require joining Claude telemetry with git/CI/decision sources the retrospective
already analyzes. See the consolidated spec, `docs/specs/claude-native-telemetry.md`.

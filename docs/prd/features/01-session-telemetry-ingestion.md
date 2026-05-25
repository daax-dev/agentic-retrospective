# PRD 01 — Session Telemetry Ingestion

**Tier:** 1 (Foundation). **Status:** Draft. **Depends on:** nothing. **Blocks:** 02–08.

## Problem
The retrospective reads only `.logs/tools/*.jsonl` from this plugin's own hooks and ignores the
authoritative Claude session stream under `~/.claude/projects/`. Without ingesting that stream there
is no objective basis for token, tool, subagent, skill, or MCP metrics.

## Capability
A read-only ingester that parses Claude session JSONL into the normalized data contract
(`docs/specs/claude-native-telemetry.md` §3) and exposes it to downstream analyzers. No scoring
change in this PRD — it produces the dataset everything else consumes.

## Behaviour
1. **Discovery.** Search `~/.claude/projects`, `~/.config/claude/projects`, and
   `~/.claude/transcripts`; honor `CLAUDE_CONFIG_DIR` (comma-separated, multiple dirs).
2. **Streaming parse.** Read JSONL line-by-line; require only a `type` discriminator; skip malformed
   lines; tolerate unknown fields (forward-compatible with schema drift). Never load whole files into
   memory unnecessarily.
3. **Normalize** `user` / `assistant` / `attachment` records into `ClaudeTurn`, and `tool_use` /
   `tool_result` blocks into `ClaudeToolCall` with tool-target extraction
   (`Read/Edit/Write→file_path`, `Grep/Glob→pattern`, `Bash→command`, `WebFetch→url`,
   `Agent`/`Task→subagent_type` — match **both** subagent-launch tool names; the 2.1.150 sample uses
   `Agent`).
4. **Resolve subagents.** For each `<session>/subagents/agent-<id>.jsonl`, read its `.meta.json`
   sidecar and emit a `ClaudeSubagent`. Only `agentType` is guaranteed present; `description` /
   `toolUseId` are optional (inventory §3.1). When `toolUseId` is present, link to the parent
   `Agent`/`Task` tool call; when absent, attribute at session level and flag lineage as unknown. Sum
   the subagent's own deduped usage.
5. **Resolve externalized tool results.** When a tool result is stored at
   `<session>/tool-results/<id>.txt`, take result size from the file, not the inline body.
6. **Deduplicate.** Collapse assistant streaming records by `message.id`, keeping the last record
   (final usage tally). Streamed partials share `message.id` but each has a distinct `uuid`, so
   `(sessionId, uuid)` must NOT be used to collapse them (inventory §8) — it is only an identity for
   records lacking `message.id`. Recompute any totals from the deduped turns — never sum partials.
7. **Scope.** Filter to sessions whose `gitBranch` / `cwd` / `timestamp` fall in the sprint window
   resolved from `--from` / `--to` / `--sprint` / `--repo`.

## Data inputs
Per `docs/research/claude-data-inventory.md`: §2 session record schema, §2.1 `message.usage`, §2.2
tool attribution, §3 external-storage subdirs (`subagents/`, `tool-results/`).

## Acceptance criteria
- Given fixture sessions, the ingester emits `ClaudeTurn` / `ClaudeToolCall` / `ClaudeSubagent`
  records matching the §3 contract.
- Subagent token totals are attributed to the spawning parent turn via `toolUseId`; a session with
  subagents reports strictly higher total tokens than a main-stream-only scan.
- Duplicate streaming records for one `message.id` produce exactly one turn; totals do not
  double-count (regression test with a known duplicate).
- Malformed lines and unknown record types do not abort the run.
- A schema-version guard records the observed `version` and surfaces a warning when it differs from
  the version the fixtures were captured against.

## Scoring dimensions
Foundation only — emits the dataset. No direct dimension scoring here.

## Risks
- Schema drift (inventory §7): pin to observed fields, keep sample fixtures, fail soft.
- Privacy: session JSONL contains full prompt/response text; never write it outside `.logs/`.
- Same-basename project collisions during cwd→project resolution (Issue #19).

## Out of scope
Pricing, attribution rollups, detectors, persistence — later PRDs.

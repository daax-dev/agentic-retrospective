# Spec: Claude-Native Telemetry for agentic-retrospective

**Status:** Draft for review. Implementation deferred to downstream PRs (one per accepted feature).
**Inputs:** `docs/research/claude-data-inventory.md` (primary-source schema), `docs/prd/features/*`
(feature PRDs).
**Scope:** Defines *what* Claude telemetry the retrospective should ingest and *which* capabilities
to build. Does not specify implementation code.

---

## 1. Problem & goal

Today `src/analyzers/tools.ts` reads only `.logs/tools/*.jsonl` emitted by this plugin's own hooks.
It ignores the authoritative Claude-native stream under `~/.claude/projects/`, so the retrospective
cannot answer "how are we actually using Claude — tokens, tools, subagents, skills, MCP, waste?"
with evidence.

**Goal:** Add a Claude-native ingestion path that produces an evidence-linked telemetry dataset for a
sprint (bounded by git refs, per the existing `--from`/`--to`/`--sprint` CLI surface), feeding the
existing 6 scoring dimensions. Every metric must trace to a `sessionId + uuid` (or `agentId`) in a
specific JSONL record — the "no AI slop" rule.

---

## 2. Design principles

1. **Separate ingestion from reporting.** Normalize raw JSONL into a stable internal shape once; run
   many projections (by tool, subagent, skill, MCP, session, day, model).
2. **Durable, deduped ledger.** Claude prunes JSONL on a rolling window; snapshot into a local store
   with uniqueness constraints so sprint history survives. Dedup assistant streaming records by
   `message.id`; recompute totals from deduped turns — never additively.
3. **Defensive parsing.** Require only a `type` discriminator; tolerate unknown fields and schema
   drift; skip malformed lines without aborting.
4. **Verify schema against the live install.** The session format is undocumented and versioned;
   re-target subagent lineage to `subagents/` + `.meta.json`, and resolve externalized
   `tool-results/*.txt` (see inventory §3, §7).
5. **Evidence linkage over aggregates.** Keep the path back to the transcript so a finding can cite
   the prompt/turn that caused it.
6. **Classify waste, don't just count tokens.** Rule-based detectors over normalized turns produce
   actionable findings, which is what a retrospective needs.

---

## 3. Data contract (the normalized internal model)

A future `claude-native` analyzer must emit these record shapes (names indicative, not binding). All
token fields follow the inventory §2.1 definitions.

```
ClaudeTurn {
  sessionId, uuid, parentUuid, role: 'user'|'assistant',
  model?, timestamp, gitBranch, cwd, projectSlug,
  usage?: { inputTokens, cacheCreationTokens, cacheReadTokens, outputTokens,
            serviceTier, speed, serverToolUse: {webSearch, webFetch} },
  isSidechain, agentId?           // agentId present for subagent turns
}

ClaudeToolCall {
  sessionId, turnUuid, toolUseId, name,
  target,                         // file_path|pattern|command|url|subagent_type per tool (inventory §2.2)
  resultBytes,                    // resolved from inline body OR tool-results/<id>.txt
  isError
}

ClaudeSubagent {
  agentId, agentType, description, // from subagents/agent-<id>.meta.json
  spawnedByToolUseId,              // links to parent Task tool_use
  usageTotals                      // summed from subagents/agent-<id>.jsonl, deduped
}

ClaudeFinding {              // waste/efficiency detector output
  detector, severity, evidence: { sessionId, uuid|toolUseId },
  estimatedWasteTokens?, dimension, remediation
}
```

**Dedup key:** `message.id` (fallback `(sessionId, uuid)`), keep last record. **Discovery:** search
`~/.claude/projects`, `~/.config/claude/projects`, `~/.claude/transcripts`, honor `CLAUDE_CONFIG_DIR`
(comma-separated). **Scope filter:** restrict to sessions whose `gitBranch`/`cwd`/timestamp fall in
the sprint window resolved from `--from`/`--to`/`--sprint`/`--repo`.

---

## 4. Capabilities

Eight capabilities, each detailed in its own PRD under `docs/prd/features/`. Grouped into four
build tiers by dependency order.

### Tier 1 — Foundation

| Capability | PRD | Summary |
|---|---|---|
| Session telemetry ingestion | `01-session-telemetry-ingestion.md` | Defensive streaming JSONL parser → normalized, deduped model; multi-dir discovery; subagent + tool-result resolution; sprint-window scoping |

### Tier 2 — Accounting & attribution

| Capability | PRD | Summary |
|---|---|---|
| Token & cost accounting | `02-token-cost-accounting.md` | Per-turn token ledger (input/cache-create/cache-read/output); offline pricing; model registry; sprint-windowed aggregation |
| Source attribution | `03-source-attribution.md` | Attribute context spend to MCP / subagent / skill / tool / direct; prompt→tool→result→token linkage |

### Tier 3 — Findings (the retrospective payload)

| Capability | PRD | Summary |
|---|---|---|
| Waste & efficiency detection | `04-waste-efficiency-detection.md` | Rule-based detectors over normalized turns: repeated reads, giant outputs, error/retry storms, tool overuse, skill over-firing, cost outliers |
| Delivery correlation | `05-delivery-correlation.md` | Tie telemetry to git outcomes: shipped-vs-reverted yield, edit→verify→edit retry loops |
| Configuration & asset utilization | `06-config-asset-utilization.md` | Detect loaded-but-unused agents/skills/commands/MCP; MCP loaded-vs-invoked coverage |

### Tier 4 — Durability & qualitative review

| Capability | PRD | Summary |
|---|---|---|
| Durable telemetry ledger | `07-durable-telemetry-ledger.md` | Persist deduped snapshots past Claude's rolling retention; optional hook-driven ingestion |
| Transcript evidence & export | `08-transcript-evidence-export.md` | Reconstruct transcripts via parentUuid DAG; compact Markdown export for qualitative review; summary prioritization |

---

## 5. Mapping to the 6 scoring dimensions

| Dimension | Strongest telemetry signals | Capabilities |
|---|---|---|
| **Collaboration Efficiency** | Tool/subagent/skill/MCP attribution; waste detectors; ghost assets; repeated reads | 03, 04, 06 |
| **Delivery Predictability** | Token/cost trend; model substitution; cost outliers; shipped-vs-reverted yield | 02, 04, 05 |
| **Test Loop Completeness** | edit→verify→edit retries; test-command patterns; error→fix loops | 04, 05 |
| **Quality & Maintainability** | Error storms; one-shot failure; rework via repeated file rewrites | 04 |
| **Decision Hygiene** | ⚠️ Not in `~/.claude/` data — join with `.logs/decisions/` (existing analyzer) | — |
| **Security Posture** | ⚠️ Not in `~/.claude/` data — join with security scanners / `.logs/` | — |

Honest gap: pure token telemetry serves Collaboration Efficiency and Delivery Predictability well;
Decision Hygiene and Security Posture require joining Claude telemetry with the retrospective's
existing decision-log and security analyzers. Do not synthesize those dimensions from token data.

---

## 6. Prioritized roadmap (downstream PRs)

Each is a separate PR gated by review of this spec and the relevant feature PRD.

1. **PR-1 (Tier 1):** Parser + normalized model + dedup + subagent/tool-result resolution. Read-only;
   emits the §3 data contract. Unit tests against fixture JSONL. No scoring change yet.
2. **PR-2 (Tier 2):** Accounting + attribution + offline pricing + sprint-window aggregation. Adds a
   `claude-native` section to the report.
3. **PR-3 (Tier 3):** Waste/efficiency detectors feeding Collaboration Efficiency + the delivery
   correlation and asset-utilization signals feeding Delivery Predictability & Test Loop Completeness.
4. **PR-4 (Tier 4):** Durable snapshot store + optional hook-driven ingestion + compact transcript
   export. Wires into `hooks/hooks.json`.

Each PR: update `tools.ts` or add a sibling analyzer (decide in PR-1's plan), keep
`plugin.json`/`marketplace.json`/`README.md` in sync if CLI/scoring surface changes, log decisions to
`.logs/decisions/`.

---

## 7. Open risks

- **Schema drift.** The observed install version already diverges from older expectations
  (inventory §7). Pin parsing to observed fields, add a schema-version guard, and snapshot sample
  fixtures so drift is caught by tests.
- **`speed`/`service_tier` pricing.** Fast-mode field not observed on the sample; confirm before
  pricing fast turns.
- **`costUSD` is 0** in `stats-cache.json` — never trust it; compute from tokens.
- **Privacy.** Session JSONL contains full prompt/response text. Snapshots and compact exports must
  stay under `.logs/` (gitignored) and never be committed.
- **Same-basename project collisions** (Issue #19) when resolving cwd→project.
- **Detector thresholds** are uncalibrated on a small sample; make them configurable and validate
  before shipping findings as authoritative.

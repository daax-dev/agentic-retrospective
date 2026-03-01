# agentsview → agentic-retrospective Integration Proposals

*Source: [wesm/agentsview](https://github.com/wesm/agentsview) code review — 2026-02-28*
*Author: Wes McKinney (pandas, Apache Arrow)*

---

## What agentsview Does That We Don't

agentsview indexes every AI coding session (Claude Code, Codex, Copilot, Gemini, OpenCode, Amp) into local SQLite with full-text search, then surfaces analytics across sessions. Our tool operates on git history. These are complementary: we answer "what got committed," they answer "what happened inside the agent."

The gap is in **session-level signal**. There's a class of rework and quality indicators that only exist in session data — not in git.

---

## Proposed Additions

### 1. Claude Code Session Importer

**What agentsview does:**
Reads `~/.claude/projects/` (JSONL files), parses message-by-message, stores in SQLite with:
- `sessions` table: project, machine, agent, first_message, started_at, ended_at, message_count, user_message_count
- `messages` table: role, content, timestamp, has_thinking, has_tool_use, content_length
- `tool_calls` table: tool_name, category, input_json, skill_name, result_content_length

**What we'd add:**
An optional `claude-sessions` subcommand that reads `~/.claude/projects/` and enriches the retrospective with session-derived metrics. No new runtime dependencies — just parse the JSONL files the same way agentsview does (MIT license, can reference their parser logic).

```bash
agentic-retrospective --include-sessions  # pulls ~/.claude/projects/
agentic-retrospective --sessions-dir /path/to/sessions
```

**Value:** Correlate sessions to git commits by timestamp. If an agent had 47 turns to produce one commit, that's a signal. If it had 3, that's different.

---

### 2. Tool Category Breakdown Analyzer

**What agentsview does:**
Normalizes all tool calls into 8 categories: `Read`, `Edit`, `Write`, `Bash`, `Grep`, `Glob`, `Task`, `Tool`. Stores category in `tool_calls.category`.

**What we'd add:**
A new `ToolUsageAnalyzer` that computes ratios from session data and flags anomalies:

| Ratio | Signal |
|-------|--------|
| `Bash / (Edit + Write)` > 3 | Agent running commands more than producing code |
| `Read / Write` < 0.5 | Writing without reading — likely low-context edits |
| `Edit / (Edit + Write)` < 0.3 | Mostly creating files, rarely patching — risky |
| `Bash` error rate > 20% | Too many failed commands; agent is guessing |

**Concrete metric output:**
```
### Tool Usage Quality
| Metric              | Value | Signal                          |
|---------------------|-------|---------------------------------|
| Read/Write Ratio    | 0.3   | ⚠️ Writing without reading      |
| Bash Error Rate     | 31%   | ⚠️ High command failure rate    |
| Edit vs Write Split | 22%   | ⚠️ Mostly new files, not patches |
```

---

### 3. Session-Level Rework Detection

**What agentsview captures:**
`tool_calls` stores `input_json` for every tool call — including the file path for Read/Edit/Write. This enables sequence analysis.

**What we'd add:**
Detect rework patterns within sessions:

1. **Edit-then-re-edit same file** — agent patched a file, then patched it again in the same session = rework. Count per session, report as `intra_session_rework_rate`.
2. **Write-then-delete** — agent created a file, then deleted it = discarded work.
3. **Failed bash re-runs** — same command executed twice with failure in between = agent guessing.
4. **Re-read after edit** — Edit a file → immediately Read it back → suggests validation loop. This is actually *good* behavior; surface it separately as `self-verification rate`.

```
### Session Rework Signals
| Metric                  | Value | Benchmark |
|-------------------------|-------|-----------|
| Intra-session Rework    | 18%   | <10% good |
| Discarded Files         | 4     |           |
| Failed Bash Re-runs     | 23%   | <15% good |
| Self-verification Rate  | 34%   | >25% good |
```

---

### 4. Session Efficiency Score

**What we'd compute:**
Link session end times to git commit timestamps (±5 min window). Compute:

- **Turns-per-commit**: messages in the session / commits in that window. Lower = more efficient.
- **Session-to-merge rate**: sessions that resulted in a commit vs sessions that produced nothing (abandoned work).
- **Longest sessions**: flag sessions > 2× median length — likely debugging marathons.

```
### Agent Efficiency
| Metric                | Value |
|-----------------------|-------|
| Avg Turns/Commit      | 14.3  |
| Abandoned Sessions    | 22%   |
| Median Session Length | 8 min |
| Debugging Marathons   | 3 sessions (>45 min each) |
```

---

### 5. Multi-Agent Velocity Comparison

**What agentsview does:**
Full parser support for Codex, Copilot, Gemini, OpenCode, Amp — normalized to the same schema.

**What we'd add:**
If multiple agents are detected in session data, surface a per-agent efficiency comparison. Most shops are already running Claude + Codex or Claude + Gemini in parallel.

```
### Agent Comparison (last 2 weeks)
| Agent        | Sessions | Avg Turns | Commit Rate | Rework |
|--------------|----------|-----------|-------------|--------|
| Claude Code  | 47       | 14.3      | 78%         | 18%    |
| Codex        | 12       | 9.1       | 65%         | 31%    |
```

---

## Schema additions for agentic-retrospective

If we add a local session store (optional), mirror agentsview's schema — it's well-designed:

```sql
-- New optional table
CREATE TABLE IF NOT EXISTS agent_sessions (
    id              TEXT PRIMARY KEY,
    project         TEXT NOT NULL,
    agent           TEXT NOT NULL,
    started_at      TEXT,
    ended_at        TEXT,
    message_count   INTEGER NOT NULL DEFAULT 0,
    user_msg_count  INTEGER NOT NULL DEFAULT 0,
    git_commit_sha  TEXT,  -- linked commit (if found by timestamp)
    linked_at       TEXT   -- when we linked it
);

CREATE TABLE IF NOT EXISTS agent_tool_calls (
    id              INTEGER PRIMARY KEY,
    session_id      TEXT NOT NULL REFERENCES agent_sessions(id),
    tool_name       TEXT NOT NULL,
    category        TEXT NOT NULL,  -- Read/Edit/Write/Bash/Grep/Glob/Task
    input_path      TEXT,           -- extracted file path if relevant
    succeeded       INTEGER,        -- 1/0/NULL if determinable
    sequence_order  INTEGER NOT NULL
);
```

---

## Implementation Order

1. **Phase 1 (low-hanging):** Add `--include-sessions` flag that reads `~/.claude/projects/` JSONL without storing anything. Compute turns-per-commit and session count. 1-2 days.
2. **Phase 2:** Tool category breakdown from session data. 2-3 days.
3. **Phase 3:** Intra-session rework detection (requires `input_json` parsing). 3-4 days.
4. **Phase 4:** Multi-agent support + agent comparison. 1 week.

---

## What We Don't Need From agentsview

- Full-text search (we don't need to browse sessions, just analyze them)
- UI/web interface (our output is CLI reports)
- SSE live updates (we're batch/retrospective by design)
- Export to GitHub Gist

The data model is the useful part. Their parsers are a good reference for Phase 1.

---

*See also: [daax-intel agentic-retrospective research](https://learn.galway.poley.dev/kipp/daax-intel/agentic-retrospective/)*

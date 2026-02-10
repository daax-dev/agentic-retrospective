# agent-watch

> **Role**: Data Capture | **Type**: Telemetry Skill | **Status**: Active

Agent-watch is the **data capture layer** for agentic development telemetry. It hooks into AI coding agents (Claude Code, Gemini CLI, etc.) to capture session data that powers analytics and retrospectives.

## Core Principle

**agent-watch captures. agentic-retrospective analyzes.**

agent-watch is responsible for ALL data collection. It writes to `.logs/` and never reads from it for analysis purposes. The agentic-retrospective skill consumes this data for insights.

---

## What agent-watch Captures

### Session Data (`.logs/sessions/`)

| Data Type | File | Description |
|-----------|------|-------------|
| Full Transcript | `<session-id>/full.jsonl` | Complete conversation (user + assistant + tool calls) |
| User Prompts | `<session-id>/prompts.txt` | Extracted user messages |
| Context | `<session-id>/context.md` | Generated context/summaries |
| Token Usage | `<session-id>/usage.json` | Input, output, cache tokens per turn |
| Files Modified | `<session-id>/files.json` | List of files touched during session |
| Subagent Transcripts | `<session-id>/agents/<agent-id>.jsonl` | Spawned Task agent transcripts |

### Checkpoints (`.logs/checkpoints/`)

| Data Type | File | Description |
|-----------|------|-------------|
| Checkpoint Metadata | `<id[:2]>/<id[2:]>/metadata.json` | Checkpoint ID, session, timestamp, commit link |
| Checkpoint Transcript | `<id[:2]>/<id[2:]>/transcript.jsonl` | Transcript at checkpoint time |
| Files Snapshot | `<id[:2]>/<id[2:]>/files.json` | Files modified at checkpoint |

### Telemetry Logs (`.logs/`)

| Data Type | File | Description |
|-----------|------|-------------|
| Prompts | `prompts/YYYY-MM-DD.jsonl` | User prompts with complexity signals |
| Tool Calls | `tools/YYYY-MM-DD.jsonl` | All tool invocations |
| Decisions | `decisions/YYYY-MM-DD.jsonl` | Architectural decisions logged |

**Note**: Feedback logs (`.logs/feedback/`) are written by agentic-retrospective's micro-retro command, not agent-watch. agent-watch only does passive, automatic capture.

---

## Data Schemas

### Transcript Line (JSONL)

```typescript
interface TranscriptLine {
  uuid: string;
  type: 'user' | 'assistant' | 'system';
  timestamp: string;
  message: {
    role: string;
    content: string | ContentBlock[];
  };
}
```

### Prompt Log Entry

```typescript
interface PromptLogEntry {
  ts: string;
  session_id: string;
  prompt: string;
  prompt_length: number;
  complexity_signals: {
    has_constraints: boolean;      // Contains "only", "must", "don't"
    has_examples: boolean;         // Contains code blocks or references
    has_acceptance_criteria: boolean; // Defines "done"
    file_references: number;       // Count of file paths
    ambiguity_score: number;       // 0.0 (clear) to 1.0 (ambiguous)
  };
}
```

### Token Usage

```typescript
interface TokenUsage {
  input_tokens: number;
  cache_creation_tokens: number;
  cache_read_tokens: number;
  output_tokens: number;
  api_call_count: number;
  subagent_tokens?: TokenUsage;  // Nested for spawned agents
}
```

### Checkpoint Metadata

```typescript
interface CheckpointMetadata {
  checkpoint_id: string;       // 12-char hex
  session_id: string;
  timestamp: string;
  commit_hash?: string;        // If linked to git commit
  files_touched: string[];
  token_usage: TokenUsage;
}
```

---

## Hook Integration

### Claude Code Hooks

agent-watch installs hooks via `.claude/settings.json`:

```json
{
  "hooks": {
    "user_prompt_submit": {
      "command": "agent-watch log-prompt \"$PROMPT\""
    },
    "post_tool_use": {
      "command": "agent-watch log-tool \"$TOOL_NAME\" \"$TOOL_INPUT\""
    },
    "stop": {
      "command": "agent-watch capture-session"
    }
  }
}
```

### Supported Agents

| Agent | Hook Method | Status |
|-------|-------------|--------|
| Claude Code | Native hooks.json | Supported |
| Gemini CLI | File watcher | Planned |
| OpenCodex | TBD | Planned |

---

## Directory Structure

```
.logs/
├── sessions/                    # Full session data (agent-watch)
│   └── <session-id>/
│       ├── full.jsonl          # Complete transcript
│       ├── prompts.txt         # User prompts
│       ├── usage.json          # Token usage
│       ├── files.json          # Files modified
│       └── agents/             # Subagent transcripts
│           └── <agent-id>.jsonl
├── checkpoints/                 # Checkpoint snapshots (agent-watch)
│   └── <id[:2]>/
│       └── <id[2:]>/
│           ├── metadata.json
│           └── transcript.jsonl
├── prompts/                     # Daily prompt logs (agent-watch)
│   └── YYYY-MM-DD.jsonl
├── tools/                       # Daily tool logs (agent-watch)
│   └── YYYY-MM-DD.jsonl
├── decisions/                   # Decision logs (agent-watch)
│   └── YYYY-MM-DD.jsonl
├── feedback/                    # Written by agentic-retrospective (NOT agent-watch)
│   └── YYYY-MM-DD.jsonl
└── .current-session             # Active session ID (agent-watch)
```

---

## Commands

| Command | Description |
|---------|-------------|
| `/agent-watch install` | Install hooks and create directory structure |
| `/agent-watch uninstall` | Remove hooks, preserve data |
| `/agent-watch status` | Show current session and capture status |

**Note**: micro-retro is an agentic-retrospective command, not agent-watch. See agentic-retrospective docs.

---

## What agent-watch Does NOT Do

- **Does NOT analyze data** - That's agentic-retrospective's job
- **Does NOT generate reports** - That's agentic-retrospective's job
- **Does NOT score sessions** - That's agentic-retrospective's job
- **Does NOT make recommendations** - That's agentic-retrospective's job

agent-watch is a pure data capture layer. It writes structured data that other skills consume.

---

## Relationship with agentic-retrospective

```
┌─────────────────────────────────────────────────────────────────────┐
│                         DATA FLOW                                    │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│   Claude Code / Gemini CLI / etc.                                    │
│              │                                                       │
│              ▼                                                       │
│   ┌─────────────────────┐                                           │
│   │    agent-watch      │  ◄── PASSIVE CAPTURE (automatic)          │
│   │    (this skill)     │      transcripts, prompts, tools, tokens  │
│   └──────────┬──────────┘                                           │
│              │                                                       │
│              ▼                                                       │
│   ┌─────────────────────┐                                           │
│   │      .logs/         │  ◄── STORAGE                              │
│   │   (filesystem)      │                                           │
│   └──────────┬──────────┘                                           │
│              │                                                       │
│              ▼                                                       │
│   ┌─────────────────────┐                                           │
│   │ agentic-retrospective│  ◄── ANALYZE + ACTIVE FEEDBACK           │
│   │   (partner skill)   │      reports, micro-retro, scoring        │
│   └──────────┬──────────┘                                           │
│              │                                                       │
│              ├───────────────┐                                       │
│              ▼               ▼                                       │
│   ┌─────────────────┐  ┌─────────────────┐                          │
│   │docs/retrospectives│  │.logs/feedback/ │                          │
│   │   (reports)     │  │(micro-retro)   │                          │
│   └─────────────────┘  └─────────────────┘                          │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Entire.io Compatibility

agent-watch can coexist with Entire CLI. When both are installed:

- agent-watch writes to `.logs/` (filesystem)
- Entire writes to `entire/checkpoints/v1` (git branch)
- agentic-retrospective can read from both sources

To import Entire checkpoints into agent-watch format:

```bash
/agent-watch import-entire
```

---

*Skill: agent-watch | Version: 1.0 | Role: Data Capture*

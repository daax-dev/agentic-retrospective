#!/bin/bash
# Log tool invocations
# Called on PostToolUse hook
# Input: JSON on stdin with tool data
#
# Telemetry must never break the session. Missing optional tools (jq) or
# malformed input degrade silently rather than failing the hook, so this
# script intentionally does not use `set -e`.

set -u

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
LOGS_DIR="$PROJECT_DIR/.logs/tools"
DATE=$(date +%Y-%m-%d)
LOG_FILE="$LOGS_DIR/$DATE.jsonl"

# jq is required to build/escape JSON safely. If it is unavailable, skip
# logging instead of emitting malformed JSONL.
if ! command -v jq >/dev/null 2>&1; then
    exit 0
fi

# Ensure directory exists
mkdir -p "$LOGS_DIR" 2>/dev/null || exit 0

# Read input from stdin
INPUT=$(cat)

# Extract tool name
TOOL=$(printf '%s' "$INPUT" | jq -r '.tool_name // .tool // empty' 2>/dev/null || echo "unknown")
if [ -z "$TOOL" ] || [ "$TOOL" = "null" ]; then
    TOOL="unknown"
fi

TIMESTAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ)
SESSION_ID="${CLAUDE_SESSION_ID:-unknown}"

# Emit `tool_name` to match the ToolCallEntry schema consumed by ToolsAnalyzer.
jq -nc \
    --arg ts "$TIMESTAMP" \
    --arg sid "$SESSION_ID" \
    --arg tn "$TOOL" \
    '{timestamp:$ts, session_id:$sid, tool_name:$tn}' \
    >> "$LOG_FILE" 2>/dev/null || exit 0

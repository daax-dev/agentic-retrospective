#!/usr/bin/env bash
# Log tool calls to .logs/tools/
# Called by Claude Code hook on PostToolUse

set -euo pipefail

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
LOG_DIR="$PROJECT_DIR/.logs/tools"
DATE=$(date +%Y-%m-%d)
LOG_FILE="$LOG_DIR/$DATE.jsonl"

# Ensure directory exists
mkdir -p "$LOG_DIR"

# Read hook input from stdin
INPUT=$(cat)

# Extract fields and write log entry
if command -v jq &> /dev/null; then
    TIMESTAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ)
    SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // "unknown"')
    TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // "unknown"')
    TOOL_INPUT=$(echo "$INPUT" | jq -c '.tool_input // {}')

    # Create log entry (compact tool_input to save space)
    jq -n \
        --arg ts "$TIMESTAMP" \
        --arg sid "$SESSION_ID" \
        --arg tool "$TOOL_NAME" \
        --argjson input "$TOOL_INPUT" \
        '{timestamp: $ts, session_id: $sid, tool: $tool, input: $input}' >> "$LOG_FILE"
else
    # Fallback: log raw input
    echo "$INPUT" >> "$LOG_FILE"
fi

# Exit 0 to allow tool call to proceed
exit 0

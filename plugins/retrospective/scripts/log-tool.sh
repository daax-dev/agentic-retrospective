#!/bin/bash
# Log tool invocations
# Called on PostToolUse hook
# Input: JSON on stdin with tool data

set -e

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
LOGS_DIR="$PROJECT_DIR/.logs/tools"
DATE=$(date +%Y-%m-%d)
LOG_FILE="$LOGS_DIR/$DATE.jsonl"

# Ensure directory exists
mkdir -p "$LOGS_DIR"

# Read input from stdin
INPUT=$(cat)

# Extract tool name
TOOL=$(echo "$INPUT" | jq -r '.tool_name // .tool // empty' 2>/dev/null || echo "unknown")
if [ -z "$TOOL" ] || [ "$TOOL" = "null" ]; then
    TOOL="unknown"
fi

TIMESTAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ)
SESSION_ID="${CLAUDE_SESSION_ID:-unknown}"

# Create log entry (minimal - just tool name and timestamp)
cat >> "$LOG_FILE" << EOF
{"timestamp": "$TIMESTAMP", "session_id": "$SESSION_ID", "tool": "$TOOL"}
EOF

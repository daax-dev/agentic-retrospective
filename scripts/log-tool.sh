#!/usr/bin/env bash
# Log tool calls to .logs/tools/
# Called by Claude Code hook on PostToolUse
# No jq dependency - uses python3 for JSON (with bash fallback)

set -euo pipefail

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
LOG_DIR="$PROJECT_DIR/.logs/tools"
DATE=$(date +%Y-%m-%d)
LOG_FILE="$LOG_DIR/$DATE.jsonl"

# Ensure directory exists
mkdir -p "$LOG_DIR"

# Read hook input from stdin
INPUT=$(cat)

TIMESTAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ)

# Try python3 first for proper JSON handling, fall back to bash
if command -v python3 &> /dev/null; then
    echo "$INPUT" | TIMESTAMP="$TIMESTAMP" python3 -c "
import sys, json, os

try:
    data = json.loads(sys.stdin.read())
except:
    data = {}

timestamp = os.environ.get('TIMESTAMP', '')

entry = {
    'timestamp': timestamp,
    'session_id': data.get('session_id', 'unknown'),
    'tool': data.get('tool_name', 'unknown'),
    'input': data.get('tool_input', {})
}
print(json.dumps(entry))
" >> "$LOG_FILE"
else
    # Pure bash fallback - log raw input with timestamp
    SESSION_ID=$(echo "$INPUT" | grep -o '"session_id"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | cut -d'"' -f4)
    SESSION_ID="${SESSION_ID:-unknown}"
    TOOL_NAME=$(echo "$INPUT" | grep -o '"tool_name"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | cut -d'"' -f4)
    TOOL_NAME="${TOOL_NAME:-unknown}"
    # Flatten newlines and escape for safe JSON string embedding
    RAW_INPUT=$(echo "$INPUT" | tr '\n' ' ')
    RAW_INPUT_ESCAPED=$(printf '%s' "$RAW_INPUT" | sed 's/\\/\\\\/g; s/"/\\"/g')
    echo "{\"timestamp\":\"$TIMESTAMP\",\"session_id\":\"$SESSION_ID\",\"tool\":\"$TOOL_NAME\",\"raw_input\":\"$RAW_INPUT_ESCAPED\"}" >> "$LOG_FILE"
fi

# Exit 0 to allow tool call to proceed
exit 0

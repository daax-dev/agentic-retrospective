#!/bin/bash
# Log user prompts with complexity signals
# Called on UserPromptSubmit hook
# Input: JSON on stdin with prompt data

set -e

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
LOGS_DIR="$PROJECT_DIR/.logs/prompts"
DATE=$(date +%Y-%m-%d)
LOG_FILE="$LOGS_DIR/$DATE.jsonl"

# Ensure directory exists
mkdir -p "$LOGS_DIR"

# Read input from stdin
INPUT=$(cat)

# Extract prompt from input
PROMPT=$(echo "$INPUT" | jq -r '.prompt // empty' 2>/dev/null || echo "")
if [ -z "$PROMPT" ]; then
    exit 0
fi

PROMPT_LENGTH=${#PROMPT}
TIMESTAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ)
SESSION_ID="${CLAUDE_SESSION_ID:-unknown}"

# Analyze complexity signals
HAS_CONSTRAINTS=false
HAS_EXAMPLES=false
HAS_ACCEPTANCE_CRITERIA=false
FILE_REFERENCES=0
AMBIGUITY_SCORE=0.5

# Check for constraints (only, must, don't, do not, never, always)
if echo "$PROMPT" | grep -qiE '\b(only|must|don.t|do not|never|always|exactly|specifically)\b'; then
    HAS_CONSTRAINTS=true
    AMBIGUITY_SCORE=$(echo "$AMBIGUITY_SCORE - 0.2" | bc)
fi

# Check for examples
if echo "$PROMPT" | grep -qiE '\b(for example|e\.g\.|such as|like this|example:)\b'; then
    HAS_EXAMPLES=true
    AMBIGUITY_SCORE=$(echo "$AMBIGUITY_SCORE - 0.1" | bc)
fi

# Check for acceptance criteria
if echo "$PROMPT" | grep -qiE '\b(should|expected|criteria|requirement|test|verify|ensure)\b'; then
    HAS_ACCEPTANCE_CRITERIA=true
    AMBIGUITY_SCORE=$(echo "$AMBIGUITY_SCORE - 0.1" | bc)
fi

# Count file references (paths, extensions)
FILE_REFERENCES=$(echo "$PROMPT" | grep -oE '\b[a-zA-Z0-9_/-]+\.(py|js|ts|go|rs|md|json|yaml|yml|toml|sh)\b' | wc -l | tr -d ' ')
if [ "$FILE_REFERENCES" -gt 0 ]; then
    AMBIGUITY_SCORE=$(echo "$AMBIGUITY_SCORE - 0.1" | bc)
fi

# Clamp ambiguity score to 0-1
if (( $(echo "$AMBIGUITY_SCORE < 0" | bc -l) )); then
    AMBIGUITY_SCORE=0.0
fi

# Create log entry
cat >> "$LOG_FILE" << EOF
{"timestamp": "$TIMESTAMP", "session_id": "$SESSION_ID", "prompt_length": $PROMPT_LENGTH, "complexity_signals": {"has_constraints": $HAS_CONSTRAINTS, "has_examples": $HAS_EXAMPLES, "has_acceptance_criteria": $HAS_ACCEPTANCE_CRITERIA, "file_references": $FILE_REFERENCES, "ambiguity_score": $AMBIGUITY_SCORE}}
EOF

#!/bin/bash
# Log user prompts with complexity signals
# Called on UserPromptSubmit hook
# Input: JSON on stdin with prompt data
#
# Telemetry must never break the session. Missing optional tools (jq) or
# malformed input degrade silently rather than failing the hook, so this
# script intentionally does not use `set -e`.

set -u

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
LOGS_DIR="$PROJECT_DIR/.logs/prompts"
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

# Extract prompt from input
PROMPT=$(printf '%s' "$INPUT" | jq -r '.prompt // empty' 2>/dev/null || echo "")
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

# Ambiguity score computed with integer math (tenths) to avoid a `bc`
# dependency: 0.5 baseline, reduced by each signal, clamped at 0.0.
SCORE_TENTHS=5

# Check for constraints (only, must, don't, do not, never, always)
if printf '%s' "$PROMPT" | grep -qiE '\b(only|must|don.t|do not|never|always|exactly|specifically)\b'; then
    HAS_CONSTRAINTS=true
    SCORE_TENTHS=$((SCORE_TENTHS - 2))
fi

# Check for examples
if printf '%s' "$PROMPT" | grep -qiE '\b(for example|e\.g\.|such as|like this|example:)\b'; then
    HAS_EXAMPLES=true
    SCORE_TENTHS=$((SCORE_TENTHS - 1))
fi

# Check for acceptance criteria
if printf '%s' "$PROMPT" | grep -qiE '\b(should|expected|criteria|requirement|test|verify|ensure)\b'; then
    HAS_ACCEPTANCE_CRITERIA=true
    SCORE_TENTHS=$((SCORE_TENTHS - 1))
fi

# Count file references (paths, extensions)
FILE_REFERENCES=$(printf '%s' "$PROMPT" | grep -oE '\b[a-zA-Z0-9_/-]+\.(py|js|ts|go|rs|md|json|yaml|yml|toml|sh)\b' | wc -l | tr -d ' ')
if [ "$FILE_REFERENCES" -gt 0 ]; then
    SCORE_TENTHS=$((SCORE_TENTHS - 1))
fi

# Clamp ambiguity score to >= 0
if [ "$SCORE_TENTHS" -lt 0 ]; then
    SCORE_TENTHS=0
fi
AMBIGUITY_SCORE="0.$SCORE_TENTHS"

# Build complexity signals object, then the full entry, via jq so the prompt
# is escaped correctly even when it contains quotes or newlines.
SIGNALS_JSON=$(jq -nc \
    --argjson hc "$HAS_CONSTRAINTS" \
    --argjson he "$HAS_EXAMPLES" \
    --argjson hac "$HAS_ACCEPTANCE_CRITERIA" \
    --argjson fr "$FILE_REFERENCES" \
    --argjson amb "$AMBIGUITY_SCORE" \
    '{has_constraints:$hc, has_examples:$he, has_acceptance_criteria:$hac, file_references:$fr, ambiguity_score:$amb}' 2>/dev/null) || exit 0

jq -nc \
    --arg ts "$TIMESTAMP" \
    --arg sid "$SESSION_ID" \
    --arg p "$PROMPT" \
    --argjson len "$PROMPT_LENGTH" \
    --argjson sig "$SIGNALS_JSON" \
    '{timestamp:$ts, session_id:$sid, prompt:$p, prompt_length:$len, complexity_signals:$sig}' \
    >> "$LOG_FILE" 2>/dev/null || exit 0

#!/usr/bin/env bash
# Log user prompts to .logs/prompts/
# Called by Claude Code hook on UserPromptSubmit
# Enhanced with complexity signals for Phase 1 improvements

set -euo pipefail

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
LOG_DIR="$PROJECT_DIR/.logs/prompts"
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
    PROMPT=$(echo "$INPUT" | jq -r '.prompt // ""')
    PROMPT_LENGTH=${#PROMPT}

    # Analyze complexity signals
    # Check for constraints (words like "only", "must", "don't", "without", "limit")
    HAS_CONSTRAINTS=$(echo "$PROMPT" | grep -iE '\b(only|must|don'\''t|do not|without|limit|never|always|exactly)\b' > /dev/null && echo "true" || echo "false")
    
    # Check for examples (code blocks, "for example", "e.g.", "like this")
    HAS_EXAMPLES=$(echo "$PROMPT" | grep -iE '(```|for example|e\.g\.|like this|such as)' > /dev/null && echo "true" || echo "false")
    
    # Check for acceptance criteria ("should return", "expected", "when...then", "if...then")
    HAS_ACCEPTANCE_CRITERIA=$(echo "$PROMPT" | grep -iE '(should return|expected|when .+ then|if .+ then|success.*(is|means)|done when|verify that)' > /dev/null && echo "true" || echo "false")
    
    # Count file references (paths with extensions or explicit file mentions)
    FILE_REFERENCES=$(echo "$PROMPT" | grep -oE '[A-Za-z0-9_/-]+\.(ts|js|py|java|go|rs|md|json|yaml|yml|sh|css|html|tsx|jsx)' | wc -l | tr -d ' ')
    FILE_REFERENCES=${FILE_REFERENCES:-0}
    
    # Calculate ambiguity score (0.0-1.0, lower is better)
    # Factors: short prompt, no constraints, no examples, no file refs, vague words
    AMBIGUITY_SCORE="0.0"
    SCORE=0
    
    # Short prompts are more ambiguous
    if [ "$PROMPT_LENGTH" -lt 20 ]; then
        SCORE=$((SCORE + 30))
    elif [ "$PROMPT_LENGTH" -lt 50 ]; then
        SCORE=$((SCORE + 20))
    elif [ "$PROMPT_LENGTH" -lt 100 ]; then
        SCORE=$((SCORE + 10))
    fi
    
    # Missing structure signals add to ambiguity
    [ "$HAS_CONSTRAINTS" = "false" ] && SCORE=$((SCORE + 15))
    [ "$HAS_EXAMPLES" = "false" ] && SCORE=$((SCORE + 15))
    [ "$HAS_ACCEPTANCE_CRITERIA" = "false" ] && SCORE=$((SCORE + 20))
    [ "$FILE_REFERENCES" -eq 0 ] && SCORE=$((SCORE + 10))
    
    # Vague words increase ambiguity
    if echo "$PROMPT" | grep -qiE '\b(somehow|something|stuff|thing|maybe|probably|kind of|sort of|etc|whatever)\b'; then
        SCORE=$((SCORE + 10))
    fi
    
    # Normalize to 0.0-1.0
    if [ "$SCORE" -gt 100 ]; then
        SCORE=100
    fi
    AMBIGUITY_SCORE=$(awk "BEGIN {printf \"%.2f\", $SCORE / 100}")

    # Create enhanced log entry with complexity signals
    jq -n \
        --arg ts "$TIMESTAMP" \
        --arg sid "$SESSION_ID" \
        --arg prompt "$PROMPT" \
        --argjson prompt_length "$PROMPT_LENGTH" \
        --argjson has_constraints "$HAS_CONSTRAINTS" \
        --argjson has_examples "$HAS_EXAMPLES" \
        --argjson has_acceptance_criteria "$HAS_ACCEPTANCE_CRITERIA" \
        --argjson file_references "$FILE_REFERENCES" \
        --argjson ambiguity_score "$AMBIGUITY_SCORE" \
        '{
            timestamp: $ts,
            session_id: $sid,
            prompt: $prompt,
            prompt_length: $prompt_length,
            complexity_signals: {
                has_constraints: $has_constraints,
                has_examples: $has_examples,
                has_acceptance_criteria: $has_acceptance_criteria,
                file_references: $file_references,
                ambiguity_score: $ambiguity_score
            }
        }' >> "$LOG_FILE"
else
    # Fallback: log raw input
    echo "$INPUT" >> "$LOG_FILE"
fi

# Exit 0 to allow prompt to proceed
exit 0

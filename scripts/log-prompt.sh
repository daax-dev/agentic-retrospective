#!/usr/bin/env bash
# Log user prompts to .logs/prompts/
# Called by Claude Code hook on UserPromptSubmit
# Enhanced with complexity signals for Phase 1 improvements
# No jq dependency - uses python3 for JSON (with bash fallback)

set -euo pipefail

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
LOG_DIR="$PROJECT_DIR/.logs/prompts"
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
session_id = data.get('session_id', 'unknown')
prompt = data.get('prompt', '')
prompt_length = len(prompt)
prompt_lower = prompt.lower()

# Complexity signals
import re
has_constraints = bool(re.search(r\"\b(only|must|don't|dont|do not|without|limit|never|always|exactly)\b\", prompt_lower))
has_examples = bool(re.search(r'(\`\`\`|for example|e\.g\.|like this|such as)', prompt_lower))
has_acceptance_criteria = bool(re.search(r'(should return|expected|when .+ then|if .+ then|success.*(is|means)|done when|verify that)', prompt_lower))
file_references = len(re.findall(r'[A-Za-z0-9_/-]+\.(ts|js|py|java|go|rs|md|json|yaml|yml|sh|css|html|tsx|jsx)', prompt))

# Ambiguity score (0.0-1.0, lower is better)
score = 0
if prompt_length < 20: score += 30
elif prompt_length < 50: score += 20
elif prompt_length < 100: score += 10
if not has_constraints: score += 15
if not has_examples: score += 15
if not has_acceptance_criteria: score += 20
if file_references == 0: score += 10
if re.search(r'\b(somehow|something|stuff|thing|maybe|probably|kind of|sort of|etc|whatever)\b', prompt_lower):
    score += 10
ambiguity_score = round(min(score, 100) / 100.0, 2)

entry = {
    'timestamp': timestamp,
    'session_id': session_id,
    'prompt': prompt,
    'prompt_length': prompt_length,
    'complexity_signals': {
        'has_constraints': has_constraints,
        'has_examples': has_examples,
        'has_acceptance_criteria': has_acceptance_criteria,
        'file_references': file_references,
        'ambiguity_score': ambiguity_score
    }
}
print(json.dumps(entry))
" >> "$LOG_FILE"
else
    # Pure bash fallback - log raw input with timestamp wrapper
    # Can't do proper JSON escaping without python3/jq, so wrap minimally
    SESSION_ID=$(echo "$INPUT" | grep -o '"session_id"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | cut -d'"' -f4)
    SESSION_ID="${SESSION_ID:-unknown}"
    # Flatten newlines and escape for safe JSON string embedding
    RAW_INPUT_ESCAPED=$(echo "$INPUT" | tr '\n' ' ' | sed 's/\\/\\\\/g; s/"/\\"/g')
    echo "{\"timestamp\":\"$TIMESTAMP\",\"session_id\":\"$SESSION_ID\",\"raw_input\":\"$RAW_INPUT_ESCAPED\"}" >> "$LOG_FILE"
fi

# Exit 0 to allow prompt to proceed
exit 0

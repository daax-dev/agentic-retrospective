#!/usr/bin/env bash
# Post-session micro-retro capture
# Quick 30-second feedback capture at end of session
# No jq dependency - uses python3 for JSON encoding

set -euo pipefail

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
LOG_DIR="$PROJECT_DIR/.logs/feedback"
DATE=$(date +%Y-%m-%d)
LOG_FILE="$LOG_DIR/$DATE.jsonl"

# Ensure directory exists
mkdir -p "$LOG_DIR"

# Colors for terminal
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}       Session Feedback (30 seconds)${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Get session ID if provided as argument, otherwise generate one
SESSION_ID="${1:-$(date +%Y%m%d-%H%M%S)}"

# Question 1: Alignment (1-5)
echo -e "${YELLOW}1. How aligned was the agent with your intent?${NC}"
echo "   [1] Very misaligned  [2] Somewhat off  [3] Okay  [4] Good  [5] Excellent"
read -p "   Your rating (1-5): " ALIGNMENT
# Validate input
if ! [[ "$ALIGNMENT" =~ ^[1-5]$ ]]; then
    echo -e "${RED}   Invalid input, defaulting to 3${NC}"
    ALIGNMENT=3
fi

# Question 2: Rework needed
echo ""
echo -e "${YELLOW}2. Any rework needed after the session?${NC}"
echo "   [1] Yes, significant  [2] Minor tweaks  [3] None"
read -p "   Your choice (1-3): " REWORK_CHOICE
case "$REWORK_CHOICE" in
    1) REWORK="significant" ;;
    2) REWORK="minor" ;;
    3) REWORK="none" ;;
    *) REWORK="unknown" ;;
esac

# Question 3: Revision cycles (optional, quick estimate)
echo ""
echo -e "${YELLOW}3. How many revision cycles occurred? (0-10, press Enter to skip)${NC}"
read -p "   Revision cycles: " REVISION_CYCLES
if [[ -z "$REVISION_CYCLES" ]] || ! [[ "$REVISION_CYCLES" =~ ^[0-9]+$ ]]; then
    REVISION_CYCLES=""
fi

# Question 4: One improvement suggestion
echo ""
echo -e "${YELLOW}4. One thing to improve next time? (press Enter to skip)${NC}"
read -p "   Improvement: " IMPROVEMENT

# Question 5: What worked well (optional)
echo ""
echo -e "${YELLOW}5. What worked well? (press Enter to skip)${NC}"
read -p "   Worked well: " WORKED_WELL

# Generate timestamp
TIMESTAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ)

# Write log entry using python3 for proper JSON encoding
if command -v python3 &> /dev/null; then
    MICRO_TIMESTAMP="$TIMESTAMP" \
    MICRO_SESSION_ID="$SESSION_ID" \
    MICRO_ALIGNMENT="$ALIGNMENT" \
    MICRO_REWORK="$REWORK" \
    MICRO_REVISION_CYCLES="${REVISION_CYCLES}" \
    MICRO_IMPROVEMENT="$IMPROVEMENT" \
    MICRO_WORKED_WELL="$WORKED_WELL" \
    python3 -c "
import json, os

rev = os.environ.get('MICRO_REVISION_CYCLES', '')
entry = {
    'timestamp': os.environ['MICRO_TIMESTAMP'],
    'session_id': os.environ['MICRO_SESSION_ID'],
    'alignment': int(os.environ['MICRO_ALIGNMENT']),
    'rework_needed': os.environ['MICRO_REWORK'],
    'revision_cycles': int(rev) if rev else None,
    'improvement_suggestion': os.environ.get('MICRO_IMPROVEMENT', ''),
    'worked_well': os.environ.get('MICRO_WORKED_WELL', ''),
}
print(json.dumps(entry))
" >> "$LOG_FILE"
else
    # Bash fallback - escape backslashes first, then double quotes
    REV_JSON="${REVISION_CYCLES:-null}"
    if [[ "$REV_JSON" != "null" ]]; then
        REV_JSON="$REV_JSON"
    fi
    # Escape backslashes then double quotes in free-text fields
    IMPROVEMENT_ESC=$(printf '%s' "$IMPROVEMENT" | sed 's/\\/\\\\/g; s/"/\\"/g')
    WORKED_WELL_ESC=$(printf '%s' "$WORKED_WELL" | sed 's/\\/\\\\/g; s/"/\\"/g')
    echo "{\"timestamp\":\"$TIMESTAMP\",\"session_id\":\"$SESSION_ID\",\"alignment\":$ALIGNMENT,\"rework_needed\":\"$REWORK\",\"revision_cycles\":$REV_JSON,\"improvement_suggestion\":\"$IMPROVEMENT_ESC\",\"worked_well\":\"$WORKED_WELL_ESC\"}" >> "$LOG_FILE"
fi

echo ""
echo -e "${GREEN}Feedback logged to $LOG_FILE${NC}"

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

exit 0

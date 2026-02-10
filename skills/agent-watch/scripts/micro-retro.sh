#!/usr/bin/env bash
# Post-session micro-retro capture
# Quick 30-second feedback capture at end of session
# Part of Phase 1: Foundation improvements

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
echo -e "${BLUE}       📋 Session Feedback (30 seconds)${NC}"
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
    REVISION_CYCLES="null"
fi

# Question 4: One improvement suggestion
echo ""
echo -e "${YELLOW}4. One thing to improve next time? (press Enter to skip)${NC}"
read -p "   Improvement: " IMPROVEMENT
if [[ -z "$IMPROVEMENT" ]]; then
    IMPROVEMENT=""
fi

# Question 5: What worked well (optional)
echo ""
echo -e "${YELLOW}5. What worked well? (press Enter to skip)${NC}"
read -p "   Worked well: " WORKED_WELL
if [[ -z "$WORKED_WELL" ]]; then
    WORKED_WELL=""
fi

# Generate timestamp
TIMESTAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ)

# Ensure jq is available for proper JSON escaping
if ! command -v jq &> /dev/null; then
    echo -e "${RED}Error: 'jq' is required but not installed. Please install jq to log feedback.${NC}" >&2
    exit 1
fi

# Write log entry using jq for proper JSON encoding
jq -n \
    --arg ts "$TIMESTAMP" \
    --arg sid "$SESSION_ID" \
    --argjson alignment "$ALIGNMENT" \
    --arg rework "$REWORK" \
    --argjson revision_cycles "$REVISION_CYCLES" \
    --arg improvement "$IMPROVEMENT" \
    --arg worked_well "$WORKED_WELL" \
    '{
        timestamp: $ts,
        session_id: $sid,
        alignment: $alignment,
        rework_needed: $rework,
        revision_cycles: $revision_cycles,
        improvement_suggestion: $improvement,
        worked_well: $worked_well
    }' >> "$LOG_FILE"

echo ""
echo -e "${GREEN}✓ Feedback logged to $LOG_FILE${NC}"

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

exit 0

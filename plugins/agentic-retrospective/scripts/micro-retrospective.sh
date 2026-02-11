#!/bin/bash
# Quick 30-second feedback survey after sessions
# Can be invoked manually or via skill

set -e

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
LOGS_DIR="$PROJECT_DIR/.logs/feedback"
DATE=$(date +%Y-%m-%d)
LOG_FILE="$LOGS_DIR/$DATE.jsonl"

# Ensure directory exists
mkdir -p "$LOGS_DIR"

TIMESTAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ)
SESSION_ID="${CLAUDE_SESSION_ID:-$(date +%s)}"

echo ""
echo "=== Quick Session Feedback (30 seconds) ==="
echo ""

# Alignment score
echo "How well did the agent understand your intent? (1-5)"
echo "  1 = Completely missed the point"
echo "  3 = Partially understood"
echo "  5 = Nailed it perfectly"
read -p "Score: " ALIGNMENT

# Validate
if ! [[ "$ALIGNMENT" =~ ^[1-5]$ ]]; then
    echo "Invalid score. Using 3."
    ALIGNMENT=3
fi

# Rework needed
echo ""
echo "How much rework was needed?"
echo "  1 = none"
echo "  2 = minor"
echo "  3 = significant"
read -p "Choice: " REWORK_CHOICE

case $REWORK_CHOICE in
    1) REWORK="none" ;;
    2) REWORK="minor" ;;
    3) REWORK="significant" ;;
    *) REWORK="none" ;;
esac

# Optional: what worked well
echo ""
read -p "What worked well? (optional, press Enter to skip): " WORKED_WELL

# Optional: improvement suggestion
echo ""
read -p "One thing to improve? (optional, press Enter to skip): " IMPROVEMENT

# Escape strings for JSON
WORKED_WELL=$(echo "$WORKED_WELL" | sed 's/"/\\"/g')
IMPROVEMENT=$(echo "$IMPROVEMENT" | sed 's/"/\\"/g')

# Write feedback
cat >> "$LOG_FILE" << EOF
{"timestamp": "$TIMESTAMP", "session_id": "$SESSION_ID", "alignment": $ALIGNMENT, "rework_needed": "$REWORK", "worked_well": "$WORKED_WELL", "improvement_suggestion": "$IMPROVEMENT"}
EOF

echo ""
echo "Feedback logged. Thank you!"

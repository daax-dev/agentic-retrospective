#!/bin/bash
# Run full retrospective analysis
# Requires Python package to be installed for full analysis
# Falls back to basic git analysis if not available

set -e

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
SINCE="${1:-2 weeks ago}"

echo ""
echo "=== Agentic Retrospective ==="
echo "Analysis period: since $SINCE"
echo ""

# Try Python package first
if command -v agentic-retrospective &> /dev/null; then
    agentic-retrospective conduct --since "$SINCE" --verbose
    exit 0
fi

# Fall back to basic analysis
echo "Note: Full analysis requires 'pip install agentic-retrospective'"
echo "Running basic git analysis..."
echo ""

# Git stats
echo "## Git Activity"
echo ""

COMMITS=$(git log --oneline --since="$SINCE" 2>/dev/null | wc -l | tr -d ' ')
echo "Total commits: $COMMITS"

if [ "$COMMITS" -gt 0 ]; then
    echo ""
    echo "### Recent Commits"
    git log --oneline --since="$SINCE" | head -15

    echo ""
    echo "### Contributors"
    git shortlog -sn --since="$SINCE" | head -10

    echo ""
    echo "### Files Most Changed"
    git log --since="$SINCE" --pretty=format: --name-only | sort | uniq -c | sort -rn | head -10
fi

# Check telemetry
echo ""
echo "## Telemetry Status"
echo ""

LOGS_DIR="$PROJECT_DIR/.logs"

if [ -d "$LOGS_DIR/prompts" ]; then
    PROMPT_COUNT=$(find "$LOGS_DIR/prompts" -name "*.jsonl" -exec cat {} \; 2>/dev/null | wc -l | tr -d ' ')
    echo "Prompts logged: $PROMPT_COUNT"
else
    echo "Prompts: No data (run setup first)"
fi

if [ -d "$LOGS_DIR/tools" ]; then
    TOOL_COUNT=$(find "$LOGS_DIR/tools" -name "*.jsonl" -exec cat {} \; 2>/dev/null | wc -l | tr -d ' ')
    echo "Tool calls logged: $TOOL_COUNT"
else
    echo "Tool calls: No data"
fi

if [ -d "$LOGS_DIR/decisions" ]; then
    DECISION_COUNT=$(find "$LOGS_DIR/decisions" -name "*.jsonl" -exec cat {} \; 2>/dev/null | wc -l | tr -d ' ')
    echo "Decisions logged: $DECISION_COUNT"
else
    echo "Decisions: No data"
fi

if [ -d "$LOGS_DIR/feedback" ]; then
    FEEDBACK_COUNT=$(find "$LOGS_DIR/feedback" -name "*.jsonl" -exec cat {} \; 2>/dev/null | wc -l | tr -d ' ')
    echo "Feedback entries: $FEEDBACK_COUNT"
else
    echo "Feedback: No data"
fi

echo ""
echo "For full scoring and insights, install: pip install agentic-retrospective"

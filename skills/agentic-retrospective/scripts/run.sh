#!/bin/bash
# Retro - Run retrospective analysis
# Usage: run.sh [--since "date"] [--until "date"] [--json] [--verbose]

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TOOL_DIR="$SCRIPT_DIR/../../../../tools/retro"

# Check if tool is built
if [ -f "$TOOL_DIR/dist/cli.js" ]; then
    node "$TOOL_DIR/dist/cli.js" run "$@"
else
    # Fallback: basic git analysis
    echo "Agentic Retrospective (fallback mode)"
    echo "======================================"
    echo ""

    SINCE="${2:-2 weeks ago}"

    echo "## Git Activity"
    echo ""
    echo "Commits since $SINCE:"
    git log --oneline --since="$SINCE" 2>/dev/null | head -20 || echo "No git history"
    echo ""

    echo "## Contributors"
    git shortlog -sn --since="$SINCE" 2>/dev/null | head -10 || echo "No data"
    echo ""

    echo "## Files Changed"
    git diff --stat --since="$SINCE" HEAD~20 2>/dev/null | tail -10 || echo "No data"
    echo ""

    echo "## Decision Log"
    if [ -d ".logs/decisions" ]; then
        cat .logs/decisions/*.jsonl 2>/dev/null | tail -10 || echo "No decisions logged"
    else
        echo "No decision log found (.logs/decisions/)"
    fi
fi

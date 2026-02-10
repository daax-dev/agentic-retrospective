#!/usr/bin/env bash
# Run agentic retrospective analysis
# Usage: run-retrospective.sh [--since "date"] [--json] [--verbose]

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_ROOT="$(dirname "$SCRIPT_DIR")"
PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"

# Parse args
SINCE="2 weeks ago"
JSON_OUTPUT=false
VERBOSE=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --since) SINCE="$2"; shift 2 ;;
        --json) JSON_OUTPUT=true; shift ;;
        --verbose) VERBOSE=true; shift ;;
        *) shift ;;
    esac
done

echo "Agentic Retrospective"
echo "====================="
echo ""
echo "Analysis period: since $SINCE"
echo ""

# Git Analysis
echo "## Git Activity"
echo ""
COMMIT_COUNT=$(git log --oneline --since="$SINCE" 2>/dev/null | wc -l | tr -d ' ')
echo "Total commits: $COMMIT_COUNT"
echo ""

if [ "$COMMIT_COUNT" -gt 0 ]; then
    echo "### Recent Commits"
    git log --oneline --since="$SINCE" 2>/dev/null | head -15
    echo ""

    echo "### Contributors"
    git shortlog -sn --since="$SINCE" 2>/dev/null | head -10
    echo ""

    echo "### Files Most Changed"
    git log --since="$SINCE" --pretty=format: --name-only 2>/dev/null | sort | uniq -c | sort -rn | head -10
    echo ""

    # Fix-to-Feature ratio
    FIX_COMMITS=$(git log --oneline --since="$SINCE" --grep="fix" --grep="bug" --grep="patch" -i 2>/dev/null | wc -l | tr -d ' ')
    FEATURE_COMMITS=$((COMMIT_COUNT - FIX_COMMITS))
    if [ "$FEATURE_COMMITS" -gt 0 ]; then
        RATIO=$(echo "scale=1; $FIX_COMMITS / $FEATURE_COMMITS" | bc 2>/dev/null || echo "N/A")
        echo "### Fix-to-Feature Ratio"
        echo "Fix commits: $FIX_COMMITS"
        echo "Feature commits: $FEATURE_COMMITS"
        echo "Ratio: $RATIO (lower is better, target < 0.1)"
        echo ""
    fi
fi

# Telemetry Analysis
echo "## Telemetry Data"
echo ""

LOGS_DIR="$PROJECT_DIR/.logs"

if [ -d "$LOGS_DIR/prompts" ]; then
    PROMPT_COUNT=$(cat "$LOGS_DIR/prompts"/*.jsonl 2>/dev/null | wc -l | tr -d ' ')
    echo "Prompts logged: $PROMPT_COUNT"

    if [ "$PROMPT_COUNT" -gt 0 ] && [ "$VERBOSE" = true ]; then
        echo ""
        echo "### Prompt Complexity (sample)"
        tail -5 "$LOGS_DIR/prompts"/*.jsonl 2>/dev/null | head -10
    fi
else
    echo "Prompts: No data (run setup-project.sh first)"
fi

if [ -d "$LOGS_DIR/tools" ]; then
    TOOL_COUNT=$(cat "$LOGS_DIR/tools"/*.jsonl 2>/dev/null | wc -l | tr -d ' ')
    echo "Tool calls logged: $TOOL_COUNT"
else
    echo "Tool calls: No data"
fi

if [ -d "$LOGS_DIR/decisions" ]; then
    DECISION_COUNT=$(cat "$LOGS_DIR/decisions"/*.jsonl 2>/dev/null | wc -l | tr -d ' ')
    echo "Decisions logged: $DECISION_COUNT"

    if [ "$DECISION_COUNT" -gt 0 ]; then
        echo ""
        echo "### Recent Decisions"
        tail -5 "$LOGS_DIR/decisions"/*.jsonl 2>/dev/null
    fi
else
    echo "Decisions: No data"
fi

if [ -d "$LOGS_DIR/feedback" ]; then
    FEEDBACK_COUNT=$(cat "$LOGS_DIR/feedback"/*.jsonl 2>/dev/null | wc -l | tr -d ' ')
    echo "Feedback entries: $FEEDBACK_COUNT"

    if [ "$FEEDBACK_COUNT" -gt 0 ]; then
        echo ""
        echo "### Session Feedback Summary"
        if command -v python3 &> /dev/null; then
            cat "$LOGS_DIR/feedback"/*.jsonl 2>/dev/null | python3 -c "
import sys, json
entries = [json.loads(line) for line in sys.stdin if line.strip()]
if entries:
    alignments = [e.get('alignment', 0) for e in entries if 'alignment' in e]
    if alignments:
        print(f'Average alignment: {sum(alignments)/len(alignments):.1f}/5')
    rework = {'none': 0, 'minor': 0, 'significant': 0}
    for e in entries:
        r = e.get('rework_needed', 'none').lower()
        if r in rework: rework[r] += 1
    print(f'Rework: {rework}')
" 2>/dev/null || echo "(python3 required for summary)"
        fi
    fi
else
    echo "Feedback: No data (run micro-retro.sh after sessions)"
fi

echo ""
echo "---"
echo ""
echo "For detailed analysis, see references/fixing-telemetry-gaps.md"

#!/usr/bin/env bash
# claude-watch uninstaller
# Removes telemetry hooks (preserves collected data)

set -euo pipefail

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

info() { echo -e "${GREEN}[claude-watch]${NC} $1"; }
warn() { echo -e "${YELLOW}[claude-watch]${NC} $1"; }

SETTINGS_FILE="$PROJECT_DIR/.claude/settings.json"
CLAUDE_MD="$PROJECT_DIR/CLAUDE.md"

# 1. Remove hooks from settings.json
if [ -f "$SETTINGS_FILE" ]; then
    if command -v jq &> /dev/null; then
        info "Removing hooks from settings.json..."
        TEMP_FILE=$(mktemp)
        jq 'del(.hooks.UserPromptSubmit) | del(.hooks.PostToolUse) | if .hooks == {} then del(.hooks) else . end' "$SETTINGS_FILE" > "$TEMP_FILE"
        mv "$TEMP_FILE" "$SETTINGS_FILE"
    else
        warn "jq not found - please manually remove hooks from .claude/settings.json"
    fi
fi

# 2. Remove decision logging prompt from CLAUDE.md
if [ -f "$CLAUDE_MD" ]; then
    if grep -q "DECISION LOGGING" "$CLAUDE_MD" 2>/dev/null; then
        info "Removing decision logging prompt from CLAUDE.md..."
        # Remove the section between markers
        TEMP_FILE=$(mktemp)
        sed '/<!-- DECISION LOGGING START -->/,/<!-- DECISION LOGGING END -->/d' "$CLAUDE_MD" > "$TEMP_FILE"
        mv "$TEMP_FILE" "$CLAUDE_MD"
    fi
fi

info "Uninstallation complete!"
echo ""
warn "Log data preserved in .logs/ - delete manually if needed:"
echo "  rm -rf .logs/"

#!/bin/bash
# Audit Claude Code configuration against best practices

set -e

PROJECT_ROOT="${1:-.}"

echo "Auditing Claude Code configuration..."
echo ""

ERRORS=0
WARNINGS=0
INFO=0

# Check for CLAUDE.md
if [ -f "$PROJECT_ROOT/CLAUDE.md" ]; then
    echo "[INFO] CLAUDE.md found"
    INFO=$((INFO + 1))

    # Check for common sections
    if ! grep -q "## " "$PROJECT_ROOT/CLAUDE.md" 2>/dev/null; then
        echo "[WARNING] CLAUDE.md has no section headers"
        WARNINGS=$((WARNINGS + 1))
    fi
else
    echo "[ERROR] No CLAUDE.md found in project root"
    ERRORS=$((ERRORS + 1))
fi

# Check for .claude directory
if [ -d "$PROJECT_ROOT/.claude" ]; then
    echo "[INFO] .claude directory found"
    INFO=$((INFO + 1))

    # Check for hooks
    if [ -f "$PROJECT_ROOT/.claude/hooks.json" ]; then
        echo "[INFO] hooks.json configured"
        INFO=$((INFO + 1))
    fi

    # Check for settings
    if [ -f "$PROJECT_ROOT/.claude/settings.json" ]; then
        echo "[INFO] settings.json configured"
        INFO=$((INFO + 1))
    fi
fi

echo ""
echo "=== Audit Summary ==="
echo "Errors: $ERRORS"
echo "Warnings: $WARNINGS"
echo "Info: $INFO"

if [ $ERRORS -gt 0 ]; then
    exit 1
fi

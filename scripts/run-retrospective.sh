#!/bin/bash
# Run full retrospective analysis
# Requires npm package to be built/installed

set -e

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"

echo ""
echo "=== Agentic Retrospective ==="
echo ""

# Try global install first
if command -v agentic-retrospective &> /dev/null; then
    agentic-retrospective  "$@"
    exit 0
fi

# Try npx
if command -v npx &> /dev/null; then
    npx agentic-retrospective  "$@"
    exit 0
fi

# Fall back to direct node execution if in package directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PACKAGE_DIR="$(dirname "$SCRIPT_DIR")"

if [ -f "$PACKAGE_DIR/dist/cli.js" ]; then
    node "$PACKAGE_DIR/dist/cli.js"  "$@"
    exit 0
fi

echo "Error: agentic-retrospective not found"
echo ""
echo "Install via:"
echo "  npm install -g @daax-dev/retrospective"
echo ""
echo "Or build locally:"
echo "  npm install && npm run build && npm link"
exit 1

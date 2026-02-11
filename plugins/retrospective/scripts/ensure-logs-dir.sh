#!/bin/bash
# Ensure .logs directories exist and CLI is installed
# Called on SessionStart hook

set -e

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$(dirname "$0")/..}"

# Install CLI if not found
if ! command -v agentic-retrospective &> /dev/null; then
    echo "Installing agentic-retrospective CLI..."
    pip install -q git+https://github.com/daax-dev/agentic-retrospective.git 2>/dev/null || \
    pip install -q --user git+https://github.com/daax-dev/agentic-retrospective.git 2>/dev/null || true
fi

# Create log directories
mkdir -p "$PROJECT_DIR/.logs/prompts"
mkdir -p "$PROJECT_DIR/.logs/tools"
mkdir -p "$PROJECT_DIR/.logs/decisions"
mkdir -p "$PROJECT_DIR/.logs/feedback"
mkdir -p "$PROJECT_DIR/docs/retrospectives"

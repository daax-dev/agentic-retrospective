#!/usr/bin/env bash
# Setup project for agentic-retrospective telemetry
# Creates .logs/ directories, updates .gitignore, adds decision logging to CLAUDE.md

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_ROOT="$(dirname "$SCRIPT_DIR")"
PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

info() { echo -e "${GREEN}[agentic-retrospective]${NC} $1"; }
warn() { echo -e "${YELLOW}[agentic-retrospective]${NC} $1"; }

# 1. Create log directories
info "Creating log directories..."
mkdir -p "$PROJECT_DIR/.logs/prompts"
mkdir -p "$PROJECT_DIR/.logs/tools"
mkdir -p "$PROJECT_DIR/.logs/decisions"
mkdir -p "$PROJECT_DIR/.logs/feedback"
mkdir -p "$PROJECT_DIR/.logs/scripts"

# 2. Copy hook scripts to project for portability
info "Installing hook scripts..."
cp "$SCRIPT_DIR/log-prompt.sh" "$PROJECT_DIR/.logs/scripts/"
cp "$SCRIPT_DIR/log-tool.sh" "$PROJECT_DIR/.logs/scripts/"
cp "$SCRIPT_DIR/micro-retro.sh" "$PROJECT_DIR/.logs/scripts/"
chmod +x "$PROJECT_DIR/.logs/scripts/"*.sh

# 3. Add .logs to gitignore
if [ -f "$PROJECT_DIR/.gitignore" ]; then
    if ! grep -q "^\.logs/" "$PROJECT_DIR/.gitignore" 2>/dev/null; then
        echo ".logs/" >> "$PROJECT_DIR/.gitignore"
        info "Added .logs/ to .gitignore"
    else
        warn ".logs/ already in .gitignore"
    fi
else
    echo ".logs/" > "$PROJECT_DIR/.gitignore"
    info "Created .gitignore with .logs/"
fi

# 4. Add decision logging to CLAUDE.md
CLAUDE_MD="$PROJECT_DIR/CLAUDE.md"

DECISION_PROMPT='<!-- DECISION LOGGING START -->

## Decision Logging

When making significant decisions, log them to `.logs/decisions/YYYY-MM-DD.jsonl`:

```bash
echo '"'"'{"timestamp":"'"'"'$(date -u +%Y-%m-%dT%H:%M:%SZ)'"'"'","decision":"what","rationale":"why","decision_type":"one_way_door|two_way_door","actor":"human|agent"}'"'"' >> .logs/decisions/$(date +%Y-%m-%d).jsonl
```

**Log when:** Choosing architectures, selecting dependencies, making trade-offs, deviating from patterns.

<!-- DECISION LOGGING END -->'

if [ -f "$CLAUDE_MD" ]; then
    if grep -q "DECISION LOGGING" "$CLAUDE_MD" 2>/dev/null; then
        warn "Decision logging already in CLAUDE.md"
    else
        info "Adding decision logging to CLAUDE.md..."
        echo "" >> "$CLAUDE_MD"
        echo "$DECISION_PROMPT" >> "$CLAUDE_MD"
    fi
else
    info "Creating CLAUDE.md with decision logging..."
    echo "$DECISION_PROMPT" > "$CLAUDE_MD"
fi

info "Setup complete!"
echo ""
echo "Telemetry directories created:"
echo "  .logs/prompts/    - User prompts"
echo "  .logs/tools/      - Tool calls"
echo "  .logs/decisions/  - Decision records"
echo "  .logs/feedback/   - Session feedback"
echo "  .logs/scripts/    - Hook scripts"
echo ""
echo "Capture feedback:  bash .logs/scripts/micro-retro.sh"
echo "Run retrospective: bash scripts/run-retrospective.sh"

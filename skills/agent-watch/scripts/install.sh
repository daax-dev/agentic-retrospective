#!/usr/bin/env bash
# agent-watch installer
# Sets up telemetry hooks for retrospective data collection

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_DIR="$(dirname "$SCRIPT_DIR")"
PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

info() { echo -e "${GREEN}[agent-watch]${NC} $1"; }
warn() { echo -e "${YELLOW}[agent-watch]${NC} $1"; }
error() { echo -e "${RED}[agent-watch]${NC} $1" >&2; }

# 1. Create log directories
info "Creating log directories..."
mkdir -p "$PROJECT_DIR/.logs/prompts"
mkdir -p "$PROJECT_DIR/.logs/tools"
mkdir -p "$PROJECT_DIR/.logs/decisions"
mkdir -p "$PROJECT_DIR/.logs/recordings"
mkdir -p "$PROJECT_DIR/.logs/feedback"
mkdir -p "$PROJECT_DIR/.logs/scripts"

# 2. Copy hook scripts to project
info "Installing hook scripts..."
cp "$SCRIPT_DIR/log-prompt.sh" "$PROJECT_DIR/.logs/scripts/"
cp "$SCRIPT_DIR/log-tool.sh" "$PROJECT_DIR/.logs/scripts/"
cp "$SCRIPT_DIR/micro-retro.sh" "$PROJECT_DIR/.logs/scripts/"
chmod +x "$PROJECT_DIR/.logs/scripts/"*.sh

# 3. Add .logs to gitignore if not already present
if [ -f "$PROJECT_DIR/.gitignore" ]; then
    if ! grep -q "^\.logs/" "$PROJECT_DIR/.gitignore" 2>/dev/null; then
        echo ".logs/" >> "$PROJECT_DIR/.gitignore"
        info "Added .logs/ to .gitignore"
    fi
else
    echo ".logs/" > "$PROJECT_DIR/.gitignore"
    info "Created .gitignore with .logs/"
fi

# 4. Create .claude directory if needed
mkdir -p "$PROJECT_DIR/.claude"

# 5. Install or merge hooks into settings.json
SETTINGS_FILE="$PROJECT_DIR/.claude/settings.json"
HOOKS_TEMPLATE="$SKILL_DIR/templates/hooks.json"

if [ -f "$SETTINGS_FILE" ]; then
    # Check if hooks already exist
    if grep -q "agent-watch" "$SETTINGS_FILE" 2>/dev/null; then
        warn "Hooks already installed in settings.json"
    else
        # Merge hooks into existing settings
        info "Merging hooks into existing settings.json..."
        if command -v jq &> /dev/null; then
            # Use jq to merge if available
            TEMP_FILE=$(mktemp)
            jq -s '.[0] * .[1]' "$SETTINGS_FILE" "$HOOKS_TEMPLATE" > "$TEMP_FILE"
            mv "$TEMP_FILE" "$SETTINGS_FILE"
        else
            warn "jq not found - please manually merge hooks from templates/hooks.json"
            warn "Or install jq and re-run this script"
        fi
    fi
else
    # Create new settings.json with hooks
    cp "$HOOKS_TEMPLATE" "$SETTINGS_FILE"
    info "Created settings.json with hooks"
fi

# 6. Add decision logging prompt to CLAUDE.md
CLAUDE_MD="$PROJECT_DIR/CLAUDE.md"
PROMPT_TEMPLATE="$SKILL_DIR/templates/claude-md-prompt.md"

if [ -f "$CLAUDE_MD" ]; then
    if grep -q "DECISION LOGGING" "$CLAUDE_MD" 2>/dev/null; then
        warn "Decision logging prompt already in CLAUDE.md"
    else
        info "Adding decision logging prompt to CLAUDE.md..."
        echo "" >> "$CLAUDE_MD"
        cat "$PROMPT_TEMPLATE" >> "$CLAUDE_MD"
    fi
else
    info "Creating CLAUDE.md with decision logging prompt..."
    cat "$PROMPT_TEMPLATE" > "$CLAUDE_MD"
fi

# 7. Check for asciinema
if command -v asciinema &> /dev/null; then
    info "asciinema found - ready for session recording"
    info "Start recording with: asciinema rec .logs/recordings/\$(date +%Y%m%d-%H%M%S).cast"
else
    warn "asciinema not found - install for session recording:"
    warn "  brew install asciinema  # macOS"
    warn "  apt install asciinema   # Debian/Ubuntu"
    warn "  pip install asciinema   # Python"
fi

# 8. Create a convenience script for recording
cat > "$PROJECT_DIR/.logs/record.sh" << 'EOF'
#!/usr/bin/env bash
# Start an asciinema recording session
RECORDING_DIR="$(dirname "$0")/recordings"
FILENAME="$(date +%Y%m%d-%H%M%S).cast"
echo "Starting recording: $RECORDING_DIR/$FILENAME"
echo "Press Ctrl+D or type 'exit' to stop recording"
asciinema rec "$RECORDING_DIR/$FILENAME"
EOF
chmod +x "$PROJECT_DIR/.logs/record.sh"

info "Installation complete!"
echo ""
echo "Telemetry will be collected to:"
echo "  - .logs/prompts/    - User prompts"
echo "  - .logs/tools/      - Tool calls"
echo "  - .logs/decisions/  - Decision records"
echo "  - .logs/recordings/ - Terminal sessions"
echo ""
echo "Start a recording session with: .logs/record.sh"
echo "Run a retrospective with: bash skills/agentic-retrospective/scripts/run.sh"

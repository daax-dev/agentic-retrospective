#!/bin/bash
# Audit Claude Code configuration against best practices.
#
# Exit code:
#   0 - no errors (warnings/info still allowed)
#   1 - one or more errors

set -u

PROJECT_ROOT="${1:-.}"

echo "Auditing Claude Code configuration..."
echo ""

ERRORS=0
WARNINGS=0
INFO=0

err()  { echo "[ERROR] $1";   ERRORS=$((ERRORS + 1));   }
warn() { echo "[WARNING] $1"; WARNINGS=$((WARNINGS + 1)); }
info() { echo "[INFO] $1";    INFO=$((INFO + 1));       }

# -----------------------------------------------------------------------------
# CLAUDE.md checks
# -----------------------------------------------------------------------------
CLAUDE_MD="$PROJECT_ROOT/CLAUDE.md"
if [ ! -f "$CLAUDE_MD" ]; then
    err "No CLAUDE.md found in project root"
elif [ ! -r "$CLAUDE_MD" ]; then
    err "CLAUDE.md exists but is not readable"
else
    info "CLAUDE.md found"

    if ! grep -q "^## " "$CLAUDE_MD" 2>/dev/null; then
        warn "CLAUDE.md has no section headers"
    fi

    CLAUDE_LINES_RAW=$(wc -l < "$CLAUDE_MD" 2>/dev/null)
    WC_STATUS=$?
    CLAUDE_LINES=$(printf '%s' "$CLAUDE_LINES_RAW" | tr -d '[:space:]')
    if [ "$WC_STATUS" -ne 0 ]; then
        err "CLAUDE.md line count could not be determined"
    elif ! printf '%s' "$CLAUDE_LINES" | grep -qE '^[0-9]+$'; then
        err "CLAUDE.md line count could not be determined (wc output: '$CLAUDE_LINES')"
    elif [ "$CLAUDE_LINES" -gt 500 ]; then
        warn "CLAUDE.md is $CLAUDE_LINES lines (>500); consider splitting"
    fi
fi

# -----------------------------------------------------------------------------
# .claude directory checks
# -----------------------------------------------------------------------------
if [ -d "$PROJECT_ROOT/.claude" ]; then
    info ".claude directory found"

    if [ -f "$PROJECT_ROOT/.claude/hooks.json" ]; then
        info "hooks.json configured"
    fi

    if [ -f "$PROJECT_ROOT/.claude/settings.json" ]; then
        info "settings.json configured"
    fi
fi

# -----------------------------------------------------------------------------
# Skill SKILL.md checks
# -----------------------------------------------------------------------------
# Extract the frontmatter block (between the opening and closing "---" delimiters)
# and echo stdin-relative lines. Delimiters may have trailing spaces/tabs, and the
# first line may have a UTF-8 BOM. CRLF input is normalized before matching.
is_frontmatter_delimiter() {
    LC_ALL=C awk 'BEGIN { status=1 }
         NR == 1 {
             sub(/^\357\273\277/, "")
             sub(/\r$/, "")
             if ($0 ~ /^---[[:blank:]]*$/) { status=0 }
             exit
         }
         END { exit status }' "$1"
}

extract_frontmatter() {
    LC_ALL=C awk 'BEGIN{inside=0; seen=0}
         {
             if (NR == 1) { sub(/^\357\273\277/, "") }
             sub(/\r$/, "")
         }
         NR == 1 && $0 !~ /^---[[:blank:]]*$/ { exit }
         /^---[[:blank:]]*$/ {
             if (seen == 0) { inside=1; seen=1; next }
             else if (inside == 1) { inside=0; exit }
         }
         { if (inside == 1) print }' "$1"
}

has_closed_frontmatter() {
    LC_ALL=C awk 'BEGIN{inside=0; seen=0; closed=0}
         {
             if (NR == 1) { sub(/^\357\273\277/, "") }
             sub(/\r$/, "")
         }
         NR == 1 && $0 !~ /^---[[:blank:]]*$/ { exit 1 }
         /^---[[:blank:]]*$/ {
             if (seen == 0) { inside=1; seen=1; next }
             else if (inside == 1) { closed=1; exit }
         }
         END { exit closed ? 0 : 1 }' "$1"
}

# Get the value for a given top-level YAML key (simple scalar value only).
get_frontmatter_value() {
    # $1=file, $2=key
    extract_frontmatter "$1" | awk -v key="$2" '
        BEGIN { FS=":" }
        $1 == key {
            sub(/^[^:]*:[[:space:]]*/, "", $0)
            # strip surrounding quotes
            sub(/^"(.*)"$/, "\\1", $0)
            sub(/^'"'"'(.*)'"'"'$/, "\\1", $0)
            print
            exit
        }'
}

# Count lines in a SKILL.md body (everything after the closing frontmatter ---).
body_line_count() {
    LC_ALL=C awk 'BEGIN{inside=0; seen=0; closed=0; count=0}
         {
             if (NR == 1) { sub(/^\357\273\277/, "") }
             sub(/\r$/, "")
         }
         NR == 1 && $0 !~ /^---[[:blank:]]*$/ { exit }
         /^---[[:blank:]]*$/ {
             if (seen == 0) { inside=1; seen=1; next }
             else if (inside == 1) { inside=0; closed=1; next }
             else { count++; next }
         }
         { if (closed == 1) count++ }
         END { print count+0 }' "$1"
}

SKILLS_DIR="$PROJECT_ROOT/skills"
if [ -d "$SKILLS_DIR" ]; then
    # Use a glob so we stay POSIX-ish. Iterate at depth 2.
    for skill_md in "$SKILLS_DIR"/*/SKILL.md; do
        [ -f "$skill_md" ] || continue
        skill_rel="${skill_md#$PROJECT_ROOT/}"
        info "Auditing $skill_rel"

        # Require frontmatter block
        if ! is_frontmatter_delimiter "$skill_md"; then
            err "$skill_rel: missing YAML frontmatter (first line must be '---', with optional trailing spaces/tabs)"
            continue
        fi
        if ! has_closed_frontmatter "$skill_md"; then
            err "$skill_rel: frontmatter block missing closing '---'"
            continue
        fi

        FM=$(extract_frontmatter "$skill_md")
        if [ -z "$FM" ]; then
            err "$skill_rel: frontmatter block is empty or malformed"
            continue
        fi

        # name
        NAME=$(get_frontmatter_value "$skill_md" "name")
        if [ -z "$NAME" ]; then
            err "$skill_rel: frontmatter missing 'name'"
        else
            # lowercase letters, digits, hyphens only; <= 64 chars; no leading/trailing hyphen
            if ! printf '%s' "$NAME" | grep -qE '^[a-z0-9]([a-z0-9-]{0,62}[a-z0-9])?$'; then
                err "$skill_rel: name '$NAME' must contain lowercase letters/digits/hyphens, start and end with a letter/digit, and be <=64 chars"
            fi
        fi

        # description
        DESC=$(get_frontmatter_value "$skill_md" "description")
        if [ -z "$DESC" ]; then
            err "$skill_rel: frontmatter missing 'description'"
        else
            DESC_LEN=${#DESC}
            if [ "$DESC_LEN" -gt 1024 ]; then
                err "$skill_rel: description is $DESC_LEN chars (>1024)"
            fi

            # Third-person voice: check for first/second person pronouns in the
            # description only. Normalize punctuation to spaces first so trailing
            # punctuation is caught ("you." / "your," / "you?"), then pad with
            # spaces to avoid false positives inside words (e.g. "API" matching
            # " I "). Kept portable (no \b) for BSD/macOS + GNU/Linux grep.
            DESC_NORM=$(printf '%s' "$DESC" | LC_ALL=C tr -c "[:alnum:]' " ' ' | LC_ALL=C tr '[:upper:]' '[:lower:]')
            DESC_PADDED=" $DESC_NORM "
            if printf '%s' "$DESC_PADDED" | grep -qE " (i|i'm|i've|i'd|i'll|im|ive|id|ill|we|we're|we've|we'd|we'll) "; then
                warn "$skill_rel: description uses first-person voice; prefer third person"
            fi
            if printf '%s' "$DESC_PADDED" | grep -qE " (you|your|you're|you've|you'd|you'll|yours) "; then
                warn "$skill_rel: description uses second-person voice; prefer third person"
            fi
        fi

        # Body line count (<= 500)
        BODY_LINES=$(body_line_count "$skill_md")
        if [ "$BODY_LINES" -gt 500 ]; then
            err "$skill_rel: body is $BODY_LINES lines (>500); split into references/"
        fi
    done
fi

# -----------------------------------------------------------------------------
# AGENTSKILLS.md duplication check
# -----------------------------------------------------------------------------
if [ -f "$PROJECT_ROOT/AGENTSKILLS.md" ] && ls "$SKILLS_DIR"/*/SKILL.md >/dev/null 2>&1; then
    warn "AGENTSKILLS.md exists alongside skills/*/SKILL.md; ensure name+description stay in sync to avoid drift"
fi

# -----------------------------------------------------------------------------
# Summary
# -----------------------------------------------------------------------------
echo ""
echo "=== Audit Summary ==="
echo "Errors:   $ERRORS"
echo "Warnings: $WARNINGS"
echo "Info:     $INFO"

if [ "$ERRORS" -gt 0 ]; then
    exit 1
fi
exit 0

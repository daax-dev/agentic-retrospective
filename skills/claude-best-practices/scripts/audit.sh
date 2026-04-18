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
if [ -f "$CLAUDE_MD" ]; then
    info "CLAUDE.md found"

    if ! grep -q "^## " "$CLAUDE_MD" 2>/dev/null; then
        warn "CLAUDE.md has no section headers"
    fi

    CLAUDE_LINES=$(wc -l < "$CLAUDE_MD" | tr -d ' ')
    if [ "$CLAUDE_LINES" -gt 500 ]; then
        warn "CLAUDE.md is $CLAUDE_LINES lines (>500); consider splitting"
    fi
else
    err "No CLAUDE.md found in project root"
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
# Extract the frontmatter block (between the first two lines that are exactly "---")
# and echo stdin-relative lines.
extract_frontmatter() {
    awk 'BEGIN{inside=0; seen=0}
         /^---[[:space:]]*$/ {
             if (seen == 0) { inside=1; seen=1; next }
             else if (inside == 1) { inside=0; exit }
         }
         { if (inside == 1) print }' "$1"
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
    awk 'BEGIN{inside=0; seen=0; count=0}
         /^---[[:space:]]*$/ {
             if (seen == 0) { inside=1; seen=1; next }
             else if (inside == 1) { inside=0; next }
             else { count++; next }
         }
         { if (inside == 0 && seen == 1) count++ }
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
        FIRST_LINE=$(head -n 1 "$skill_md")
        if [ "$FIRST_LINE" != "---" ]; then
            err "$skill_rel: missing YAML frontmatter (first line must be '---')"
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
            # lowercase letters, digits, hyphens only; <= 64 chars
            if ! printf '%s' "$NAME" | grep -qE '^[a-z0-9-]{1,64}$'; then
                err "$skill_rel: name '$NAME' must match ^[a-z0-9-]{1,64}$ (lowercase/hyphens, <=64)"
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
            # description only. Surround with spaces on both sides to avoid
            # false positives (e.g. "API" matching " I ").
            DESC_PADDED=" $DESC "
            if printf '%s' "$DESC_PADDED" | grep -qE ' I | I'"'"''; then
                warn "$skill_rel: description uses first-person ('I'); prefer third person"
            fi
            if printf '%s' "$DESC_PADDED" | grep -qiE ' you | your '; then
                warn "$skill_rel: description uses second-person ('you'/'your'); prefer third person"
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

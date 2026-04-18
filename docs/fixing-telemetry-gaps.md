# Fixing Telemetry Gaps

When the `/retrospective` command reports telemetry gaps, follow these guides to enable the missing data collection.

---

## Gap: Missing Decision Logs

**Impact**: Cannot evaluate decision quality, boundary discipline, or one-way-door compliance.

### Quick Setup

```bash
# Create decision log directory
mkdir -p .logs/decisions

# Add to .gitignore if you want to keep logs local
echo ".logs/" >> .gitignore

# Or commit them for team visibility
git add .logs/decisions/.gitkeep
```

### Logging Decisions

#### Option 1: Manual Logging (Simplest)

Add this to your CLAUDE.md or workflow documentation:

```markdown
## Decision Logging

When making significant decisions, log them:

\`\`\`bash
echo '{"ts":"'$(date -u +%Y-%m-%dT%H:%M:%SZ)'","decision":"<what>","rationale":"<why>","context":"<file or PR>"}' >> .logs/decisions/$(date +%Y-%m-%d).jsonl
\`\`\`
```

#### Option 2: Using the Decision Template

Create a shell function in your `.bashrc` or `.zshrc`:

```bash
log-decision() {
  local decision="$1"
  local rationale="$2"
  local context="${3:-}"
  local category="${4:-other}"

  mkdir -p .logs/decisions

  cat >> ".logs/decisions/$(date +%Y-%m-%d).jsonl" << EOF
{"ts":"$(date -u +%Y-%m-%dT%H:%M:%SZ)","decision":"$decision","rationale":"$rationale","context":"$context","category":"$category"}
EOF

  echo "✅ Decision logged"
}

# Usage:
# log-decision "Chose React over Vue" "Team expertise and ecosystem" "docs/adr/001-frontend.md" "architecture"
```

#### Option 3: Pre-Commit Hook (Recommended for Teams)

Create `.git/hooks/pre-commit`:

```bash
#!/bin/bash

# Check if any architecture-changing files were modified
SIGNIFICANT_CHANGES=$(git diff --cached --name-only | grep -E "(package\.json|Dockerfile|\.env|schema|migration)" | head -1)

if [ -n "$SIGNIFICANT_CHANGES" ]; then
  # Check if there's a recent decision log entry
  TODAY=$(date +%Y-%m-%d)
  DECISION_FILE=".logs/decisions/$TODAY.jsonl"

  if [ ! -f "$DECISION_FILE" ] || [ "$(wc -l < "$DECISION_FILE")" -eq 0 ]; then
    echo "⚠️  Significant change detected but no decision logged today."
    echo ""
    echo "Consider logging your decision:"
    echo "  log-decision \"What was decided\" \"Why\" \"Related file\""
    echo ""
    echo "Or skip with: git commit --no-verify"
  fi
fi
```

### What to Log

**Always log (one-way-door decisions)**:
- Database schema changes
- API contract changes
- Authentication/authorization model changes
- New external dependencies with broad permissions
- Data model changes affecting PII
- Architectural pattern changes

**Optionally log (two-way-door decisions)**:
- Library choices within established patterns
- UI component selections
- Configuration changes
- Refactoring approaches

### Validation

Test your setup:

```bash
# Create a test decision
echo '{"ts":"2024-01-15T10:00:00Z","decision":"Test decision","rationale":"Testing setup"}' >> .logs/decisions/$(date +%Y-%m-%d).jsonl

# Verify it parses
cat .logs/decisions/*.jsonl | head -1 | python3 -m json.tool

# Run retrospective to confirm detection
/retrospective --from HEAD~5
```

---

## Gap: Missing Agent Logs

**Impact**: Cannot analyze human-agent collaboration patterns, inner loop health, or scope drift.

### For Claude Code

Claude Code stores conversation logs automatically. To enable access:

```bash
# Claude Code logs location (macOS)
CLAUDE_LOGS=~/.claude/logs

# Create symlink to your project (optional, for convenience)
mkdir -p .logs
ln -s "$CLAUDE_LOGS" .logs/agents

# Or copy relevant logs
cp -r "$CLAUDE_LOGS"/* .logs/agents/
```

**Note**: Claude Code logs may contain sensitive information. Review before committing.

### For Aider

Aider logs conversations by default:

```bash
# Aider logs location
AIDER_LOGS=~/.aider/logs

# Symlink or copy
mkdir -p .logs/agents
ln -s "$AIDER_LOGS" .logs/agents/aider
```

### For Custom Agents

If using custom AI agents, output JSONL format:

```json
{"ts":"2024-01-15T10:00:00Z","type":"prompt","content":"User request..."}
{"ts":"2024-01-15T10:00:05Z","type":"tool_call","tool":"grep","args":{"pattern":"TODO"},"result":"..."}
{"ts":"2024-01-15T10:00:10Z","type":"response","content":"Agent response..."}
```

### Privacy Considerations

Agent logs often contain:
- Code snippets
- Error messages
- Internal discussion

Consider:
1. Adding `.logs/agents/` to `.gitignore`
2. Using a separate private repo for logs
3. Redacting sensitive content before analysis

---

## Gap: Missing CI Results

**Impact**: Cannot analyze build success rates, test reliability, or deployment frequency.

### GitHub Actions

Export workflow run results:

```bash
# List recent workflow runs
gh run list --limit 50 --json conclusion,createdAt,name,headBranch > .logs/ci/github-runs.json

# Get specific run details
gh run view <run-id> --json jobs,steps > .logs/ci/run-<id>.json
```

### GitLab CI

```bash
# Export pipeline data
gitlab-ci export --project <id> --output .logs/ci/
```

### Generic CI

Create a post-build script that outputs:

```json
{
  "ts": "2024-01-15T10:00:00Z",
  "pipeline": "ci-main",
  "status": "success",
  "duration_seconds": 180,
  "stages": [
    {"name": "lint", "status": "success", "duration": 30},
    {"name": "test", "status": "success", "duration": 120},
    {"name": "build", "status": "success", "duration": 30}
  ],
  "test_results": {
    "total": 234,
    "passed": 230,
    "failed": 0,
    "skipped": 4
  }
}
```

---

## Gap: Missing Test Results

**Impact**: Cannot analyze test coverage, flakiness, or inner loop completeness.

### pytest (Python)

```bash
# Generate JUnit XML output
pytest --junitxml=test-results/pytest.xml

# Generate JSON output
pytest --json-report --json-report-file=test-results/pytest.json
```

Add to your workflow:

```yaml
# .github/workflows/test.yml
- name: Run tests
  run: pytest --junitxml=test-results/pytest.xml

- name: Upload test results
  uses: actions/upload-artifact@v4
  with:
    name: test-results
    path: test-results/
```

### Jest (JavaScript)

```bash
# Generate JUnit XML
jest --reporters=default --reporters=jest-junit

# Configure in jest.config.js
module.exports = {
  reporters: [
    'default',
    ['jest-junit', { outputDirectory: 'test-results' }]
  ]
};
```

### Go

```bash
# Generate JSON output
go test -json ./... > test-results/go-test.json

# Or use gotestsum for better formatting
gotestsum --junitfile test-results/junit.xml
```

### Generic Test Results

Output JSONL format:

```json
{"ts":"2024-01-15T10:00:00Z","suite":"auth","test":"login_success","status":"pass","duration_ms":45}
{"ts":"2024-01-15T10:00:00Z","suite":"auth","test":"login_invalid_password","status":"pass","duration_ms":32}
{"ts":"2024-01-15T10:00:00Z","suite":"api","test":"rate_limit","status":"skip","reason":"requires redis"}
```

---

## Gap: Missing Security Scan Results

**Impact**: Cannot analyze security posture or dependency vulnerabilities.

### Trivy (Container/Dependency Scanning)

```bash
# Scan and output JSON
trivy fs --format json --output .logs/security/trivy.json .

# Or for container images
trivy image --format json --output .logs/security/trivy-image.json myapp:latest
```

### npm audit (Node.js)

```bash
npm audit --json > .logs/security/npm-audit.json
```

### pip-audit (Python)

```bash
pip-audit --format json > .logs/security/pip-audit.json
```

### Generic Security Results

Output format:

```json
{
  "ts": "2024-01-15T10:00:00Z",
  "scanner": "trivy",
  "findings": [
    {
      "id": "CVE-2024-1234",
      "severity": "high",
      "package": "lodash",
      "version": "4.17.20",
      "fixed_in": "4.17.21"
    }
  ],
  "summary": {
    "critical": 0,
    "high": 1,
    "medium": 3,
    "low": 5
  }
}
```

---

## Verification Checklist

After setting up data collection, verify with:

```bash
# Run retrospective with verbose output
/retrospective --from HEAD~10

# Check data completeness in output
# Should show improved percentage
```

Expected improvements:

| Before | After | Gap Fixed |
|--------|-------|-----------|
| 20% (1/5) | 40% (2/5) | +Decision logs |
| 40% (2/5) | 60% (3/5) | +Agent logs |
| 60% (3/5) | 80% (4/5) | +CI results |
| 80% (4/5) | 100% (5/5) | +Test results |

---

## Linking Issue Tracker Records to Git Commits (evidence_refs)

The `evidence_refs` field on a decision record links the decision to the
concrete artifacts that implement or justify it. Every ref must use one
of the recognized prefixes below — otherwise the ref is silently
orphaned and the retrospective will emit a `unrecognized_evidence_refs`
telemetry gap.

| Prefix      | Format                          | Links to                          |
|-------------|---------------------------------|-----------------------------------|
| `commit:`   | `commit:<full-or-short-hash>`   | A git commit (7-12 char or 40)    |
| `pr:`       | `pr:<number>`                   | A GitHub pull request             |
| `decision:` | `decision:<id>`                 | Another decision record           |
| `file:`     | `file:<relative-path>`          | A source file                     |
| `inferred:` | `inferred:<reason>`             | Evidence inferred (no artifact)   |

### Correlating an Issue Tracker Record

To link a decision to the commit that resolves a Linear/Jira/GitHub
issue, first resolve the issue to its git commit, then reference the
commit hash (not the issue ID) in `evidence_refs`:

```bash
# Find the commit that mentions the issue in its message
git log --oneline --grep="ISSUE-123"
# → a1b2c3d feat: adopt optimistic locking (ISSUE-123)
```

```json
{
  "ts": "2026-03-15T10:30:00Z",
  "decision": "Adopted optimistic locking for inventory updates",
  "rationale": "Reduces contention under concurrent write load",
  "actor": "human",
  "decision_type": "two_way_door",
  "evidence_refs": ["commit:a1b2c3d", "pr:47"]
}
```

**Common mistake**: Using raw issue IDs like `"ISSUE-123"` or
`"claw-abc"` directly in `evidence_refs`. These have no recognized
prefix and are silently orphaned. Always resolve to a `commit:` or
`pr:` reference before logging.

### What happens when refs are unrecognized

Starting in v0.1.4, the runner emits a stderr warning like:

```
[WARN] 2 evidence_ref(s) have unrecognized format and will be orphaned:
  - decision dec-2026-03-15: "ISSUE-123"
  - decision dec-2026-03-15: "claw-abc"
  Valid formats: commit:<hash>, pr:<number>, decision:<id>, file:<path>, inferred:<reason>
```

and adds a `unrecognized_evidence_refs` entry to the report's
`data_completeness.gaps`. The warning goes to stderr so `--json` stdout
remains machine-parseable.

---

## Getting Help

If you encounter issues setting up telemetry:

1. Check the schema files in `schemas/`
2. Review example data in `examples/`
3. Open an issue in the repository

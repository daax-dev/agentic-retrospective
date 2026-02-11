# Agentic Retrospective Skill

**Daax Skill for Sprint/Cycle-Level Retrospectives**

A structured, evidence-based retrospective tool that analyzes human-agent collaboration, evaluates inner loop health, and produces actionable improvement recommendations.

## Overview

The Agentic Retrospective skill ingests:
- Code + diffs + PR metadata
- Agent traces (prompt/tool-call logs)
- Decision logs (JSONL)
- Test results, CI logs, security scan outputs (optional)

And produces:
- `retro.md` - Human-readable retrospective report
- `retro.json` - Machine-readable findings and scores
- `evidence_map.json` - Traceability between artifacts
- `alerts.json` - High-risk items requiring follow-up

## Installation

### As a Daax Skill (Recommended)

The skill is already included in Daax. Use it via:

```bash
/retro                    # Run retrospective for current sprint
/retro --from HEAD~50     # Custom git range
```

### Standalone Installation

```bash
# Install globally
npm install -g @daax/retro

# Or run directly
npx @daax/retro --help
```

### Claude Code Custom Command

Copy the skill command to your project:

```bash
mkdir -p .claude/commands/retro
cp skills/retro/commands/run.md .claude/commands/retro/run.md
```

## Usage

### Quick Start

```bash
# Run retrospective for last 2 weeks of work
/retro

# Run between tags
/retro --from v1.0.0 --to v1.1.0

# Run from specific commit hash to HEAD
/retro --from a1b2c3d --to HEAD

# Run between two commit hashes
/retro --from abc123 --to def456

# Run for specific sprint
/retro --sprint sprint-42

# Run with CI data
/retro --ci .github/workflows/ci.yml
```

### Command Options

| Option | Description | Default |
|--------|-------------|---------|
| `--from` | Git ref for sprint start (commit hash, tag, branch, relative ref) | `HEAD~100` or 2 weeks ago |
| `--to` | Git ref for sprint end (commit hash, tag, branch, relative ref) | `HEAD` |
| `--sprint` | Sprint identifier for report | Auto-generated |
| `--decisions` | Path to decision log JSONL | `.logs/decisions/` |
| `--logs` | Path to agent logs | `.logs/agents/` |
| `--ci` | Path to CI results | Auto-detect |
| `--output` | Output directory | `docs/retro/` |

### Supported Git Refs

The `--from` and `--to` options accept any valid git ref:

- **Commit hash (full)**: `a1b2c3d4e5f6789...`
- **Commit hash (short)**: `a1b2c3d`
- **Tags**: `v1.0.0`, `release-2024-01`
- **Branches**: `main`, `feature/auth`
- **Relative refs**: `HEAD~50`, `main~10`

## Data Sources

### Required (Minimum Viable Retrospective)

1. **Git History**
   - Automatically extracted from repository
   - Provides: commits, diffs, PRs, file changes

### Optional (Enhanced Fidelity)

2. **Decision Logs (JSONL)**
   - Location: `.logs/decisions/*.jsonl`
   - Schema: See [decision-schema.json](./schemas/decision-schema.json)
   - One JSON object per line, append-only

3. **Agent Logs**
   - Location: `.logs/agents/`
   - Formats supported: Claude Code logs, Aider logs, custom JSONL

4. **CI Results**
   - GitHub Actions, GitLab CI, CircleCI
   - Test results, coverage reports

5. **Security Scans**
   - SAST/SCA/SBOM outputs
   - Vulnerability reports

## Graceful Degradation

The skill is designed to **always produce useful output**, even with missing data:

| Data Source | If Missing | Skill Behavior |
|-------------|------------|----------------|
| Git history | ❌ Fatal | Cannot run without git |
| Decision logs | ⚠️ Warning | Reports "decision opacity" as finding, recommends instrumentation |
| Agent logs | ⚠️ Warning | Limits collaboration analysis, recommends logging |
| CI results | ℹ️ Info | Skips inner loop metrics, notes gap |
| Security scans | ℹ️ Info | Skips security posture section |

When data is missing, the skill:
1. Clearly documents the gap in the report
2. Adjusts confidence scores downward
3. Provides specific instructions to collect the missing data
4. Still produces a partial report with available information

## Report Structure

### Executive Summary (1 page)
- Planned vs delivered (scope drift, carryover)
- Quality signals (test pass rate, incidents)
- Collaboration health (human interrupts, agent autonomy)
- Top 3 wins, top 3 risks, top 3 recommended changes

### Sections
1. **Delivery & Outcome** - What shipped, DORA-ish metrics
2. **Code Quality & Maintainability** - Diff analysis, complexity
3. **Security & Compliance** - Dependency changes, controls
4. **Agent Collaboration (360°)** - Strengths, struggles, handoffs
5. **Inner Loop Health** - Test loop completeness
6. **Decision Quality** - One-way/two-way door discipline
7. **Action Items** - Prioritized improvements

### Scoring Rubrics (0-5 each)
- Delivery Predictability
- Test Loop Completeness
- Quality/Maintainability
- Security Posture
- Collaboration Efficiency
- Decision Hygiene

## Decision Log Schema

Each decision record (JSONL, one object per line):

```json
{
  "id": "dec-001",
  "ts": "2024-01-15T10:30:00Z",
  "sprint_id": "sprint-42",
  "actor": "human",
  "category": "architecture",
  "decision_type": "one_way_door",
  "summary": "Chose PostgreSQL over MongoDB for user data",
  "context": "docs/adr/001-database-choice.md",
  "options_considered": [
    {"option": "PostgreSQL", "pros": ["ACID", "familiar"], "cons": ["scaling"]},
    {"option": "MongoDB", "pros": ["flexible schema"], "cons": ["consistency"]}
  ],
  "chosen_option": "PostgreSQL",
  "rationale": "Strong consistency required for financial data",
  "risk_level": "high",
  "reversibility_plan": "Would require data migration, estimated 2 weeks",
  "owner": "jane@example.com",
  "followups": ["Create migration runbook"],
  "evidence_refs": ["commit:abc123", "pr:45"]
}
```

See [decision-schema.json](./schemas/decision-schema.json) for full schema.

## Setting Up Decision Logging

### Manual Logging

Add to your workflow (e.g., in CLAUDE.md):

```markdown
## Decision Logging

Log ALL architectural and significant decisions to `.logs/decisions/`:

\`\`\`bash
mkdir -p .logs/decisions
echo '{"timestamp":"$(date -u +%Y-%m-%dT%H:%M:%SZ)","decision":"...","rationale":"..."}' >> .logs/decisions/$(date +%Y-%m-%d).jsonl
\`\`\`
```

### Automated Hooks (Coming Soon)

Pre-commit hooks can enforce decision logging for certain file changes.

## Principles

1. **Evidence-Driven**: Every claim links to artifacts or is marked "inferred"
2. **Blameless**: Evaluate behaviors and systems, not people
3. **Balanced**: Highlight strengths AND weaknesses fairly
4. **Actionable**: Recommendations are implementable next sprint

## What This Skill Does NOT Do

- ❌ Rewrite history or "grade people" for punishment
- ❌ Invent rationales where none exist
- ❌ Recommend big rewrites without repeated failure evidence
- ❌ Generate 20+ action items (keeps it to ~5 meaningful ones)

## Integration with Daax

The retrospective skill integrates with Daax's core principles:

- **Everything is Recorded**: Leverages session recordings and decision logs
- **Continuous Feedback Loop**: Produces insights for both humans and agents
- **API-First**: All analysis available via JSON outputs

## Files Generated

```
docs/retro/
├── sprint-42/
│   ├── retro.md           # Human-readable report
│   ├── retro.json         # Machine-readable findings
│   ├── evidence_map.json  # Artifact traceability
│   └── alerts.json        # High-risk followups
```

## Contributing

See the main Daax contributing guide.

## License

Apache 2.0 - See LICENSE

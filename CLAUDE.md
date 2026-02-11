# Agentic Retrospective

Evidence-based sprint retrospectives for human-agent collaboration.

## Quick Start

```bash
# Run retrospective (uses last 2 weeks by default)
agentic-retrospective

# Or via npx
npx agentic-retrospective
```

## Decision Logging

Log decisions via the decisions directory:

```bash
# Create decision log
echo '{"what":"chose React","why":"team familiarity","type":"two_way_door","actor":"human"}' >> .logs/decisions/$(date +%Y%m%d).jsonl
```

**Log when:** Choosing architectures, selecting dependencies, making trade-offs.

## Commands

| Command | Description |
|---------|-------------|
| `agentic-retrospective` | Run full retrospective |
| `agentic-retrospective --from <ref>` | Analyze from specific git ref |
| `agentic-retrospective --quiet` | Suppress progress output |
| `agentic-retrospective --json` | Output JSON only |
| `agentic-retrospective feedback` | Provide feedback separately |

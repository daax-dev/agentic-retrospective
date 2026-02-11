<!-- DECISION LOGGING START -->

## Decision Logging

When making significant decisions, log them:

```python
from agentic_retrospective.commands.decision import log_decision
log_decision("what", "why", "one_way_door|two_way_door", "human|agent")
```

Or via CLI:
```bash
agentic-retrospective decision "what" --rationale "why" --type two_way_door
```

**Log when:** Choosing architectures, selecting dependencies, making trade-offs.

<!-- DECISION LOGGING END -->
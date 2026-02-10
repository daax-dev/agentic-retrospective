<!-- DECISION LOGGING START -->

## Decision Logging

When making significant decisions during development, log them to `.logs/decisions/YYYY-MM-DD.jsonl` using this format:

```json
{"timestamp":"ISO8601","decision":"what was decided","rationale":"why","type":"one-way-door|two-way-door","actor":"human|agent","context":"optional context"}
```

**Log decisions when:**
- Choosing between architectural approaches
- Selecting dependencies or libraries
- Making trade-offs (performance vs readability, etc.)
- Deviating from standard patterns
- Accepting or rejecting suggested changes

**Decision types:**
- `one-way-door`: Hard to reverse (schema changes, public API, data migrations)
- `two-way-door`: Easy to reverse (refactoring, internal implementation)

**Example:**
```bash
echo '{"timestamp":"'$(date -u +%Y-%m-%dT%H:%M:%SZ)'","decision":"Use Zod for validation","rationale":"Type inference and runtime validation in one library","type":"two-way-door","actor":"agent"}' >> .logs/decisions/$(date +%Y-%m-%d).jsonl
```

<!-- DECISION LOGGING END -->

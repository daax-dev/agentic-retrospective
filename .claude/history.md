# History — Decision and Reference Logging

All significant decisions and citable references log to disk as JSONL.
One JSON object per line. No prose, no markdown, no commentary inside the JSON.

This repo's own retrospective analyzers read `.logs/decisions/*.jsonl` to score Decision Hygiene — keeping these logs clean directly improves the tool's own metrics and serves as dogfooding.

---

## Decisions

**Location:** `.logs/decisions/<topic>.jsonl`

**Format:**
```json
{"id":"<topic>-NNN","date":"YYYY-MM-DD","decision":"One-sentence statement of what was decided","rationale":"Why","alternatives":"What was considered and rejected, and why","references":["https://..."]}
```

**Rules:**
- ID prefix matches the topic filename. IDs increment sequentially. Check the last entry before writing a new one.
- One decision per line. No embedded newlines — keep the file `jq -c` parseable.
- Log the decision before or immediately after acting on it. Not "later."
- Architectural decisions require operator approval before the log entry is written.

**What counts as a decision worth logging:**
- A choice between two or more viable options.
- A constraint, assumption, or non-obvious workaround being encoded.
- A tool, framework, library, or service being adopted or rejected.
- A scope boundary being set or changed.
- Any one-way-door action.

Routine code edits, typo fixes, and pure refactors do not require log entries.

---

## References

**Location:** `.logs/references/<topic>.jsonl`

**Format:**
```json
{"id":"ref-NNN","date":"YYYY-MM-DD","category":"official_docs|standard|article|repo|paper","title":"...","url":"...","relevance":"why this source supports the claim"}
```

**Rules:**
- Cite every external claim. No unverifiable statistics, no "studies show…" without a link.
- Primary authorities: official vendor docs, NIST, CIS, SLSA, DORA, OWASP, official RFCs.
- Not citations: Medium posts, Stack Overflow answers, LLM outputs, screenshots without a URL.
- If a source cannot be validated, state that explicitly. Do not pretend it was validated.

# PRD 04 — Waste & Efficiency Detection

**Tier:** 3. **Status:** Draft. **Depends on:** 01, 02, 03.

## Problem
Counting tokens shows where the fire is, not why it started. A retrospective needs actionable,
evidence-linked findings: specific patterns that wasted context or signalled inefficient
collaboration, each with a remediation.

## Capability
A registry of rule-based detectors that scan the normalized turns and emit `ClaudeFinding` records
(`docs/specs/claude-native-telemetry.md` §3): `{detector, severity, evidence, estimatedWasteTokens?,
dimension, remediation}`. Each detector is a small, independent, pure function with configurable
thresholds.

## Detectors (initial set)
| Detector | Pattern | Remediation hint |
|---|---|---|
| Giant tool output | A single tool result far above a byte/token threshold | Cap output; request narrower results |
| Repeated file reads | Same file read N+ times in a session | Read once; rely on cached context |
| Tool / Bash overuse | One tool dominates a session's calls | Batch or restructure the workflow |
| Thrash | Rapid alternation between a small set of files/tools | Step back and plan before editing |
| Error storm | A burst of tool errors in a short span | Fix root cause before retrying |
| Retry storm | Repeated near-identical failing calls | Add a stop condition; change approach |
| One-shot failure | High-cost turn that produced an immediately discarded result | Right-size the request |
| Skill over-firing | A skill triggers far more often than it produces value | Tighten the skill's trigger |
| Model substitution | Heavy task run on an under/over-powered model | Match model to task complexity |
| Cost outlier | A session/project far above the cohort baseline | Investigate the outlier turn |

## Behaviour
- **Interface:** `Detector.run(stats, baseline?) => Finding[]`. Detectors take normalized,
  aggregated stats (and an optional cohort baseline) and return findings; no I/O inside detectors.
- **Evidence:** every finding cites `sessionId + uuid` (or `toolUseId`) — never a vague claim.
- **Thresholds:** configurable; ship conservative defaults; document that defaults are uncalibrated
  on small samples and should be tuned.

## Data inputs
Normalized turns/tool-calls/subagents from PRD 01; attribution from PRD 03; cost from PRD 02.

## Acceptance criteria
- Each detector has a fixture that triggers it and one that does not (true/false positive control).
- Every emitted finding carries a resolvable evidence reference.
- Disabling a detector or changing its threshold via config changes output deterministically.

## Scoring dimensions
- **Collaboration Efficiency:** giant output, repeated reads, overuse, thrash, skill over-firing.
- **Quality & Maintainability:** error storm, one-shot failure.
- **Delivery Predictability:** model substitution, cost outlier.

## Risks
- Threshold calibration; ship as advisory until validated on a real cohort.

## Out of scope
Git-outcome correlation (PRD 05); asset utilization (PRD 06).

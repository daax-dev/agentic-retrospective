# PRD 06 — Configuration & Asset Utilization

**Tier:** 3. **Status:** Draft. **Depends on:** 01, 03.

## Problem
Installed agents, skills, slash-commands, and MCP servers are widely understood to consume context
budget through their definitions and tool schemas whether or not they are used — though the exact
per-prompt overhead is not directly observable in the session stream and must be treated as an
estimate until confirmed against the loaded system context. "Ghost assets" (installed but never
invoked) are a likely source of silent, recurring waste that token totals alone never reveal.

## Capability
Cross-reference the configured/installed asset inventory against what actually fired during the
sprint, and report utilization gaps.

## Behaviour
1. **Inventory.** Enumerate configured assets from local config:
   `~/.claude/agents/`, `~/.claude/skills/`, `~/.claude/commands/`, MCP servers from
   `settings.json`, and project `CLAUDE.md` includes (inventory §1).
2. **Invocation set.** From attribution (PRD 03), collect the set of agents/subagent-types, skills,
   commands, and MCP methods that actually fired in the window.
3. **Gap report.**
   - *Ghost assets:* installed but never invoked → candidates to prune or lazy-load.
   - *MCP coverage:* MCP servers/methods loaded vs invoked; flag large loaded-but-unused surfaces
     (deferred-tool inventories that bloat every prompt).
4. **Cost framing.** Where the per-prompt overhead of an asset can be estimated, attach an estimated
   recurring token cost to each ghost asset to prioritize pruning.

## Data inputs
Local config dirs (inventory §1); invocation set from PRD 03.

## Acceptance criteria
- A fixture with an installed-but-unused skill reports it as a ghost asset; an installed-and-used
  skill is not flagged.
- MCP loaded-vs-invoked report lists methods present in config but absent from the invocation set.
- Each ghost-asset finding cites the config source that declares it.

## Scoring dimensions
- **Collaboration Efficiency:** prune unused assets to cut recurring per-prompt overhead.

## Risks
- An asset unused in one sprint may be valuable in others; present as advisory, scoped to the window.
- Per-prompt overhead estimation is approximate without token-level accounting of system context.

## Out of scope
Detector findings on usage patterns (PRD 04) — this PRD is about *installed vs used*, not *how used*.

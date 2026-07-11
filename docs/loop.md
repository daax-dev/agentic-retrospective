# Loop

When you loop at the given interval — check in to ensure the goal is on track. Make
sure each iteration of the loop only has the needed context. When wrapping up a
session (or goal), or about to need to compact, focus on keeping the same objective
and leave a good "Hemingway bridge" for how to best start again — with updated,
specific feedback so you don't get the same result. Log all decisions and key things
to `.logs/` in jsonl format, always.

Always use a git worktree / branch name that contains the GH issue #. Do not ever
rename a branch.

## Coding

- Only update what's needed — be a minimalist.
- Don't add anything not specifically asked for.
- Don't just rewrite code unless completely necessary.
- Everything must be tested for input sanitization, and end-to-end, with a focus on
  any interface contracts.
- Unit test complex things (not for the sake of testing).
- Use idiomatic coding for the given language.

## Sandboxing

Use vagrant sandboxes (to isolate creation of a KVM/VM) — this is how you get root in
an ephemeral environment (and fully test). Use the vagrant skill plugin.

## Review

Always perform 3 rounds of review from an adversarial, objective agent (using codex,
non-Anthropic). Make sure it has write access, and gives honest & pragmatic feedback.
Fix everything before the next round.

Perform a round of premortem — completely evaluate what could go wrong, think of
operational resilience and edge cases — then fix.

## PR cycle

When ready for a PR: submit PR, wait for Copilot review (trigger it if needed). When
it comes back, close the PR — use the same branch, fix, and repeat this process. Do
not ever change branch names. Do not ever update a branch with an open PR. Do not
ever update a PR — always a new one.

This process repeats until GitHub Copilot explicitly says "generated no issues" —
then you are done and can merge to main.

A PR must NEVER fail any CI or EVER have a merge conflict. If it does, wait for
Copilot feedback, then fix all.

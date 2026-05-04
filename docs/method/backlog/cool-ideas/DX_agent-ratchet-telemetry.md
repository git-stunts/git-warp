---
id: DX_agent-ratchet-telemetry
blocked_by: []
blocks: []
feature: testing-quality
---

# Agent ratchet telemetry — per-commit snapshot of tsc/lint/tests

**Effort:** S

## Idea

This session ended with the agent manually reporting "tsc errors:
2530 → 1462" in the scorecard. That number came from the agent running
`npx tsc --noEmit 2>&1 | grep -c "error TS"` before and after each
slice and remembering the delta.

That's fragile. The agent can drop the baseline, forget to re-run, or
lose track across long sessions. The ratchet is supposed to be the
cycle's proof of progress — it shouldn't live in the agent's working
memory.

What if every commit on a cycle branch automatically recorded its
own ratchet snapshot?

```text
scripts/ratchet-snapshot.sh <commit-sha>
  → writes docs/method/ratchet/<cycle>/<sha>.json
  → { tsc: 1462, eslint_errors: 0, eslint_warnings: 0,
      tests_passed: 6797, tests_failed: 0, loc_source: 38512, ... }
```

And a companion tool:

```text
scripts/ratchet-delta.sh [<from-sha>] [<to-sha>]
  → prints the delta between two snapshots
  → auto-detects branch base when args omitted
```

The agent would run `ratchet-delta.sh` at session start, at each
commit, and at session end. The scorecard can read real numbers
instead of the agent's recollection.

## Why cool (agent-first angle)

- **Eliminates a whole class of agent-error.** No more "wait, what
  was the baseline?" moments.
- **Frees context budget.** The agent doesn't have to remember the
  ratchet numbers across turns — they're on disk.
- **Makes the ratchet auditable.** The user can see the delta per
  commit without reading a 50-message transcript.
- **Feeds into the SSTS conformance suite** (DX_ssts-conformance-suite)
  — the suite's output can be ratcheted too.
- **Supports parallel agents.** Multiple agents on worktree branches
  all record their own ratchet; a final merge compares.

## Implementation sketch

- Shell script (or tiny Node script) that runs tsc, eslint, vitest
  in a quick "count only" mode and emits JSON
- Pre-push hook entry: if on a cycle branch, snapshot before pushing
- Optional: integrate with `/handoff` flow so the handoff doc auto-
  populates the ratchet numbers

## Why agent-first

The ratchet is THE proof of cycle progress. Agents use it every
turn. Making it a persistent on-disk artifact instead of a
per-session agent responsibility reduces cognitive load, improves
accuracy, and makes multi-session cycles genuinely auditable.

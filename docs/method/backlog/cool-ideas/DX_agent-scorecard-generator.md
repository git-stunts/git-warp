---
id: DX_agent-scorecard-generator
blocked_by: []
blocks: []
feature: testing-quality
---

# Auto-generate the SSTS scorecard from git diff

**Effort:** S

## Idea

(Related to but distinct from `DX_ssjs-scorecard-precommit.md`, which
targets pre-commit hooks. This one targets the agent's end-of-turn
ritual.)

The user explicitly asked for an SSTS scorecard at the end of every
turn — a table of touched files with columns for LOC, ≤500, unknown,
as, any, @typedef, enum, multi-export, freeze, and status (🟢/🟡/🔴).

The agent composes this table manually. It's error-prone (missed
files, wrong LOC counts, wrong violation counts) and eats context
budget. The same scan can be done by a script in milliseconds.

```
scripts/agent-scorecard.sh [--format=bijou|markdown|json]
  → reads `git diff --name-only <base>..HEAD`
  → for each touched file, scans for SSTS violations:
      - LOC > 500 (source) / 800 (test) / 300 (bin)
      - `unknown` outside parser contexts
      - `as` / `as <Type>` assertions
      - ` any ` type usage
      - `@typedef` JSDoc blocks
      - `enum` declarations
      - multiple exported classes/symbols
      - missing `Object.freeze(this)` in value class constructors
  → emits the scorecard in the requested format
```

The `--format=bijou` variant emits a string the agent can embed
verbatim in chat (the bijou_table tool is great but parameterizing
it manually is a chore).

## Why cool (agent-first angle)

- **Eliminates scorecard drift.** No more agent-composed tables with
  stale LOC counts or missed violations.
- **Frees context budget.** The agent runs one command, pastes one
  block.
- **Enforces consistency across sessions.** Different agents see the
  same format.
- **Feeds the `/handoff` flow.** A handoff doc can include the full
  scorecard without the agent having to reconstruct it.
- **Catches the "touched but not converted" deferral automatically** —
  any `.js` file in the diff is automatically flagged 🔴 under the
  current cycle's rules.

## How this differs from DX_ssjs-scorecard-precommit.md

- Pre-commit hook blocks bad commits from landing (machine-enforced)
- Agent scorecard is an end-of-turn reporting tool for agents (human-
  readable summary)

They share a scanner library but serve different audiences. Both
should exist; this one is the agent-facing half.

## Implementation

- Node script using TypeScript's AST or just regex for the 90% case
- Lives in `scripts/agent-scorecard.ts` (once Phase 4 ships .ts scripts)
- Agents invoke via `Bash` tool or (eventually) a slash command

## Why agent-first

Agents compose the scorecard from memory today. Memory is the least
reliable place to store a ratchet signal. A 100-line script would be
authoritative, faster, and freed the agent's attention for the actual
engineering work.

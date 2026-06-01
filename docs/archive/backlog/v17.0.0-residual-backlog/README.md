# Archived v17.0.0 residual backlog

This directory is not a live backlog lane.

It preserves the shipped `v17.0.0` residual-work queue after the active
backlog lane was retired. Do not treat files here as release blockers
unless a note is explicitly copied or moved back into an active lane with
fresh frontmatter.

The full release-program ledger, including shipped milestones,
historical checklist state, and narrative context, now lives in
[docs/releases/v17.0.0/README.md](../../../releases/v17.0.0/README.md).

`v17.0.0` and the `v17.0.1` release repair have shipped. Notes preserved
here are historical residual work, not the active release plan.

Preserved does not mean irrelevant. This directory contains a mix of
completed-source cards, deferred future possibilities, and stale v17 launch
tails. Treat each note as source material that needs a current read before
reuse.

## Scope

`v17.0.0` is limited to:

- TypeScript migration
- streaming ORSets and shadow-trie materialization
- current-substrate modernization needed to ship that line

Echo-shaped graph-substrate convergence is deferred to
[`../../../method/backlog/v18.0.0/README.md`](../../../method/backlog/v18.0.0/README.md).
Observer, admission, and doctrine convergence are deferred to
[`../../../method/backlog/v19.0.0/README.md`](../../../method/backlog/v19.0.0/README.md).

## Practical rule

- Treat the `.md` notes in this directory as archived residual notes, not
  current release blockers.
- Do not assume archived notes are rejected. Do not assume they are active.
- Treat the release ledger in `docs/releases/v17.0.0/` as historical
  program context, not as backlog inventory.
- Rehome any note into an active lane before using it to block `v18.0.0` or
  later release work.

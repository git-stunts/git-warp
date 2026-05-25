# v17.0.0 backlog

This lane is the shipped `v17.0.0` residual-work queue.

The full release-program ledger, including shipped milestones,
historical checklist state, and narrative context, now lives in
[docs/releases/v17.0.0/README.md](../../../releases/v17.0.0/README.md).

`v17.0.0` and the `v17.0.1` release repair have shipped. Notes that remain in
this directory are not the active release plan; they are residual work that
needs future archive, rehome, or explicit pull decisions.

## Scope

`v17.0.0` is limited to:

- TypeScript migration
- streaming ORSets and shadow-trie materialization
- current-substrate modernization needed to ship that line

Echo-shaped graph-substrate convergence is deferred to
[`../v18.0.0/README.md`](../v18.0.0/README.md). Observer, admission,
and doctrine convergence are deferred to
[`../v19.0.0/README.md`](../v19.0.0/README.md).

## Practical rule

- Treat the `.md` notes in this directory as residual backlog, not current
  release blockers.
- Treat the release ledger in `docs/releases/v17.0.0/` as historical
  program context, not as backlog inventory.
- Use explicit frontmatter edges on note files over prose summaries
  when they disagree.
- Rehome any note before using it to block `v18.0.0` or later release work.

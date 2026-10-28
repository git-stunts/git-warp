# Strands

A strand is a named child Lane pinned to a worldline Lane coordinate. Writes
land on its overlay and remain outside admitted worldline truth until a reviewed
Settlement succeeds.

A strand is not a Git branch or worktree. The Runtime persists the strand's
base frontier, and pins the cone basis it forked at, so another process can
reopen the same bounded coordinate. Nothing about a strand needs a checkpoint
or a whole-state materialization.

## TypeScript

```ts
import { Runtime, type Intent } from '@git-stunts/git-warp';

declare const assignRole: Intent;

const runtime = await Runtime.open({
  at: './team-repo',
  writer: 'alice',
});

try {
  const users = await runtime.lane('users');
  const review = await runtime.fork(users, { name: 'review-auth' });

  await review.write(assignRole);

  // A later Runtime can reopen this persisted child.
  const reopened = await runtime.strand(users, { name: 'review-auth' });
  const preview = await runtime.previewSettlement({ source: reopened, target: users });
  const receipt = await runtime.settle(preview.plan);
} finally {
  await runtime.close();
}
```

`Runtime.fork()` accepts only `name` and forks at the parent's live
coordinate. Any other option, such as `at`, is rejected with
`E_RUNTIME_FORK_OPTIONS` before any strand ref changes. `Runtime.strand()`
also accepts only `name` and rejects anything else with
`E_RUNTIME_STRAND_OPTIONS` before reading the strand. Forking at a historical
coordinate is tracked in
[#972](https://github.com/git-stunts/git-warp/issues/972).

`Runtime.strand()` reopens a strand from its retained descriptor: its base
frontier, and the cone basis pinned at that frontier. A strand forked before
this release, which recorded a checkpoint instead, reopens from its base frontier
the same way.

## Reads, writes and saved Coordinates

Every strand read, write and content Observation runs on cone records, as a
worldline Lane's do ([Optic reads](optic-reads.md)):

- **Base.** `Runtime.fork()` captures one coordinate of the parent's cone basis
  and pins that basis clone-locally under
  `refs/warp/<lane>/cone/strands/<strand-id>/base`. Pinning writes one ref and no
  records. A clone without the pin, for example after the ref was deleted,
  refolds the base frontier once on the next read.
- **Overlay.** The strand's basis is that base with the patches of the strand's
  own writer chains (and of any braided read overlay) folded on top, published
  under `refs/warp/<lane>/cone/strands/<strand-id>/head`. Its record trie
  path-copies the base root, so every record the strand never touched stays
  shared with the base.
- **Writes** take their read-before-write (removals, content owner checks) from
  that overlay, and their clock from one head patch per strand tip. The
  published patch is folded into the overlay at once. A strand patch records no
  observed frontier; for [concurrent edits](cone-bounded-reads.md#concurrent-edits)
  it counts as having observed the strand's pinned base, so editing a base
  value in a strand is not a race, and strand writes are never admitted
  `plural`.
- **Saved Coordinates.** `captureCoordinate()` works on a strand Lane and returns
  a Coordinate over the overlay basis. Like a worldline Coordinate, its basis is
  retained under `refs/warp/<lane>/cone/retained`, so it survives
  `git gc --prune=now`.

`git warp repair --lane <lane> --strand <name> --action basis` advances a
strand's basis explicitly. Dropping a strand releases both of its cone refs.

## Settlement

A settlement plan binds frontiers, never a derived basis: the strand's base
frontier, the strand's own frontier (base plus its writer chains) and the
target's current frontier. The cone roots compared are recorded as evidence
only, so rebuilding a basis, or running the global checkpoint maintenance, with
no new patches leaves a preview and its plan unchanged.

A preview is `derived` when the source is ready and either

- the target has not moved since the fork, or
- the target moved, but every node and edge the strand's patches name (edge
  endpoints included) has the same join state in the target's current cone
  basis as in the strand's base. Edges another writer added to one of those
  nodes do not count as a change.

Otherwise it is an obstruction with `git-warp.settlement-common-basis-required`.
The policy digest names this rule
(`git-warp:settlement-policy/footprint-records/v1`). `settle()` recaptures the
same snapshot and refuses a plan whose source, target, proposal, law or policy
moved since the preview (`git-warp.settlement-stale-basis`); then it replays the
strand's intents onto the target through the target's cone basis.

Only the records of the strand's footprint are read; the check never
materializes either Lane.

## Limits

- Reopening a strand reads the strand's own patches once, to rebuild the
  intents a settlement replays. That cost grows with the strand's history, not
  with the parent graph.
- A strand created below a Lamport ceiling (an internal option no Runtime API
  sets) has no cone basis and is refused with `E_STRAND_CONE_CEILING`.
- A braided read overlay folds the head pinned when it was braided.

## Identity

A strand's name is a label. Its id is the sha256 of a genesis record: the
lane, the creating writer, a creation occurrence reserved from that writer's
lane counter, the name, and the base frontier digest. Two strands never share
an id, even when created from identical inputs, and renaming a strand keeps
its id. Within one clone a name is unique, and every strand operation accepts
either the name or the id.

Each writer that writes to a strand advances its own chain and mints its own
dots, spelled `@w.<writer>@s.<strand-id>`. Lane writers keep their bare
writer ids. A strand view reads every writer chain on the strand.

Settlement plans are Runtime-owned immutable values. A lookalike object or a
plan from another Runtime is rejected.

## CLI

```bash
git warp fork \
  --repo ./team-repo \
  --lane users \
  --writer alice \
  --name review-auth

git warp write \
  --repo ./team-repo \
  --lane users \
  --strand review-auth \
  --writer alice \
  --intent '{"kind":"property.set","subject":"user:alice","key":"role","value":"admin"}'

git warp settle preview \
  --repo ./team-repo \
  --source users \
  --strand review-auth \
  --target users \
  --writer alice \
  --out settlement.json

git warp settle apply \
  --repo ./team-repo \
  --writer alice \
  --plan settlement.json
```

The saved preview is a portable review artifact, not executable authority.
`apply` reopens the selected Lanes, derives a fresh Runtime-owned plan, and
compares its plan digest, frontiers, proposal, laws, and policy before settling.

## See also

- [v19 API](api/README.md)
- [CLI](cli.md)
- [Git substrate](git-substrate.md)

# Working Sets

**Status:** v1 substrate active.

Working sets give git-warp a durable way to pin explicit observation coordinates without assuming a Git worktree, a browser UI, or higher-level XYPH semantics.

## What a Working Set Is

A working set is a durable descriptor that records:

- graph name
- working-set ID
- pinned frontier snapshot
- optional Lamport ceiling
- optional owner/scope/lease metadata
- overlay identity plus a patch-log ref for divergent writes

A newly created working set still starts with an empty overlay:

- `overlay.kind = patch-log`
- `overlay.headPatchSha = null`
- `overlay.patchCount = 0`

That means a newly created working set reads exactly like its base observation until an overlay patch is committed.

## Truth Boundary

The authoritative pieces are:

- the working-set descriptor
- the pinned base observation coordinate
- the overlay patch-log ref and its patch chain

Materialized state is **derived only**:

- in-memory materializations are caches
- CAS or other cached snapshots are caches
- replay can be repeated from the descriptor coordinate

git-warp does **not** treat a materialized working-set snapshot as authoritative truth.

## Why This Is Not a Git Worktree Feature

Working sets are about graph coordinates, not filesystem copies.

v1 intentionally avoids:

- Git worktree churn
- branch-as-worldline assumptions
- TUI/web concepts
- XYPH governance meaning

This keeps the substrate honest and lets higher layers decide how to interpret or govern a pinned coordinate later.

## API Surface

Programmatic v1 surface:

```javascript
const ws = await graph.createWorkingSet({
  workingSetId: 'review-auth',
  owner: 'alice',
  scope: 'OAuth review',
  lamportCeiling: 12,
});

const descriptor = await graph.getWorkingSet('review-auth');
const all = await graph.listWorkingSets();
const state = await graph.materializeWorkingSet('review-auth');
const stateAtCeiling = await graph.materializeWorkingSet('review-auth', { ceiling: 12 });
const visiblePatches = await graph.getWorkingSetPatches('review-auth');
const provenanceShas = await graph.patchesForWorkingSet('review-auth', 'task:oauth');
const conflicts = await graph.analyzeConflicts({ workingSetId: 'review-auth' });

await graph.patchWorkingSet('review-auth', (p) => {
  p.setProperty('task:oauth', 'status', 'needs-review');
});

const builder = await graph.createWorkingSetPatch('review-auth');
builder.setProperty('task:oauth', 'owner', 'alice');
await builder.commit();

await graph.dropWorkingSet('review-auth');
```

Explicit coordinate replay is also available directly:

```javascript
const state = await graph.materializeCoordinate({
  frontier: descriptor.baseObservation.frontier,
  ceiling: descriptor.baseObservation.lamportCeiling,
});
```

## CLI Surface

The main CLI exposes the same substrate family directly:

```bash
git warp working-set create --id review-auth --owner alice --scope "OAuth review"
git warp working-set list
git warp working-set show review-auth
git warp working-set materialize review-auth --receipts
git warp working-set drop review-auth
```

The CLI manages descriptor lifecycle and replay. Overlay writes are available through the library API, not through a separate working-set patch DSL in the CLI.

`working-set` is intentionally a top-level family rather than a `debug` subcommand because it creates durable descriptor refs.

## Relationship to TTD

The Time Travel Debugger stays read-only:

- `seek` and `debug ...` inspect substrate facts
- `working-set ...` manages durable coordinates and overlay patch logs

Supported debugger topics can now inspect a working set directly with `--working-set <id>`:

- `debug timeline`
- `debug conflicts`
- `debug provenance`
- `debug receipts`

That read-side support changes the visible patch universe, not the reducer rules. `reduceV5` remains worldline-blind.

That boundary keeps the debugger from turning into a mutation channel while still letting higher layers build real fork/worldline behavior on top of working sets.

## Deferred from v1

Deferred from this slice:

- collapse/merge semantics
- worldline governance
- arbitrary higher-level meaning

Those may come later, but only after the pinned-coordinate substrate proves itself.

# Working Sets

**Status:** v1 substrate active, with braid foundation now active inside the working-set descriptor model.

Working sets are the substrate's speculative write lane. They are not a Git
worktree feature and they are not a governance engine.

Working sets give git-warp a durable way to pin explicit observation coordinates without assuming a Git worktree, a browser UI, or higher-level XYPH semantics.

## What a Working Set Is

A working set is a durable descriptor that records:

- graph name
- working-set ID
- pinned frontier snapshot
- optional Lamport ceiling
- optional owner/scope/lease metadata
- overlay identity plus a patch-log ref for divergent writes
- overlay writability for the target lane
- zero or more pinned braid support overlays

A newly created working set still starts with an empty overlay:

- `overlay.kind = patch-log`
- `overlay.headPatchSha = null`
- `overlay.patchCount = 0`
- `overlay.writable = true`
- `braid.readOverlays = []`

That means a newly created working set reads exactly like its base observation until an overlay patch is committed.

This is the important boundary:

- `WarpGraph` is still the lower-level substrate/session object
- observers are the preferred read-side abstraction
- working sets are the preferred speculative write abstraction

Higher layers should not need to reinvent worldline lanes above this substrate
primitive.

When a higher layer needs a read-only view over one speculative lane, it should
prefer binding an observer to the working set rather than rebuilding a parallel
read model above the descriptor.

## Truth Boundary

The authoritative pieces are:

- the working-set descriptor
- the pinned base observation coordinate
- the overlay patch-log ref and its patch chain
- any target-owned braid refs that pin support overlay heads

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
import {
  compareVisibleStateV5,
  createStateReaderV5,
  projectStateV5,
} from '@git-stunts/git-warp';

const ws = await graph.createWorkingSet({
  workingSetId: 'review-auth',
  owner: 'alice',
  scope: 'OAuth review',
  lamportCeiling: 12,
});

const descriptor = await graph.getWorkingSet('review-auth');
const all = await graph.listWorkingSets();
const braided = await graph.braidWorkingSet('review-auth', {
  braidedWorkingSetIds: ['hold-auth'],
  writable: false,
});
const state = await graph.materializeWorkingSet('review-auth');
const view = projectStateV5(state);
const reader = createStateReaderV5(state);
const task = reader.inspectNode('task:oauth');
const neighbors = reader.neighbors('task:oauth', 'outgoing');
const stateAtCeiling = await graph.materializeWorkingSet('review-auth', { ceiling: 12 });
const visiblePatches = await graph.getWorkingSetPatches('review-auth');
const provenanceShas = await graph.patchesForWorkingSet('review-auth', 'task:oauth');
const conflicts = await graph.analyzeConflicts({ workingSetId: 'review-auth' });
const compareToBase = await graph.compareWorkingSet('review-auth', {
  against: 'base',
  targetId: 'task:oauth',
});
const compareToLive = await graph.compareWorkingSet('review-auth', {
  against: 'live',
  targetId: 'task:oauth',
});
const compareToPeer = await graph.compareWorkingSet('review-auth', {
  against: { kind: 'working_set', workingSetId: 'review-auth-b' },
  targetId: 'task:oauth',
});

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
const view = projectStateV5(state);
const coordinateComparison = await graph.compareCoordinates({
  left: { kind: 'working_set', workingSetId: 'review-auth' },
  right: { kind: 'coordinate', frontier: descriptor.baseObservation.frontier },
  targetId: 'task:oauth',
  scope: {
    nodeIdPrefixes: {
      exclude: ['comparison-artifact:', 'collapse-proposal:'],
    },
  },
});
const stateOnlyComparison = compareVisibleStateV5(state, stateAtCeiling, {
  targetId: 'task:oauth',
});
```

`projectStateV5()` is the public helper for turning a materialized state into a
stable aggregate visible projection:

- `nodes`
- `edges`
- `props`

When higher layers need richer entity-local reads, `createStateReaderV5()` adds
stable helper methods over the same materialized truth:

- visible node existence
- node and edge properties
- neighbors
- content metadata
- node-local inspection via `inspectNode(...)`

Together these helpers give higher layers a substrate-clean way to inspect
working-set or coordinate state without depending on OR-Set internals.

Comparison stays in the same substrate lane. The new comparison helpers return:

- visible patch divergence between the selected coordinates
- visible node / edge / property delta summaries
- optional target-local node inspection for one entity ID
- deterministic comparison digests suitable for higher-layer artifact identity
- optional scoped visible-state facts over selected node-id families

They do **not** invent review, approval, or governance semantics.

When a higher layer needs a portable substrate fact rather than an in-process
result object, git-warp now exports that exact digest basis directly:

```javascript
import {
  exportCoordinateComparisonFact,
  exportCoordinateTransferPlanFact,
} from '@git-stunts/git-warp';

const comparisonFact = exportCoordinateComparisonFact(coordinateComparison);
const transferFact = exportCoordinateTransferPlanFact(
  await graph.planCoordinateTransfer({
    source: { kind: 'working_set', workingSetId: 'review-auth' },
    target: { kind: 'live' },
  }),
);
```

Those exports stay substrate-only:

- `factDigest` reuses the underlying substrate digest
- `canonicalFactJson` is deterministic and ready for higher-layer storage
- transfer-plan exports strip raw attachment bytes while preserving
  `contentOid` / `mime` / `size`

## CLI Surface

The main CLI exposes the same substrate family directly:

```bash
git warp working-set create --id review-auth --owner alice --scope "OAuth review"
git warp working-set list
git warp working-set show review-auth
git warp working-set materialize review-auth --receipts
git warp working-set compare review-auth --against live --target-id task:oauth
git warp working-set compare review-auth --against working-set:review-auth-b
git warp working-set transfer-plan review-auth --into live
git warp working-set drop review-auth
```

The CLI manages descriptor lifecycle and replay. Overlay writes are available through the library API, not through a separate working-set patch DSL in the CLI.

Braids use the same CLI family:

```bash
git warp working-set braid review-auth --support hold-auth
git warp working-set braid review-auth --support hold-auth --support audit-auth --read-only
git warp working-set braid review-auth --writable
```

`working-set braid` stays substrate-level:

- `--support <id>` pins one or more read-only support overlays by working-set ID
- `--read-only` disables writes to the target overlay without changing braid support IDs
- `--writable` re-enables the target overlay when the descriptor should keep accepting writes
- omitted `--support` values mean "keep no braided support overlays" for the updated descriptor

`working-set` is intentionally a top-level family rather than a `debug` subcommand because it creates durable descriptor refs.

Programmatic readers and the CLI inspect the same visible patch universe:

- library code can use `materializeWorkingSet()` plus `projectStateV5()` /
  `createStateReaderV5()`
- operators can use `working-set materialize` and the read-only debugger topics
  against the same pinned descriptor

## Relationship to TTD

The Time Travel Debugger stays read-only:

- `seek` and `debug ...` inspect substrate facts
- `working-set ...` manages durable coordinates and overlay patch logs

Supported debugger topics can now inspect a working set directly with `--working-set <id>`:

- `debug timeline`
- `debug conflicts`
- `debug provenance`
- `debug receipts`

When those topics inspect a working set, the debug payload/output can now
report the resolved backing descriptor context directly:

- base Lamport ceiling
- target overlay head SHA and patch count
- target overlay writability
- pinned braid support working-set IDs

Coordinate comparison is adjacent but separate:

- `working-set compare` is read-only, but it lives under `working-set` because it compares durable coordinates rather than acting as a single-observation debugger topic
- library code can use `compareWorkingSet()`, `compareCoordinates()`, or `compareVisibleStateV5()` over the same substrate truth
- library code can pass `scope: { nodeIdPrefixes: { include?, exclude? } }` when only selected node-id families should count toward visible-state fact digests or transfer planning
- library code can call `exportCoordinateComparisonFact()` when it needs to carry the exact comparison fact across a higher-layer boundary

Transfer planning is the next read-only substrate step:

- `working-set transfer-plan` extracts a deterministic candidate transfer from one visible patch universe onto another without mutating either side
- library code can use `planWorkingSetTransfer()` or `planCoordinateTransfer()` to get the same transfer digest, resolved coordinates, and operation list
- the same optional `scope` object filters transfer planning over the selected visible-state subset
- library code can call `exportCoordinateTransferPlanFact()` to get the same transfer fact in canonical JSON-safe form
- attach/clear content ops now lower through `PatchBuilderV2.clearContent()` / `clearEdgeContent()` and the matching `PatchSession` helpers, so higher layers do not need to write reserved `_content*` keys directly
- transfer ops stay substrate-factual:
  - add/remove node
  - add/remove edge
  - set node/edge property
  - attach node/edge content
  - clear node/edge content
- this is preparation for higher-layer settlement or collapse planning, not a built-in approval engine
- the CLI keeps it under `working-set` rather than `debug` because it plans durable-coordinate transfer rather than inspecting one coordinate in isolation

That read-side support changes the visible patch universe, not the reducer rules. `reduceV5` remains worldline-blind.

This matters more once braids exist: provenance, receipts, timelines, and
conflict traces are only operationally honest if operators can see which
braid-visible surface they actually inspected.

That boundary keeps the debugger from turning into a mutation channel while still letting higher layers build real fork/worldline behavior on top of working sets.

The intended direction is stronger than "saved coordinate plus overlay." A
working set is the durable substrate lane where higher layers can stage
candidate futures, inspect them, compare them, and later transfer/collapse one
chosen lane into a target worldline under policy that remains outside git-warp.

## Braid Foundation

The canonical git-warp term for co-present working-set composition is
**braid**, and the substrate foundation is now active.

A braid is not ordinary merge and not Git rebase. It is a way to keep one or
more working-set-derived effects visible together at the same observation
surface while the reducer continues to operate over an ordinary visible patch
universe.

The current braid descriptor shape is:

- base observation
- zero or more braided read-only overlays
- one target overlay, marked writable or read-only

The key substrate invariants are:

- support working sets must share the exact same pinned base observation as the target working set
- braided support overlays are pinned by head SHA at braid time rather than live-following another working set
- target-owned braid refs keep those pinned support heads reachable even if the source working set is later dropped
- analyzers and materializers decide which patches are visible
- debugger payloads and text rendering can surface the pinned braid support IDs and target overlay status directly, so braid-visible inspection stays auditable
- `reduceV5` stays deterministic and working-set/worldline blind

`compose`, `mount`, and `superpose` may still appear in explanatory prose, but
**braid** is the canonical git-warp term now.

## Deferred from v1

Deferred from this slice:

- collapse/merge semantics
- worldline governance
- arbitrary higher-level meaning
- higher-level braid settlement workflows
- richer braid-specific debugger affordances and examples

Those may come later, but only after the pinned-coordinate substrate proves itself.

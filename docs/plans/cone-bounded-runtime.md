# Cone-bounded Runtime: public reads and writes without whole-state materialization

Status: proposed design record for the cone-bounded Runtime goalpost (#1039). Baseline: main `6ba2e7eca` (package 20.0.0).

## Decision

No client-facing public application API may materialize the graph. Every `Lane.write`, every `Lane.observe`
Reading, every advanced `Coordinate`/`Optic` read and every content Observation is answered from the **causal cone
of the entities it touches**: the patches that wrote those entities, folded into small per-entity records. Work is
proportional to the touched entities and to the patches that are new since the clone last looked, never to total
graph size or total history.

This is the public-path realisation of the [streaming, indexed, recursive WARP](./streaming-indexed-recursive-warp.md)
decision ("Apply a patch by opening only records and pages named by its operations") for the operations an
application performs every second. It does not replace the retained-manifest, Roaring selection plane or recursive
graph work tracked by #824/#815/#816/#817; global questions (label scans, traversal, inventory, export) keep their
own plans and their own honest support rules.

## Why the current public path is not bounded

Audit of main `6ba2e7eca` (evidence by file and line in the goalpost issue):

- A reading basis can only be created by `git warp repair --action materialization`, which reduces the whole
  `WarpState` and stores it as one `state.cbor`; refresh fails once that passes the 5 MiB decoder bound (#1034,
  #962, #963). The default `checkpointPolicy` never fires through `Runtime` (#962).
- Every Observation enumerates every member of the checkpoint's property bundle, one per node, before its first
  Reading (#1036). Every Reading reloads and decodes the whole uncheckpointed tail and proves ancestry with one
  `git show` per tail commit (#1035).
- Neighbourhood reads and `edge.remove` obstruct because the checkpoint carries no per-edge live dots (#961, #1037).
- `node.remove`, content attach/clear existence checks and content Observations replay every writer's history from
  genesis, capped at 10,000 patches or 50,000 ops.
- Strand writes and reads reload base chains from genesis and reduce whole state.
- Settlement identity hashes the checkpoint SHA, so a refresh alone invalidates strand previews.

## Why a cone suffices

Every operation in the patch format names the element it changes:

| Op | Element(s) |
| --- | --- |
| `NodeAdd`, `NodeRemove`, `NodePropSet`, `BlobValue` | the node `node` (its OR-Set entry, lifecycle events, property registers) |
| `EdgeAdd`, `EdgeRemove`, `EdgePropSet` | the edge `(from, to, label)` (its OR-Set entry, birth/remove events, property registers); adjacency of `from` and `to` |

The join rules are per element: OR-Set add/remove touches one element's dots (remove names `observedDots` of that
element), LWW compares one register's EventIds, the node-wide clear is the node's own lifecycle, edge-property
visibility depends on that edge's birth/remove events, and edge visibility depends on the edge plus the liveness of
its two endpoints. So the state of an element is a function of the ops that name it, and a Reading is a function of
the records of the elements it asks about. The full `JoinReducer` is the specification: the cone engine reuses the
same `OpStrategy` implementations over a **cone workspace** (a `WarpState` hydrated with only the touched records),
and an equivalence oracle in the tests compares every entity against a full reduction.

Known limit, made explicit rather than hidden: a dot shared across elements (the #1022 duplicate-dot class) breaks
per-element tombstone locality. The cone engine refuses such a patch with a typed obstruction pointing at the
duplicate-dot repair, instead of guessing.

## Design

### Records

Records are runtime-backed domain values, keyed by the existing BLAKE3 route key of the entity id:

- `ConeNodeRecord`: live and tombstoned dots of the node, birth/clear/pending-remove lifecycle events, property
  registers (key → LWW register), and adjacency references: the set of edge keys ever added with this node as
  `from` (out) or `to` (in), paged by bounded count so hubs stay bounded.
- `ConeEdgeRecord`: live and tombstoned dots of the edge, birth and remove events, property registers.

Records hold no derived visibility; visibility is computed at read time from records (edge visible ⇔ edge alive ∧
both endpoints alive; property visible ⇔ register not stale against the owner's lifecycle).

### Basis

A `ConeBasis` is `(root, frontier)`: a record-trie root and, per writer, the last folded patch (sha, lamport). It is
clone-local and derived, like `checkpoints/head`: stored under `refs/warp/<lane>/cone/head`, never transferred,
rebuildable from writer chains. The trie is a git tree keyed by route-key prefix with record blobs at the leaves, so
an update rewrites only the paths to touched records and every untouched record is structurally shared.

### Folding (ingest)

`ConeIngest` advances a basis from frontier `F` to the current writer tips `F'`:

1. For each writer whose tip differs from `F`, list `(F_w, F'_w]` once with one bulk log.
2. Decode each new patch exactly once. Its footprint is the set of elements its ops name (plus endpoint nodes for
   edge ops, for adjacency).
3. Load only those records, hydrate a cone workspace, apply the patch through the existing op strategies, extract
   the changed records, and path-copy them into the trie.
4. Publish the new root and frontier with a compare-and-swap ref update; a losing racer re-reads and retries.

Cost: `O(new patches + touched records × trie depth)`. A clone that writes locally folds its own patch at commit
time, so the common case is one patch and a handful of records. A fetch of other writers' chains folds each received
patch once, on the next read or write.

Folding order: per writer in chain order; across writers any interleaving is valid because the per-element join is
commutative and idempotent. The oracle tests assert this by folding random interleavings.

### Reads

A `ConeWitnessLocator` implements the four locator calls the public optics make (`readNode`, `readNodeProperty`,
`readNeighborhood`, `readTraversal`):

- node / property: ingest to tips, load one record, answer.
- neighbourhood: ingest, load the node record, page its adjacency references, load those edge records and the
  neighbour node records for liveness. Degree-bounded; cursors page the adjacency.
- traversal: neighbourhood hops under the optic's declared limits; it stays refused for global discovery as today.

Receipts cite the cone basis (root, frontier) and the records read. Observations sharing a captured coordinate share
one basis.

### Writes

`Lane.write` ingests to tips, then reads the records it needs: `node.remove` and `edge.remove` take their observed
dots from the target record; content attach/clear checks owner liveness from the record. After the patch commits,
its own fold is applied immediately. `edge.remove` therefore admits through a bounded basis (#1037).

### Lifecycle

- `Runtime.open` needs no prior repair: an absent cone basis is the empty basis and folds forward on first use.
- `git warp repair --action materialization` is replaced, for the public path, by a bounded basis advance; the
  whole-state checkpoint remains available only as an explicitly global, streaming-budgeted maintenance operation.
- `Runtime.fork` and strand Lanes read the base through a cone basis pinned at the strand's base frontier, plus the
  strand's own patches folded on top.
- Settlement identity binds the base frontier, not a checkpoint SHA.

### Conflict visibility (follow-on in the same goalpost)

Each Lane patch already records `observedFrontier`. A register record can retain concurrent siblings (writes not
dominated by each other's observed frontier) at bounded cost, so a Reading can report `plural` and a write that
replaces a register it did not observe can report `conflict`. This is scheduled after the bounded path lands.

## Enforcement

- An architecture test installs throwing traps on `_materializeGraph`, whole-state checkpoint creation and full-history
  journal scans, then drives `Lane.write`, `Lane.observe`, `captureCoordinate` reads, content Observations and strand
  Lanes; any call fails the test.
- A cost witness drives a Reader-shaped workload (2k and 20k annotation threads, three writers) and asserts git
  processes and bytes decoded per save and per margins read are independent of graph size.
- The equivalence oracle: random multi-writer histories folded by the cone engine match a full reduction for every
  entity's liveness, properties and neighbourhood.

## Slice 1 implementation record

The core engine lives in `src/domain/services/cone/` behind two ports, `ConeRecordStorePort` and
`ConePatchFeedPort`, with Git adapters `GitConeRecordStoreAdapter` and `GitConePatchFeedAdapter`.

- **Strategy audit.** Every op's `mutate` touches only the element it names: OR-Set `add`/`remove`, one
  LWW register, and that element's birth, clear or remove event. Three reducer paths read wider state, and the
  cone avoids all three: receipt `outcome()` and diff `snapshot()`/`accumulate()` for removes scan the whole
  OR-Set by dot (`ReceiptBuilder` effective-removal checks, `DiffCalculator.aliveElementsForDots`), and
  `foldPatch` merges the global observed frontier. A fold applies patches with `applyFast` (mutate only), keeps
  the per-writer frontier in the basis instead, and leaves receipts to read-time evidence. The dead-property
  sweep runs only in GC, never during apply, so records keep every register and readers apply the staleness
  rules.
- **Tombstones per element.** The reducer's tombstone set is global per OR-Set; records keep the dots each
  element's removes named, including dots not yet added there. That is exact unless one dot tags, or is removed
  for, two elements. `ConeDotPage` records, per writer and 256 counters, which elements each dot was claimed by
  as owner or remover; a patch that makes a removed dot belong to two elements, in either arrival order,
  returns `ConeSharedDotObstruction` and stages nothing. A shared dot that is never removed stays foldable.
- **Adjacency.** An edge key joins `out` of `from` and `in` of `to` once, when its record is first created.
  Node records count registrations; edge key `i` lives on adjacency page `floor(i / 256)`, so appending
  touches the last page only and a hub's node record stays small.
- **Trie.** Records are blobs at `<family>/<r0r1>/<r2r3>/<route>` (families `n`, `e`, `d`, `a`), where
  `route` is the BLAKE3 route key of the record identity, the same routing `MaterializationPropertyProfile`
  uses for node ids. A write rewrites the blobs and directories on touched paths only. The head
  `refs/warp/<lane>/cone/head` points at a tree of the `frontier` blob and the `records` trie, published by
  compare-and-swap; it is clone-local and never transferred.
- **Ingest.** `ConeIngest.advance()` reads one bulk `git log --first-parent from..tip` per changed writer,
  decodes each new patch once, folds writers in id order and chains in order, and publishes all or nothing;
  a lost race retries, a writer whose tip does not descend from its folded position is reported as
  `ConeWriterDivergedObstruction`. `foldCommitted(entry, parentSha)` folds a just-committed local patch alone
  when the basis holds its parent.
- **Evidence.** A seeded fast-check oracle folds generated multi-writer histories (concurrent LWW, observed
  removes delivered before their adds, node clears and re-adds, legacy `PropSet`, random per-writer fold
  interleavings and commit points) and compares every entity's liveness, properties and neighbourhood with a
  full `reducePatches`. A real-repository test shows a second ingest of three patches costs the same Git
  processes after a 20-patch and a 120-patch history.

Known limits of slice 1: a lane whose history already holds a remove of a shared dot stays obstructed even
after `applyDotRepair`, because the repair appends patches and the old remove remains; record reads cost two
Git processes each (probe and blob), which a batched object reader would reduce; a writer whose tip is a
non-patch commit is re-listed on every advance.

## Slice 2 and 3 implementation record

Public worldline reads and read-before-writes now run on the cone engine.

- **Composition.** `RuntimeStorageServices` carries `coneRecords` and `conePatches` (Git adapters built by
  `GitCasRepositoryAdapter`, sharing the runtime's patch journal). `RuntimeHost` holds them, and each
  `WarpWorldline` owns one `ConeLaneBasis` (ingest plus reader) for its lane. Storage without cone services keeps
  the checkpoint-tail path.
- **Reads.** `OpticWitnessLocator` is the abstract locator both implementations extend. `ConeWitnessLocator`
  answers the four optic reads from a `ConeReadBasisSource`: `PinnedConeReadBasis` for a captured coordinate, or
  `LiveConeReadBasis`, which advances on each read. `WarpWorldline.captureReadCoordinate()` advances the lane
  once and returns a cone `WarpWorldlineCoordinate` (`checkpointSha: null`, `coneRoot`); every Observation, every
  `Timeline.tick()` and `captureCoordinate()` go through it, so all Readings of one Observation share one basis.
  Neighbourhoods read the node, its adjacency pages, incident edges and neighbour records, then page the visible
  edges canonically (`ConeNeighborhoodPage`, `ConeNeighborhoodCursor`). Witnesses are `ConeReadIdentity`
  (`kind: 'cone-read'`, root, frontier, record keys) under the new `cone-basis` posture. Content Observations
  read the owner's records through `ConeContentRead`.
- **Obstructions.** A fold obstruction becomes `ConeObstructedError` inside the runtime and an obstructed or
  underdetermined Receipt with a repair hint at the public surface (`ConeObstructionFailure`); it never falls
  back to a checkpoint or a materialization.
- **Writes.** `WriteRuntime` collects `ConeWriteTargets` (node and edge targets of removes and content intents) and
  calls `PatchBuilder.prepareConeWriteBasis`, which advances the cone only when there are targets, pins the
  write's observed frontier to the cone frontier, and captures a `ConeWriteBasis` from the targets' records:
  live dots and attached data for removals, liveness for content owners, live dots for `edge.remove`. A
  published write is folded with `foldCommitted`; a failed fold is left to the next advance.
- **Evidence.** Through the public Runtime on real repositories: reads right after writes with no checkpoint,
  across fetched clones; neighbourhoods after edge removes and endpoint removes; `edge.remove` admitted; a
  multi-writer `node.remove` observing exactly the live dots; content attach and read; shared-dot obstruction
  receipts. A trap test drives every intent kind, every Reading kind, both content observers and
  captured-coordinate optic reads with traps on `RuntimeHost` materialization, checkpoint creation and
  verification, the checkpoint-tail locator, `BoundedNodeRemovalBasis`, `ContentReadProjection` and history
  walks beyond one head; none fires. Git processes per Observation (24), `node.remove` (84), `edge.remove` (88)
  and blind write (69) are equal at 20 and 200 patches of history.

Known limits after slices 2 and 3: fork and strand Lanes (reads, writes, content) still use checkpoint-tail
bases and `Runtime.fork` still verifies or materializes a checkpoint; the first fold of a lane folds its whole
history and holds each writer range in memory; every write now pays its own fold (a blind write measured 69 Git
processes, constant in history; the fold's share was not measured separately); a neighbourhood read loads all of a node's incident edges; `node.remove` under the
default `warn` policy reads only the node record, so its warning does not count incident edges; `edge.remove` of
an edge added in the same atomic write still finds no dot to observe; a pinned coordinate keeps an old root only
in memory, so a `git gc --prune=now` can remove it; the entity admission inventory still scans history by design.

## Slices

1. Cone records, workspace, record trie adapter, basis ref and ingest, with the equivalence oracle.
2. Public reads through `ConeWitnessLocator` (property, node, neighbourhood, traversal, content Observations).
3. Public writes through cone records (`node.remove`, `edge.remove`, content owner checks) and own-patch folding.
4. Lifecycle: open without repair, bounded basis CLI, fork/strand/settlement on cone bases, materialization traps.
5. Showcase: example application and cost witness.
6. Conflict visibility.

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
- **Trie.** (Layout 1, replaced by layout 2 below.) Records are blobs at `<family>/<r0r1>/<r2r3>/<route>`
  (families `n`, `e`, `d`, `a`), where `route` is the BLAKE3 route key of the record identity, the same routing
  `MaterializationPropertyProfile` uses for node ids. A write rewrites the blobs and directories on touched
  paths only. The head `refs/warp/<lane>/cone/head` points at a tree of the `frontier` blob and the `records`
  trie, published by compare-and-swap; it is clone-local and never transferred.
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
Git processes each (probe and blob), which the storage record below removes; a writer whose tip is a
non-patch commit is re-listed on every advance.

## Storage layout 2 record

Profiling the annotations workload at 200 threads on the slice 1-3 store, a margins read (four Observations)
started 370 Git processes: 342 `ls-tree` probes from record reads and 28 from four ingest advances (a writer
listing, one `rev-parse` per writer and three processes per basis read). A one-patch save spent 41 of its 67
processes in the cone, one `ls-tree` per probed or listed directory and one `hash-object` per record blob,
and the batched bulk load wrote 10,369 loose objects (41 MiB, mostly 4 KiB filesystem blocks).

- **Reads.** `GitConeRecordStoreAdapter` walks tree objects through the history's long-lived
  `cat-file --batch-command` session (git-cas `readTree`, cached by tree id) and reads record blobs through
  the same session, so a record read starts no process. A basis read is one `rev-parse` of the head plus
  session reads; writer tips come from one `for-each-ref --format='%(objectname) %(refname)'`.
- **Layout 2.** Each family directory of the records root is an adaptive 16-way trie on the route's hex
  digits (`GitConeRecordTrie`): a directory is a bucket of record blobs named by their full route while at
  most 32 routes share its prefix, and a branch of digit directories otherwise. Records are only added or
  replaced, so the shape is a function of the set of routes, not of insertion order. No directory exceeds
  32 entries, so a touched record rewrites a few small trees instead of a 256-entry level.
- **Writes.** A `writeRecords` call of any size is one `git fast-import` program
  (`GitFastImportTreeScript`, `GitFastImportTreeWriter`): it grafts the current family trees, writes changed
  blobs inline, moves the records of a splitting bucket by blob id, and reads the new root back with
  `ls ""`; its throwaway commit is built on a branch the program resets, so no ref changes. Every changed
  directory is written once per call, and a fold session already writes once per run of patches. Git
  explodes a small fast-import pack into loose objects (`fastimport.unpackLimit`, default 100) and keeps a
  large one, so a save stays loose and a bulk fold lands in one pack. The basis head tree is written the
  same way.
- **Version marker.** Every head tree holds a `layout` blob naming layout 2. A head with no marker (layout
  1) or another marker is refused with `ConeRecordError` code `E_CONE_LAYOUT_UNSUPPORTED`; the basis is
  clone-local derived state, so the remedy is to delete the named head ref and fold again.
- **With slice 4.** The layout applies to every `ConeBasisHead`: the lane's `cone/head` and a strand's
  `cone/strands/<id>/base` and `cone/strands/<id>/head` are written by the same fast-import basis writer, carry
  the marker and are refused the same way (the refusal names the head's ref). The retained-bases tree
  (`cone/retained`, `r/<sequence>-<tree id>`) is read through the object session and written by one
  fast-import per retention; no cone path writes a blob or tree with `hash-object` or `mktree`, or probes one
  with `ls-tree`.
- **Doctrine note.** [Git performance](../topics/git-perf.md) assigns bulk object writing to git-cas. git-cas
  has no tree-edit write yet, and its blob-then-`mktree` path leaves every tree loose, which does not fit
  the 20,000-thread budget; the fast-import tree writer is adapter-local until git-cas owns that operation.

Cost witness (annotations example, three writers; `benchmarks/cone-showcase` on the showcase branch, run in
Docker):

| | 200 threads (before / after) | 2,000 threads (before / after) | 20,000 threads (after) |
| --- | --- | --- | --- |
| Bulk load, batched patches | 9.1 s / 1.0 s (15 patches) | 104.5 s / 13.2 s (123) | 254.5 s (1,203) |
| Repo after load | 41 / 3 MiB | 401 / 46 MiB | 575 MiB (before: over the 4 GiB budget) |
| One-patch save, p50 | 55 / 33 ms; 67 / 30 processes | 60 / 47 ms; 67 / 30 processes | 175 ms; 30 processes |
| Margins read, p50 | 289 / 32 ms; 384 / 8 processes | 287 / 36 ms; 370 / 8 processes | 65 ms; 8 processes |
| Cold open to first margins, p50 | 516 / 268 ms; 416 / 20 processes | 518 / 272 ms; 382 / 20 processes | 331 ms; 20 processes |

Process counts are flat in graph size; the cone's share of a save is 4 processes (`rev-parse`, two
`fast-import`, `update-ref`). The 20,000-thread save is slower only because the bulk load leaves one pack per
batched fold (1,203 packs), and every Git process pays for each pack it searches: in Docker, a one-shot
`cat-file -e` costs 0.28 ms with one pack, 0.69 ms with 123 and 4.46 ms with 1,230. After one
`git repack -a -d` (14 s; one 58 MiB pack), the same repository saves in 33-44 ms and reads margins in 53-65 ms.

Known limits of layout 2: git-warp starts no repository maintenance, so a bulk import's packs accumulate until
`git gc` or `git repack` runs, and saves slow by about 4 ms per 1,000 packs per process; a save writes about 25
loose objects (about 100 KiB of filesystem blocks before `git gc`); each `fast-import` leaves one unreachable
commit object.

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

## Slice 4 implementation record

Every client-facing entry point now runs on cone bases: `Runtime.fork`, every strand Lane write and Observation,
strand content Observations, `captureCoordinate` on both Lane kinds, `previewSettlement`, `settle`, and the
`repair --action basis` CLI path. None verifies, creates or loads a checkpoint, materializes a lane or a strand,
or walks history.

- **Named heads.** A basis is published under a `ConeBasisHead`: the lane's `cone/head`, a strand's pinned base
  `cone/strands/<id>/base` and the strand's own `cone/strands/<id>/head`. `ConeIngest` advances one
  `ConeBasisScope` (head, writer tips, seed): `LaneConeScope` follows the lane's writer refs from the empty
  basis, `StrandBaseConeScope` folds a fixed base frontier, and `StrandConeScope` seeds from the strand base and
  follows the strand's tips (`StrandConeTips`: base frontier, the head of each strand writer chain and each
  braided read overlay, read from the descriptor and the chain head refs without walking a chain). Strand chains
  are named by their mint ids (`@w.<writer>@s.<strand>`), which `ConeFrontier` now accepts.
- **Fork.** `Runtime.fork` captures one lane coordinate (`captureReadCoordinate`) and the strand is created with
  that coordinate's frontier as its base frontier; `StrandConeBases.pinBase` publishes the captured basis under
  the strand's base head. Pinning writes one ref and no records. The descriptor records no checkpoint. A strand
  whose pin is missing refolds its base frontier once.
- **Strand reads and writes.** A strand Lane's reads, content reads and coordinates use the strand basis; its
  record trie path-copies the base root, so untouched records stay shared (asserted by the strand-overlay oracle
  and by a real-repository test). Strand writes use `StrandPatchService.patchOnConeWithEvidence`: the builder
  takes its clock and context from one head patch per strand tip, its read-before-write from the strand basis
  (`prepareConeWriteBasis` over the strand's `ConeLaneBasis`), and the published patch is folded into the strand
  basis at once.
- **Settlement.** Identity binds frontiers only (base, strand and target); the three compared cone roots are
  evidence handles. A preview is `derived` when the target has not moved since the fork, or moved without
  changing any node or edge the strand's patches name (`ConeSettlementFootprint`, reading only those records under
  the base and target roots; node edge registrations are ignored). The policy digest is
  `git-warp:settlement-policy/footprint-records/v1`. `settle()` replays the strand's sequences through the target's
  cone basis (`commitSequenceOnCone`). The session-event BATS oracle now has both strands touch the direct event so
  Beta still overlaps Alpha's settlement, and counts the cone-root evidence.
- **Retention (Gap A analog).** `ConeLaneBasis.capture()` (behind `captureCoordinate`) retains the captured basis
  tree under `refs/warp/<lane>/cone/retained`, a tree whose `r/` directory names the last 64 captured bases
  (sequence-prefixed, oldest evicted, compare-and-swap with retries). Strand bases and strand heads are durable
  refs of their own and are released when the strand is dropped. All are listed as never transferred in sync.md.
- **CLI.** `git warp repair --action basis` advances a Lane's cone basis through a new `refreshBasis` Lane port
  (`refreshLaneBasis`, also for `--strand`) and reports `foldedPatches`, or the obstruction and its hint with exit
  code 3; `--action materialization` is documented as global maintenance. `doctor` replaces `checkpoint-fresh`
  with `cone-basis-lag`: per writer, `rev-list --count` of the tip minus the folded position (two counts per lagging
  writer, no patch read), a warning above 10,000 unfolded patches and a failure for a diverged chain.
- **In-write removes.** `PatchBuilder` records the add dots it issues (`InWriteAddDots`); `edge.remove` and
  `node.remove` of an element added earlier in the same atomic write observe them.
- **Deleted.** `WarpWorldline.prepareOpticBasis`, `prepareForkOpticBasis` (and its materialize plus checkpoint
  fallback), `coordinate()`, `prepareStrandOptic`, `openDraftCoordinate` and `patchDraft`; `createForkTick`;
  `CheckpointTailBasisVerifier`; `WarpWorldlineOpticBasis`; `WarpWorldlineStrandOptic`; `WarpStrandOpticBasis`;
  `BoundedNodeRemovalBasis` and `PatchBuilder.prepareWriteBasis` with its snapshot-frontier plumbing;
  `ContentReadProjection`, `ContentReadBasis` and `ContentReadRuntime`; the checkpoint-tail `Coordinate` variant
  (`checkpointSha`, `requireCheckpointSha()`, `source()`); the checkpoint-tail failure branches of the public
  reading runtime, which now treats only cone obstructions as operational failures; and the strand create option
  `baseCheckpointSha` (replaced by `baseBasis`). The memory test storage now provides cone services.
- **Maintenance-only, with explicit boundaries.** `CheckpointTailOptic` (split from the public `WorldlineOptic`,
  which is now cone-only) and `CheckpointTailWitnessLocator` serve only `ProjectionHandle.optic()`, the internal
  exact-id query read model (`QueryController`) and `BoundedIntentGuardReader` (`WarpWorldline.admitIntent`).
  `StrandMaterializer` and `StrandPatchService.createPatchBuilder/patchWithEvidence` serve only the internal graph
  strand API (`StrandCapability`, used by the deprecated `WarpGraph`/`WarpCore` facades and queued strand intents).
  `RuntimeHost.materialize`/`createCheckpoint` serve `repair --action materialization`, migrations and the
  deprecated facades; `WarpWorldline.live()/seek()/observer()` and `previewDraftJoin` (internal Timeline API) stay
  deprecated compatibility. A `WarpWorldline` over storage without cone records refuses every public path with
  `E_WARP_WORLDLINE_CONE_UNAVAILABLE`.
- **Evidence.** The trap test now also traps `materializeStrand`, `_materializeStrandGraph`, the checkpoint-tail
  basis loader, `StrandMaterializer` and whole-chain loads, and drives every intent kind and every Reading kind on a
  worldline and a forked strand, both content observers on each, captured-coordinate optic reads on each,
  `previewSettlement`, `settle` and `repair --action basis`: no trap fires; the armed control still fires on a global
  materialization and a history walk. Real-repository tests cover fork then read, strand write/read overlay and
  record sharing, reopen and base refold, a preview that survives a global checkpoint and a cone head rebuild with an
  identical plan digest, footprint-unchanged and footprint-advanced settlement, saved Coordinates (worldline and
  strand) surviving `git gc --prune=now` while an unretained root is pruned, and in-write removes. A seeded oracle
  folds 60 generated histories as base plus overlay and matches a full reduction of base and strand patches.

Known limits after slice 4: reopening a strand (`Runtime.strand`) reads the strand's own patches to rebuild the
intents a settlement replays (strand-proportional, not graph-proportional), and resolving a strand by friendly
name reads every strand descriptor of the clone once; a strand write reads one head patch per strand tip; only the
last 64 captured bases are retained, so an older saved Coordinate can be pruned by `git gc` (its failure mode
after pruning is not separately tested), and an Observation's own coordinate is not retained; a cone
obstruction while previewing settlement rejects the call instead of returning an obstruction outcome; the
footprint check treats any change to a footprint node's membership, lifecycle or properties as a conflict, even a
property the strand never read; a strand created below a Lamport ceiling (an internal option) is refused with
`E_STRAND_CONE_CEILING`; the package payload is over its 1,050-entry budget since slices 1-3 (1,089 entries; 1,081 after
integrating storage layout 2 and the showcase), so the `cli-failures` and `cli-launcher` BATS cases fail until
the budget is decided; the entity admission inventory still
scans history by design.

## Entity admission index record

The entity admission inventory (`createEntityAdmissionInventoryObserver`) was the last public export that walked
every writer's history from its tip, one `git show` per commit. It now reads a cone-maintained index.

- **Records.** A fifth record family, `admission` (trie directory `i`): per writer chain a `ConeAdmissionTally`
  (how many admissions the chain has indexed) and one `ConeAdmissionRecord` per admission at its ordinal in the
  chain (patch order, then operation order), holding the subject, initial properties, origin, dot, event and
  causal context that a Reading needs. A patch whose admissions cannot be proven (an unmarked whole-patch entity
  footprint) takes one `ConeUnprovenAdmissionRecord` carrying the refusal instead, so the fold continues and
  only an inventory that reaches it is refused.
- **Fold.** `ConeAdmissionIndexer` runs inside `ConeFold`: a patch without admissions reads and writes nothing;
  one with admissions reads its chain's tally and stages the entries and the new tally. The fold of an admitting
  patch therefore costs one more record read and `admissions + 1` more record writes.
- **Read.** `ConeEntityAdmissionInventory` reads every frontier writer's tally in one batch and pages each chain
  downwards in batches of at most 256 records (`ConeAdmissionMerge`, a k-way merge newest event first). Chains keep
  one admission loaded, as the scan's cursors did, so order, values and the position of a legacy refusal match the
  scan exactly. Reading `n` admissions costs `O(n + writers × 256)` record reads, independent of history.
- **Basis and certificate.** An inventory Tick is the lane's advanced cone basis (root and frontier); the Tick id
  is computed from the frontier exactly as before, and the certificate binds that Tick. Strand inventories stay
  refused.
- **Paging.** An Observation emits at most `limit` admissions (default 10,000). A page that stops with admissions
  left retains its basis (with the captured Coordinates' 64) and binds an `EntityAdmissionInventoryCursor`: Lane,
  Tick id, count and rolling digest so far, and per writer how many admissions are unread, with a check digest.
  A resumed Observation finds the cursor's basis as the current basis or among the retained ones, or is refused
  with `E_ENTITY_ADMISSION_INVENTORY_CURSOR_BASIS`. The last page certifies the whole inventory.
- **Layout.** The trie marker becomes layout 3; a layout 2 head lacks the index and is refused like layout 1.
- **Evidence.** The equivalence oracle now also generates entity admissions in 30% of patches and compares the
  cone inventory, read in pages of three, with a scan of every chain for every generated history (each fold
  interleaving). Unit tests cover the legacy refusal position, resumption positions, a corrupt index and every
  record's codec round trip. Through the public Runtime: paging with a limit across lane writes reproduces the
  single Observation's admissions, count and digest; a damaged cursor and another Lane's cursor are refused; a
  two-admission page reads at most 11 index records after a 40-patch history; the CLI pages with `limit` and
  `cursor`. The trap test drives the inventory with the history-walk trap armed.

Known limits: a cursor is resumable only while its basis is current or among the last 64 retained captures; the
default limit truncates an inventory larger than 10,000 admissions into pages where one Observation used to
stream everything.

## Slices

1. Cone records, workspace, record trie adapter, basis ref and ingest, with the equivalence oracle.
2. Public reads through `ConeWitnessLocator` (property, node, neighbourhood, traversal, content Observations).
3. Public writes through cone records (`node.remove`, `edge.remove`, content owner checks) and own-patch folding.
4. Lifecycle: open without repair, bounded basis CLI, fork/strand/settlement on cone bases, materialization traps
   (done; see the slice 4 record).
5. Showcase: example application and cost witness. Integrated with slices 1-4 and storage layout 2; the
   witness on the integrated branch is retained in `benchmarks/cone-showcase/results/integrated-0504d5d64/`
   (saves 30 Git processes and margins reads 8 at 200, 2,000 and 20,000 threads; 2,000-thread p50 save
   46 ms, margins 36 ms; 20,000-thread p50 save 168 ms, slowed by pack count, #1041).
6. Conflict visibility.

---
title: "Publish checkpoint envelope trees with native Git reachability"
legend: "PROTO"
cycle: "0033-checkpoint-envelope-publication"
source_backlog: "docs/method/backlog/v17.0.0/PROTO_checkpoint-envelope-publication.md"
---

# Publish checkpoint envelope trees with native Git reachability

Source backlog item:
`docs/method/backlog/v17.0.0/PROTO_checkpoint-envelope-publication.md`
Legend: PROTO

## Sponsors

- Human: Backlog operator
- Agent: Implementation agent

## Hill

Checkpoint creation publishes a schema-5 envelope tree whose
`state/nodeAlive` and `state/edgeAlive` entries point at real trie root
objects through normal Git tree reachability, and the shipped runtime
loads only that envelope substrate rather than `state.cbor` full-state
checkpoints.

## Playback Questions

### Human

- [ ] Is the checkpoint reachability story obvious from the tree layout
      alone, without needing to trust blob-internal OIDs?
- [ ] Is the distinction between writer frontier metadata and state
      metadata explicit enough that later cycles will not collapse them
      back into one vague `frontier.cbor` bag?

### Agent

- [ ] Does checkpoint creation stop writing authoritative `state.cbor`
      blobs in shipped runtime code?
- [ ] Are `state/nodeAlive` and `state/edgeAlive` real Git tree entries
      whose mode matches the actual persisted root object kind (`tree`
      or `blob`)?
- [ ] Does `loadCheckpoint` reconstruct runtime state from envelope
      entries rather than from a monolithic serialized ORSet blob?
- [ ] Does shipped runtime reject legacy checkpoint schemas and layouts,
      leaving upgrade responsibility to the migration tool?
- [ ] Do API-level checkpoint/materialize tests still pass on the new
      substrate?

## Accessibility and Assistive Reading

- Linear truth posture: the envelope layout is named explicitly and
  separated into state roots, kernel blobs, writer frontier, and GC
  boundary.
- No visual assumptions.

## Localization and Directionality

- None. Tree paths and artifact names remain ASCII and deterministic.

## Agent Inspectability and Explainability

- Commit message remains the authoritative checkpoint descriptor
  (`graph`, `stateHash`, `schema`, tree OID); the tree contents are the
  authoritative reachability substrate.
- Every artifact is attributable to one role:
  - trie roots: structural state reachability
  - `prop.cbor`, `observedFrontier.cbor`, `edgeBirthEvent.cbor`:
    kernel-state blobs
  - `frontier.cbor`: writer patch tips for incremental replay
  - `appliedVV.cbor`: GC boundary

## Non-goals

- [ ] No dual runtime fallback for legacy checkpoint trees.
- [ ] No migration-tool implementation in this cycle.
- [ ] No `StateSession` / `ShadowTrieORSet` integration work beyond
      what is required to keep current checkpoint/materialize behavior
      truthful.
- [ ] No graph-model or Echo-parity work.
- [ ] No git-cas substitution for trie-root reachability.

## Backlog Context

Current checkpoint code still assumes full-state blobs:

- `checkpointCreate.ts` writes `state.cbor`, `frontier.cbor`,
  `appliedVV.cbor`, optional `provenanceIndex.cbor`, and optional
  `index/`
- `loadCheckpoint()` reads the same layout
- `CborCheckpointStoreAdapter` owns monolithic state encode/decode

That layout is incompatible with trie-backed ORSets as the
authoritative checkpoint substrate, because Git follows tree entries,
not OIDs embedded inside serialized blobs.

Cycle 0030 already delivered the missing publication primitive:
`TrieFlusher` returns a real post-flush `rootOid`. This cycle wraps
those root OIDs in a checkpoint envelope that Git can keep alive
natively.

## Problem

If trie-backed `nodeAlive` and `edgeAlive` state is referenced only
inside `state.cbor`, the checkpoint commit does not actually keep the
trie pages reachable. `git gc` is free to collect them because no tree
entry points at those objects.

There is a second problem hidden inside the old layout: current
checkpoint artifacts collapse two different concepts into one vague
shape.

- **Writer frontier** — patch tips used to resume incremental replay
- **State metadata** — `prop`, `observedFrontier`, `edgeBirthEvent`

The new envelope needs to keep those concepts separate.

## Fix

Introduce a new checkpoint schema and tree layout that uses native Git
reachability for trie roots and explicit blobs for the remaining
kernel-state artifacts.

### Locked decision 1 — new checkpoint schema

Shipped runtime moves to a new checkpoint schema:

- `CHECKPOINT_SCHEMA_ENVELOPE_TREE = 5`

Legacy schemas `2`, `3`, and `4` become migration-tool input only.
Shipped runtime does not carry dual-path loaders.

### Locked decision 2 — commit message remains the descriptor

Do **not** add `descriptor.cbor`.

The checkpoint commit message already carries the authoritative
descriptor fields:

- graph name
- schema
- state hash
- tree OID

Adding a second descriptor artifact would create duplicate authority
for no gain.

### Locked decision 3 — envelope tree layout

The checkpoint commit points at an envelope tree with this layout:

```text
<checkpoint-envelope-tree>/
├── state/                            (tree)
│   ├── nodeAlive                     (tree or blob entry to trie root)
│   ├── edgeAlive                     (tree or blob entry to trie root)
│   ├── prop.cbor
│   ├── observedFrontier.cbor
│   └── edgeBirthEvent.cbor
├── frontier.cbor                     (writer frontier map)
├── appliedVV.cbor                    (GC boundary)
├── provenanceIndex.cbor              (optional)
└── index/                            (optional subtree)
```

Important correction: the invariant is **real Git entries**, not
"always a root tree". A trie root may be a branch tree or a leaf blob.
`state/nodeAlive` and `state/edgeAlive` must therefore use the correct
Git mode for the actual root object kind.

### Locked decision 4 — `CheckpointStorePort` narrows to non-trie artifacts

`CheckpointStorePort` should no longer own monolithic full-state
serialization.

Its responsibility becomes the non-trie artifacts only:

- `prop`
- `observedFrontier`
- `edgeBirthEvent`
- `frontier`
- `appliedVV`
- optional `provenanceIndex`

Checkpoint publication itself owns envelope assembly and insertion of
the two trie root entries.

This keeps the port honest:
- the trie store remains responsible for trie pages
- the checkpoint artifact store remains responsible for small CBOR
  artifacts
- the checkpoint publisher owns the commit/tree envelope

### Locked decision 5 — current runtime readback remains working

`loadCheckpoint()` must keep current checkpoint/materialize behavior
working in `v17` even before `StateSession` materialization lands.

For schema-5 checkpoints, it should:

1. read envelope entries
2. open throwaway trie cursors against the `nodeAlive` and `edgeAlive`
   roots
3. enumerate elements and live dots
4. reconstruct concrete in-memory `ORSet` instances
5. decode the kernel-state blobs and return a normal `LoadedCheckpoint`

This is a bounded compatibility bridge inside the new schema, not a
legacy fallback path. It preserves current API behavior without
pretending the authoritative checkpoint substrate is still `state.cbor`.

## Source cuts

### `checkpointCreate.ts`

Change from:

- serialize full state
- write `state.cbor`
- place `state.cbor` in checkpoint tree

To:

- compute `appliedVV`
- optionally compact cloned ORSets as today
- flush trie-backed `nodeAlive` / `edgeAlive` state to obtain root OIDs
- write non-trie checkpoint blobs
- build `state/` subtree with:
  - real root entry for `nodeAlive`
  - real root entry for `edgeAlive`
  - `prop.cbor`
  - `observedFrontier.cbor`
  - `edgeBirthEvent.cbor`
- build outer envelope tree with `frontier.cbor`, `appliedVV.cbor`,
  optional provenance/index, and any existing content anchors still
  required by live payload policy
- create schema-5 commit

### `checkpointLoad.ts`

Change from:

- read `state.cbor`
- deserialize full state directly

To:

- read envelope tree
- load writer frontier from `frontier.cbor`
- load kernel-state blobs from `state/`
- reconstruct `nodeAlive` / `edgeAlive` from trie roots
- return `LoadedCheckpoint` with the same runtime shape expected by the
  current callers

### `CborCheckpointStoreAdapter.ts`

Change from:

- encoding and decoding monolithic `state.cbor`

To:

- encoding and decoding the non-trie artifact bundle only
- no full-state blob support in shipped runtime

## Test plan

### Unit: checkpoint creation

- `checkpointCreate` writes schema-5 checkpoint commits.
- Envelope tree contains `state/` subtree, not `state.cbor`.
- `state/nodeAlive` and `state/edgeAlive` are real entries with correct
  Git modes for branch-root vs leaf-root cases.
- `frontier.cbor`, `appliedVV.cbor`, optional `provenanceIndex.cbor`,
  and optional `index/` are still present where expected.

### Unit: checkpoint load

- `loadCheckpoint()` reconstructs `WarpState` from a schema-5 envelope
  tree with trie root entries and kernel-state blobs.
- `loadCheckpoint()` rejects legacy schema/layout in shipped runtime.
- Incremental materialization still resumes correctly from the loaded
  checkpoint frontier.

### Unit: adapter

- `CborCheckpointStoreAdapter` round-trips the non-trie artifact bundle.
- Adapter no longer writes or reads `state.cbor`.
- CAS pointer mode still works for the small artifact blobs it owns.

### Integration: API behavior

- `graph.createCheckpoint()` still returns a valid SHA.
- `graph.materializeAt(checkpointSha)` still restores correct state.
- Incremental materialization after additional patches still works.
- Content anchoring and checkpoint-index freshness tests still pass on
  the new envelope layout.

### Failure cases

- Missing `state/nodeAlive` or `state/edgeAlive` entry fails closed.
- Wrong Git mode for a trie root entry fails closed.
- Schema-2/3/4 checkpoint commits are rejected by shipped runtime with
  a migration-required error.

## First red target

Start with checkpoint creation tests:

1. current `createCheckpoint` tests should fail because they still
   expect `state.cbor`
2. add new assertions for `state/` subtree and schema 5
3. only then cut the implementation

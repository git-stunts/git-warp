# git-warp architecture

This document explains how `git-warp` is structured internally.

If you are learning the product for the first time, start with:

- [README.md](README.md)
- [Getting started](docs/topics/getting-started.md)
- [Querying](docs/topics/querying.md)

## Release posture

`v18.1.1` is the current release target. Architecturally, it carries the v18
read-model closeout from the current `main` release state: `Optic` is a
runtime noun, observer reading envelopes are explicit, bounded support planning
is named, the public learning shelf is consolidated under `docs/topics/`, and
operator workflows live outside that shelf under `docs/operations/`.

The longer release notes live in [CHANGELOG.md](CHANGELOG.md). The runtime
architecture below describes current implementation boundaries, not aspirational
roadmap state.

## System map

```text
┌──────────────────────────────────────────────────┐
│       openWarpWorldline() / openWarpGraph()       │
│  app worldline handle / advanced capability bag   │
├──────────┬───────────┬───────────┬───────────────┤
│  Query   │  Patch    │ Materialize│    Sync      │
│Controller│Controller │ Controller │  Controller  │
│          │           │            │              │
│  Strand  │Checkpoint │ Provenance │ Comparison   │
│Controller│Controller │ Controller │   Engine     │
├──────────┴───────────┴───────────┴───────────────┤
│                  Domain Services                  │
│  JoinReducer · OpStrategy · Frontier · GCPolicy   │
│  StrandCoordinator · ConflictAnalyzer · BTR       │
│  StateHashService · MaterializedViewService       │
├──────────────────────────────────────────────────┤
│                     Ports                         │
│  GraphPersistencePort · BlobPort · TreePort       │
│  CommitPort · RefPort · CodecPort · CryptoPort    │
│  ClockPort · LoggerPort · SeekCachePort           │
├──────────────────────────────────────────────────┤
│               Infrastructure Adapters             │
│  GitGraphAdapter · InMemoryGraphAdapter           │
│  CborCodec · NodeCrypto · WebCrypto · ClockAdapter│
│  CasBlobAdapter · CasSeekCacheAdapter             │
├──────────────────────────────────────────────────┤
│                   Git substrate                   │
│  @git-stunts/plumbing · @git-stunts/git-cas       │
│  @git-stunts/alfred · @git-stunts/trailer-codec   │
└──────────────────────────────────────────────────┘
```

## Architectural principles

### Hexagonal architecture

Domain code (`src/domain/`) never imports infrastructure or Node
globals. All I/O goes through ports. Adapters wire ports to Git,
the filesystem, Node, Bun, Deno, or the browser.

### Admission architecture (Paper VII)

The system decomposes into three moments:

- **Commitment** — admits plural claims into frontier-relative truth
- **Folding** — re-expresses admitted history (checkpoints, materialization)
- **Revelation** — exposes truth under bounded rights (queries, observers)

`openWarpWorldline()` gives application code the first-use handle over one
named admitted causal lane. `openWarpGraph()` returns the advanced frozen
capability bag organized by these moments, plus governance (sync) for
distributed admission.

### Graph-shaped readings

git-warp does not treat a materialized graph as substrate truth. Witnessed
causal history is the authority. A graph-shaped value is an observer-relative
reading over that history, and it is valid only for the basis, aperture, law,
projection, support obligations, rights posture, budget posture, and witness
posture it names.

The public direction is:

```text
bounded causal basis
+ optic law
+ observer aperture
+ support obligations
+ capability, budget, and evidence posture
-> witnessed reading artifact
```

Git object IDs, CAS hashes, retained payload hashes, commitment roots, proof
references, basis identities, and semantic reading identities must stay
separate. A byte hash identifies bytes; it does not answer a semantic question
by itself. Keep semantic read identity in the owning runtime object or generated
reference, not in ad hoc prose.

Adapters and CLI commands must not hide full-materialization fallback, missing
witnesses, missing rights evidence, or budget limits. Missing support is an
obstruction, residual posture, redaction, plurality, or rehydration requirement,
not a cache miss to paper over.

### Systems-Style TypeScript (SSTS)

The engineering standard for this codebase. Key rules:

- Runtime truth wins over type annotations
- Domain concepts are classes, not interfaces or typedefs
- Validation at boundaries and constructors
- `instanceof` dispatch over tag switching
- No `any`, no `unknown` (outside parsers), no `as` (outside boundaries)
- One file per concept, 500 LOC max
- Tests are the spec

Full standard: [Systems-Style TypeScript](docs/SYSTEMS_STYLE_TYPESCRIPT.md).

## Public API surface

### `openWarpWorldline()` (v18+)

The recommended application entry point. Returns a frozen Worldline-first
handle:

```text
const team = await openWarpWorldline({ persistence, worldlineName, writerId });

team.commit(...)       // commitment: write one atomic patch
team.live()            // revelation: current admitted worldline
team.seek(...)         // revelation: pinned coordinate read
team.observer(...)     // revelation: bounded aperture
team.optic()           // revelation: bounded optic question
```

### `openWarpGraph()` (compatibility and diagnostics)

The advanced compatibility entry point. Returns a frozen capability bag for
tooling, diagnostics, and graph-first integrations that intentionally need the
lower-level surface:

The flat aliases are canonical for user-facing examples. Moment-scoped names
are available for explicit architecture code and point at the same objects:
`graph.patches === graph.commitment.patches`,
`graph.query === graph.revelation.query`, and
`graph.checkpoint === graph.folding.checkpoint`.

```text
const graph = await openWarpGraph({ persistence, graphName, writerId });

graph.query.*          // revelation: read state
graph.patches.*        // commitment: write patches
graph.sync.*           // governance: distributed sync
graph.strands.*        // commitment: speculative lanes
graph.checkpoint.*     // folding: history folding
graph.provenance.*     // revelation: witness access
graph.comparison.*     // commitment: braid comparison
graph.subscriptions.*  // revelation: reactive state
```

### `WarpApp` / `WarpCore` (legacy, v16 compat)

Still exported for backward compatibility and advanced tooling. New application
code should prefer `openWarpWorldline()`, and lower-level tooling should prefer
`openWarpGraph()` unless it deliberately needs the legacy facade shape.

## Internal engine

### Controllers (src/domain/services/controllers/)

9 controllers, one per capability namespace. Each accepts a typed
dependency bag and owns the orchestration for its domain:

| Controller | Capability | Key responsibility |
|-----------|------------|-------------------|
| QueryController | query | Node/edge reads, observers, worldlines |
| PatchController | patches | Patch creation, commit, CRDT join |
| MaterializeController | materialize | Full and incremental materialization |
| SyncController | sync | Frontier, sync, serve |
| StrandController | strands | Strand lifecycle, braid, collapse |
| CheckpointController | checkpoint | Checkpoint create/restore |
| ProvenanceController | provenance | Provenance index, BTR access |
| ComparisonController | comparison | Coordinate comparison, transfer planning |
| SubscriptionController | subscriptions | Reactive state change notification |

### Streams and bounded storage ports

`WarpStream` is the domain stream primitive used by storage and traversal
ports when an operation may be unbounded. It is an async-iterable wrapper with
composition helpers for stream pipelines; adapters convert host streams,
arrays, cursors, or generated records into `WarpStream` at the boundary.

The stream layer keeps large reads from pretending to be ordinary in-memory
arrays. Current advanced ports that use this boundary include:

| Port | Streamed surface | Role |
| --- | --- | --- |
| `CommitPort` | `logNodesStream(...)` | Git commit-log chunks without loading the full log |
| `PatchJournalPort` | `scanPatchRange(...)` | Patch journal entries over a writer/range |
| `IndexStorePort` | `writeShards(...)`, `scanShards(...)` | Bitmap/index shards as bounded stream units |

`CheckpointStorePort` is the checkpoint storage boundary. It does not expose a
general stream API today, but it sits beside the streamed stores because it
owns folded state persistence rather than live query semantics.

### Domain services (src/domain/services/)

Stateless services that implement domain logic:

- **JoinReducer** — CRDT state merge (the gravitational center)
- **OpStrategy** — per-op-type mutation/outcome/snapshot logic
- **StrandCoordinator** — strand lifecycle orchestration
- **ConflictAnalyzer** — conflict detection and trace assembly
- **MaterializedViewService** — bitmap index build/rebuild
- **StateHashService** — canonical state hash computation
- **SyncProtocol** — request/response for distributed sync

### Ports (src/ports/)

Abstract contracts between domain and infrastructure:

- **GraphPersistencePort** — runtime composite of CommitPort + BlobPort + TreePort + RefPort
- **WarpKernelPort** — type-only kernel persistence contract for CommitPort +
  BlobPort + TreePort + RefPort
- **CodecPort** — encode/decode (CBOR)
- **CryptoPort** — hash, hmac, sign, verify
- **ClockPort** — wall clock (injected, not ambient)
- **LoggerPort** — structured logging
- **SeekCachePort** — persistent seek cache for time-travel
- **PatchJournalPort** — streamed patch-entry scans
- **CheckpointStorePort** — folded checkpoint state storage
- **IndexStorePort** — streamed index shard storage

### Infrastructure adapters (src/infrastructure/)

Concrete implementations of ports:

- **GitGraphAdapter** — Git plumbing commands via @git-stunts/plumbing
- **InMemoryGraphAdapter** — in-memory Maps for testing
- **CborCodec** — CBOR encoding via cbor-x
- **NodeCryptoAdapter / WebCryptoAdapter** — hash/sign via node:crypto or SubtleCrypto
- **CasBlobAdapter** — content-addressable blob storage via @git-stunts/git-cas
- **CasSeekCacheAdapter** — persistent seek cache on git-cas

## Git storage model

Graph history lives under WARP refs, not source-tree refs. Each writer
maintains an independent patch chain under
`refs/warp/<graph>/writers/<writerId>`, so graph history does not appear in the
checked-out working directory and does not rewrite `refs/heads/*`.

Patch, checkpoint, coverage, cursor, and audit commits may carry Git trees for
patch payloads, checkpoint state, receipts, or content attachments. Isolation
comes from the ref namespace and Git plumbing, not from a rule that every graph
commit has no payload tree.

```text
refs/warp/events/writers/alice → commit-sha-1
refs/warp/events/writers/bob   → commit-sha-2
refs/warp/events/checkpoint    → checkpoint-sha
refs/warp/events/coverage      → coverage-sha
```

Reads open a live, pinned, observer, or optic basis over those refs. Diagnostic
materialization walks visible writer chains, applies patches through
`JoinReducer` (CRDT merge), and produces a frozen `WarpState`; application code
should prefer worldlines, observers, query builders, and optics before whole
graph replay.

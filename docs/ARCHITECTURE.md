# git-warp architecture

This document explains how `git-warp` is structured internally.

If you are learning the product for the first time, start with:

- [README.md](../README.md)
- [Getting Started](GETTING_STARTED.md)
- [Guide](GUIDE.md)

## System map

```
┌──────────────────────────────────────────────────┐
│                  openWarpGraph()                  │
│  commitment / folding / revelation / governance   │
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

`openWarpGraph()` returns a frozen capability bag organized by these
moments, plus governance (sync) for distributed admission.

### Systems-Style TypeScript (SSTS)

The engineering standard for this codebase. Key rules:

- Runtime truth wins over type annotations
- Domain concepts are classes, not interfaces or typedefs
- Validation at boundaries and constructors
- `instanceof` dispatch over tag switching
- No `any`, no `unknown` (outside parsers), no `as` (outside boundaries)
- One file per concept, 500 LOC max
- Tests are the spec

Full standard: `docs/SYSTEMS_STYLE_TYPESCRIPT.md`

## Public API surface

### `openWarpGraph()` (v17+)

The recommended entry point. Returns a frozen capability bag:

```typescript
const graph = await openWarpGraph({ persistence, graphName, writerId });

graph.query.*          // revelation: read state
graph.patches.*        // commitment: write patches
graph.materialize.*    // folding: frontier-relative state
graph.sync.*           // governance: distributed sync
graph.strands.*        // commitment: speculative lanes
graph.checkpoint.*     // folding: history folding
graph.provenance.*     // revelation: witness access
graph.comparison.*     // commitment: braid comparison
graph.subscriptions.*  // revelation: reactive state
```

### `WarpApp` / `WarpCore` (legacy, v16 compat)

Still exported for backward compatibility. Both delegate to the same
internal engine. `WarpApp` is the product surface; `WarpCore` is the
plumbing surface. Both will be removed when `openWarpGraph()` consumer
migration is complete.

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

- **GraphPersistencePort** — composite of CommitPort + BlobPort + TreePort + RefPort
- **CodecPort** — encode/decode (CBOR)
- **CryptoPort** — hash, hmac, sign, verify
- **ClockPort** — wall clock (injected, not ambient)
- **LoggerPort** — structured logging
- **SeekCachePort** — persistent seek cache for time-travel

### Infrastructure adapters (src/infrastructure/)

Concrete implementations of ports:

- **GitGraphAdapter** — Git plumbing commands via @git-stunts/plumbing
- **InMemoryGraphAdapter** — in-memory Maps for testing
- **CborCodec** — CBOR encoding via cbor-x
- **NodeCryptoAdapter / WebCryptoAdapter** — hash/sign via node:crypto or SubtleCrypto
- **CasBlobAdapter** — content-addressable blob storage via @git-stunts/git-cas
- **CasSeekCacheAdapter** — persistent seek cache on git-cas

## Git storage model

All graph data is stored as Git commits pointing to the empty tree
(`4b825dc642cb6eb9a060e54bf8d69288fbee4904`). No files appear in the
working directory. Each writer maintains an independent patch chain
under `refs/warp/<graph>/writers/<writerId>`.

```
refs/warp/events/writers/alice → commit-sha-1
refs/warp/events/writers/bob   → commit-sha-2
refs/warp/events/checkpoint    → checkpoint-sha
refs/warp/events/coverage      → coverage-sha
```

Materialization walks all writer chains, applies patches through
JoinReducer (CRDT merge), and produces a frozen `WarpState`.

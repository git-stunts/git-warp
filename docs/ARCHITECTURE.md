# git-warp architecture

This document explains how `git-warp` is structured internally.

If you are learning the product for the first time, start with:

- [README.md](../README.md)
- [Getting Started](GETTING_STARTED.md)
- [Guide](GUIDE.md)

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
by itself. See [Reading Identity](specs/READING_IDENTITY.md).

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

Full standard: `docs/SYSTEMS_STYLE_TYPESCRIPT.md`

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

```text
refs/warp/events/writers/alice → commit-sha-1
refs/warp/events/writers/bob   → commit-sha-2
refs/warp/events/checkpoint    → checkpoint-sha
refs/warp/events/coverage      → coverage-sha
```

Materialization walks all writer chains, applies patches through
JoinReducer (CRDT merge), and produces a frozen `WarpState`.

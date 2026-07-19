# git-warp architecture

This document explains how `git-warp` is structured internally.

If you are learning the product for the first time, start with:

- [README.md](README.md)
- [Getting started](docs/topics/getting-started.md)
- [Querying](docs/topics/querying.md)

## Release posture

`v18.2.1` is the current published release. Mainline development is preparing
the v19 application boundary: callers open an opaque storage handle, write
intents, read timelines, and keep receipts. Git history and git-cas remain
separate infrastructure concerns composed behind that handle.

The longer release notes live in [CHANGELOG.md](CHANGELOG.md). The runtime
architecture below describes current implementation boundaries, not aspirational
roadmap state.

## System map

```text
┌──────────────────────────────────────────────────┐
│ openWarp() -> Warp -> Timeline                    │
│ intent · reading · tick · receipt                 │
├──────────────────────────────────────────────────┤
│ Opaque storage composition                        │
│ GitStorage.open()                                  │
├──────────┬───────────┬────────────┬──────────────┤
│  Query   │  Patch    │ Materialize│    Sync      │
│Controller│Controller │ Controller │  Controller  │
│  Strand  │Checkpoint │ Provenance │ Comparison   │
├──────────┴───────────┴────────────┴──────────────┤
│ Domain services and semantic storage ports        │
│ CorePersistence · RuntimeStorageProviderPort      │
├───────────────────────┬──────────────────────────┤
│ GitTimelineHistory    │ GitCasRepositoryAdapter  │
│ Adapter               │ content/cache/retention  │
├───────────────────────┼──────────────────────────┤
│ @git-stunts/plumbing  │ @git-stunts/git-cas      │
└───────────────────────┴──────────────────────────┘
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

`openWarp()` gives application code a `Warp` handle. `warp.timeline(name)`
opens one named admitted causal lane without exposing the internal worldline,
graph, persistence, or CAS vocabulary.

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

### `openWarp()`

The package root accepts an opaque `WarpStorage` and returns a frozen `Warp`:

```typescript
import { openWarp } from '@git-stunts/git-warp';
import { GitStorage } from '@git-stunts/git-warp/storage';

const storage = await GitStorage.open({ cwd: '.' });
const warp = await openWarp({ storage, writer: 'agent-1' });
const team = await warp.timeline('team');

// After the final lane operation:
await storage.close();
```

Application code writes with `timeline.write(intent)` and reads with
`timeline.read(reading)`. Formal coordinate reads and receipt inspection live
on the explicit `advanced` and `diagnostics` subpaths.

### Storage composition

`GitStorage` is the package composition root, not a Git-shaped persistence
port. Its runtime storage boundary owns two sibling adapters:

- `GitTimelineHistoryAdapter` implements append-only causal history through
  `@git-stunts/plumbing`.
- `GitCasRepositoryAdapter` owns one repository-scoped git-cas facade and
  supplies semantic content, patch-journal, checkpoint, index, state, seek,
  trie, and trust storage services.

The same composition also supplies repository tooling, such as hook-path
resolution, through narrow ports backed by the same plumbing instance.

The domain receives `CorePersistence` and `RuntimeStorageProviderPort`. It does
not inspect plumbing fields, dynamically import adapters, or construct CAS
services.

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
- **PatchJournalPort** — streamed patch-entry scans
- **CheckpointStorePort** — folded checkpoint state storage
- **IndexStorePort** — streamed index shard storage

### Infrastructure adapters (src/infrastructure/)

Concrete implementations of ports:

- **GitTimelineHistoryAdapter** — timeline-history Git commands via
  @git-stunts/plumbing
- **GitCasRepositoryAdapter** — repository-scoped git-cas service composition
- **CborCodec** — CBOR encoding via cbor-x
- **NodeCryptoAdapter / WebCryptoAdapter** — hash/sign via node:crypto or SubtleCrypto
- **CasBlobAdapter** — content-addressable blob storage via @git-stunts/git-cas

In-memory persistence implementations live under `test/helpers/`; they are not
production adapters or package exports.

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

Reads open a bounded timeline basis over those refs. Diagnostic materialization
walks visible writer chains, applies patches through `JoinReducer` (CRDT merge),
and produces a frozen `WarpState`; application code should prefer readings and
receipts before whole-graph replay.

---
id: PROTO_purge-boundary-leaks
cycle: 0025B
parent_cycle: 0025
blocked_by:
  - PROTO_purge-cast-hacks
blocks:
  - PROTO_purge-fake-models
---

# 0025B — Boundary purge

## Problem

Per the P6.5 contamination map, 167 files under `src/domain/**` or
`src/ports/**` leak raw-shape or raw-I/O into core — the largest
family by far. Cluster analysis shows this is **not 167 independent
problems** but a small number of systemic anti-patterns:

| Cluster | Files | Pattern |
|---|---:|---|
| `src/domain/services/controllers/` | 17 | Controllers decode transport data inline instead of at adapter boundaries |
| `src/domain/services/strand/` | 15 | Conflict-data anti-model: `Record<string, unknown>` sprayed through strand pipelines |
| `src/domain/services/index/` | 9 | Shard-data type gaps (also surfaces in cycle 0023 bad-code note for `IncrementalIndexUpdater`) |
| `src/domain/services/query/` | 7 | Traversal / observer shapes |
| `src/domain/services/state/` | 7 | Checkpoint / serialization shapes |
| `src/domain/services/sync/` | 7 | Sync request/response transport leakage |
| `src/domain/types/conflict/` | 7 | Conflict data types |
| `src/domain/types/ops/` | 6 | Op shapes (overlaps with 0025C) |
| `src/ports/` | 3 | Port surfaces returning `unknown` — architectural choke points |
| scattered | ~88 | Remaining leaves |

## Fix (sub-campaign structure)

Run 0025B as five focused sub-campaigns in this order:

### 0025B1 — Port surfaces

Files:

- `src/ports/CodecPort.ts`
- `src/ports/IndexStorePort.ts`
- `src/ports/LoggerPort.ts`

A port that returns `unknown` or takes `Record<string, unknown>`
exports undecoded reality into core. Fix by:

- **`CodecPort`** → `CodecPort<TDecoded, TEncoded = Uint8Array>`,
  or a `DecoderPort<T>` with a schema argument. A decoder that
  returns `unknown` is not a decoder — it's a shrug.
- **`IndexStorePort`** → typed query/result objects, named filter
  types, typed index record shapes. Domain concepts probably never
  got named.
- **`LoggerPort`** → constrained `LogFieldValue` union,
  `LogFields` / `DiagnosticContext` / `AuditFields`. Logging is
  the easiest place for sludge to masquerade as pragmatism.

Port cleanup is the choke point — unblocking ports unblocks
many downstream sites.

### 0025B2 — Controllers / ingress decode relocation (17 files)

`src/domain/services/controllers/` decodes transport data inline.
Fix by moving decoders to `src/infrastructure/adapters/**` and
passing already-decoded domain types into controllers. Expect
adapter growth.

### 0025B3 — Strand conflict-data modeling (15 files + 7 `types/conflict/`)

The strand pipelines share a conflict-data anti-model. Introduce
proper domain types (`ConflictFrame`, `ConflictWitness`,
`ConflictResolution`, etc.) with validated constructors. Replace
every `Record<string, unknown>` conflict payload with named types.

### 0025B4 — JSON / env / fetch removal from core

Direct `JSON.parse`, `JSON.stringify`, `fetch`, `process.env` sites
in core move to adapters. This is mostly mechanical — find the
call, move the logic to the nearest adapter, pass decoded values
in.

### 0025B5 — Remaining `Record<string, unknown>` mop-up

After the cluster campaigns, the leaves (index/, query/, state/,
sync/, types/ops/, and scattered singletons) are fixed file-by-
file. By this point the patterns are well-understood; remainder
should be small.

## Allowed residue (unchanged)

`src/infrastructure/adapters/**` may retain `unknown` and
`Record<string, unknown>` as **boundary-local raw-input variables
only**. They must be consumed by a decoder in the same module and
not escape the adapter layer as-is.

`catch (err: unknown)` is not a violation anywhere — it is a
safety context, not a modeling surface (policy refinement
committed before 0025B opens).

## Scope

**In:**
- Every file listed in `policy/quarantines/0025B-boundary.json`.
- New decoders / parsers colocated with domain types.
- New runtime-backed domain classes where a shape needs a name.
- Port parameterization (Decoder<T>, LogFields, etc.).

**Out:**
- `*Like` removal — that's 0025C.
- Import walls — that's 0025D.
- `.d.ts` cleanup — separate declaration-hygiene concern.

## Exit criteria

- `policy/quarantines/0025B-boundary.json` has `files: []`.
- `rg 'Record<string, unknown>' src/domain src/ports` returns no
  matches.
- `rg '\bunknown\b' src/domain src/ports` returns only matches
  inside `catch (...: unknown)` clauses and inside type-guard
  predicates (`x is Foo`) — both legitimate.
- Zero `JSON.parse`, `JSON.stringify`, `fetch`, `process.env` in
  `src/domain/**` and `src/ports/**`.

## Retro expectations

- Per-sub-campaign counts (B1..B5): start, end, delta.
- For each cluster: name the missing domain concept that was
  previously sprayed as raw shapes. E.g. "introduced `ConflictFrame`
  class; replaced 14 `Record<string, unknown>` sites across strand".
- Note adapter growth: decoders that moved inward-out to the
  boundary. Boring adapters are a compliment.

---
id: TS_infrastructure-adapters
blocks:
  - TS_publish-pipeline
blocked_by:
  - TS_convert-remaining-js
---

# Convert infrastructure adapters to TypeScript

Phase 3 of cycle 0013. 31 files across `src/infrastructure/` (30
adapters + 1 codec), totalling ~6,450 LOC.

## Current shape

All ports are already `.ts` (19 files in `src/ports/`). Every adapter
already `extends` its port base class. No duck-typed port
implementations remain. The codec extends `CodecPort`.

Two files are over the 500 LOC source ceiling:

| File | LOC | Split strategy |
|------|-----|----------------|
| `GitGraphAdapter.js` | 1,036 | Split by port operation family (see below) |
| `InMemoryGraphAdapter.js` | 815 | Mirror the GitGraphAdapter split |

## Sludge census

| Pattern | Files | Fix |
|---------|-------|-----|
| `Buffer` usage (41 occurrences) | 8 files | Replace with `Uint8Array` + `bytes.ts` helpers |
| `@type` casts in JSDoc | ~80 | Become real type annotations |
| `@typedef` blocks | ~20 | Become real types or imports |
| No port base class | 1 (`LoggerObservabilityBridge`) | Either extend a port or make it a plain utility class |
| `PayloadTooLargeError` duplicate | 2 files (`NodeHttpAdapter`, `httpAdapterUtils`) | Deduplicate into one |
| `MissingCapabilityError extends Error` | 1 (`requireCapabilities`) | Should extend `WarpError` |

### Buffer sludge by file

- **`TrustCryptoAdapter.js`** (8 hits) — `Buffer.from(base64)`, `Buffer.concat`. Replace with `base64Decode()` / `concatBytes()` from `bytes.ts`.
- **`NodeHttpAdapter.js`** (10 hits) — `Buffer.concat`, `toBuffer()` cast. Legitimate at the Node boundary, but the `toBuffer` cast is a lie. Use `Uint8Array` internally, convert at the `http.createServer` boundary.
- **`WebCryptoAdapter.js`** (8 hits) — `Buffer.isBuffer()` guard. Remove the Buffer path entirely; require `Uint8Array` or string input.
- **`GitGraphAdapter.js`** (5 hits) — `Buffer` in plumbing typedefs. These describe the external `@git-stunts/plumbing` API; keep as-is if plumbing returns Buffer, but the adapter should normalize to `Uint8Array` at the boundary.
- **`CasBlobAdapter.js`** (2 hits) — `Buffer` normalization helper. Already does the right thing; just needs the return type fixed.
- **`CasSeekCacheAdapter.js`** (2 hits) — minor Buffer references in comments.
- **`ChunkEffectSink.js`** (1 hit) — comment only.
- **`CborCodec.js`** (5 hits) — `cbor-x` returns Buffer. Normalize at the decode boundary.

## Adapter families

### Family 1: Git persistence (~1,036 LOC)

| File | LOC | Port |
|------|-----|------|
| `GitGraphAdapter.js` | 1,036 | `GraphPersistencePort` |

**Split plan:** `GraphPersistencePort` is runtime-composed from
`CommitPort & RefPort & ConfigPort & TreePort & BlobPort`. Split
`GitGraphAdapter` into:

- `GitCommitAdapter.ts` (~250 LOC) — commit read/write
- `GitRefAdapter.ts` (~200 LOC) — ref read/write/list
- `GitConfigAdapter.ts` (~100 LOC) — config get/set
- `GitTreeAdapter.ts` (~100 LOC) — tree operations
- `GitBlobAdapter.ts` (~100 LOC) — blob read/write
- `GitGraphAdapter.ts` (~200 LOC) — composition facade, extends `GraphPersistencePort`, delegates to the above

Each sub-adapter takes `plumbing` in its constructor. The facade
composes them. Shared validation stays in `adapterValidation.ts`.

### Family 2: In-memory persistence (~815 LOC)

| File | LOC | Port |
|------|-----|------|
| `InMemoryGraphAdapter.js` | 815 | `GraphPersistencePort` |

**Split plan:** Mirror the Git split:

- `InMemoryCommitAdapter.ts` (~150 LOC)
- `InMemoryRefAdapter.ts` (~150 LOC)
- `InMemoryConfigAdapter.ts` (~80 LOC)
- `InMemoryTreeAdapter.ts` (~80 LOC)
- `InMemoryBlobAdapter.ts` (~80 LOC)
- `InMemoryGraphAdapter.ts` (~150 LOC) — composition facade

### Family 3: CAS-backed storage (~1,200 LOC)

| File | LOC | Port |
|------|-----|------|
| `CasBlobAdapter.js` | 373 | `BlobStoragePort` |
| `CasSeekCacheAdapter.js` | 464 | `SeekCachePort` |
| `CborCheckpointStoreAdapter.js` | 365 | `CheckpointStorePort` |
| `CborIndexStoreAdapter.js` | 234 | `IndexStorePort` |
| `CborPatchJournalAdapter.js` | 161 | `PatchJournalPort` |

All under ceiling. Straight `.js` to `.ts` conversions. Kill JSDoc
casts, add real parameter and return types. `CasBlobAdapter` needs
the Buffer normalization helper rewritten with `bytes.ts`.

### Family 4: CBOR transforms (~175 LOC)

| File | LOC | Port |
|------|-----|------|
| `CborDecodeTransform.js` | 38 | `Transform` (stream) |
| `CborEncodeTransform.js` | 38 | `Transform` (stream) |
| `IndexShardEncodeTransform.js` | 99 | `Transform` (stream) |

All tiny. Extend the domain `Transform` class from `src/domain/stream/`.
Straight conversions.

### Family 5: HTTP servers (~860 LOC)

| File | LOC | Port |
|------|-----|------|
| `NodeHttpAdapter.js` | 234 | `HttpServerPort` |
| `BunHttpAdapter.js` | 237 | `HttpServerPort` |
| `DenoHttpAdapter.js` | 235 | `HttpServerPort` |
| `httpAdapterUtils.js` | 156 | (shared utilities) |

All under ceiling. Deduplicate `PayloadTooLargeError` — it exists in
both `NodeHttpAdapter` and `httpAdapterUtils`. Keep it in
`httpAdapterUtils.ts` only.

### Family 6: Crypto (~350 LOC)

| File | LOC | Port |
|------|-----|------|
| `WebCryptoAdapter.js` | 134 | `CryptoPort` |
| `NodeCryptoAdapter.js` | 49 | `CryptoPort` |
| `TrustCryptoAdapter.js` | 114 | (standalone) |
| `sha1sync.js` | 138 | (standalone, exported) |

`sha1sync.js` is a public export (`"./sha1sync"` in package.json).
It has a hand-maintained `sha1sync.d.ts` at the repo root. After
conversion to `.ts`, delete the hand-maintained `.d.ts` and let tsc
generate it (handled in `TS_publish-pipeline`).

`TrustCryptoAdapter` is the worst Buffer offender (5 usages of
`Buffer.from` and `Buffer.concat`). Rewrite with `base64Decode()` and
`concatBytes()` from `bytes.ts`.

### Family 7: Effect sinks (~410 LOC)

| File | LOC | Port |
|------|-----|------|
| `ConsoleEffectSink.js` | 116 | `EffectSinkPort` |
| `ChunkEffectSink.js` | 171 | `EffectSinkPort` |
| `NoOpEffectSink.js` | 74 | `EffectSinkPort` |
| `TreeAssemblerSink.js` | 49 | `Sink` (stream) |

All under ceiling. Straight conversions.

### Family 8: Loggers (~235 LOC)

| File | LOC | Port |
|------|-----|------|
| `ConsoleLogger.js` | 172 | `LoggerPort` |
| `NoOpLogger.js` | 62 | `LoggerPort` |

Straight conversions. Both already extend `LoggerPort`.

### Family 9: Stream sinks (~90 LOC)

| File | LOC | Port |
|------|-----|------|
| `GitBlobWriteTransform.js` | 40 | `Transform` (stream) |
| `TreeAssemblerSink.js` | 49 | `Sink` (stream) |

Tiny. Straight conversions.

### Family 10: Utilities + bridges (~530 LOC)

| File | LOC | Port |
|------|-----|------|
| `adapterValidation.js` | 170 | (shared validation) |
| `lazyCasInit.js` | 32 | (factory utility) |
| `requireCapabilities.js` | 93 | (runtime capability check) |
| `LoggerObservabilityBridge.js` | 63 | (bridge, no port) |
| `ClockAdapter.js` | 59 | `ClockPort` |

`LoggerObservabilityBridge` does not extend any port. It bridges
`@git-stunts/git-cas`'s `ObservabilityPort` to our `LoggerPort`. It
is fine as a plain class — no port inheritance needed — but document
that explicitly in the class JSDoc.

`MissingCapabilityError` in `requireCapabilities.js` extends bare
`Error` instead of `WarpError`. Fix during conversion.

### Family 11: Codec (~421 LOC)

| File | LOC | Port |
|------|-----|------|
| `codecs/CborCodec.js` | 421 | `CodecPort` |

Under ceiling. `cbor-x` returns `Buffer`; normalize to `Uint8Array`
at the decode boundary.

## Execution order

Convert in family order (families 8-10 first as they are leaves,
then families 3-7, then families 1-2 last because they require splits).

1. **Loggers + utilities** (families 8, 10) — no internal dependents
2. **Effect sinks** (family 7)
3. **Crypto** (family 6) — Buffer sludge cleanup
4. **CBOR transforms + stream sinks** (families 4, 9)
5. **CAS storage** (family 3)
6. **HTTP servers** (family 5) — deduplicate `PayloadTooLargeError`
7. **Codec** (family 11)
8. **InMemoryGraphAdapter split** (family 2) — write sub-adapters, rewrite facade
9. **GitGraphAdapter split** (family 1) — write sub-adapters, rewrite facade

Every commit is green. Run `npm run typecheck` + `npm run test:local`
after each family.

## Test files

Adapter tests live in `test/unit/infrastructure/`. The GitGraphAdapter
and InMemoryGraphAdapter contract tests cover the full port surface.
After the split, the contract tests must still pass against the
composition facades. Add unit tests for each sub-adapter.

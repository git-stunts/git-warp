# ADR 1 — Canonicalize Edge Property Operations Internally

## Status

Proposed

## Governed by

ADR 3 — Readiness Gates for EdgePropSet Wire-Format Cutover

## Date

2026-02-28

## Context

Edge properties are currently persisted as legacy PropSet operations whose node field encodes edge identity using a reserved `\x01` prefix and `\0` separators.

Example persisted form:

```json
{
  "type": "PropSet",
  "node": "\u0001alice\u0000bob\u0000follows",
  "key": "weight",
  "value": 0.9
}
```

This works because the reducer currently computes the materialized property-map key using `encodePropKey(op.node, op.key)`, and for legacy edge-property writes that happens to equal `encodeEdgePropKey(from, to, label, key)` by construction.

The behavior is correct, but the model is dishonest:

- `node` and `edge` property writes are both typed as `PropSet`
- reducer logic relies on an encoding coincidence
- legacy `\x01` knowledge is scattered across multiple modules
- type-level tooling cannot distinguish node property writes from edge property writes
- reserved-byte assumptions are implicit instead of enforced

We want to remove the semantic lie without changing the persisted patch format in M13.

## Decision

M13 will introduce canonical internal property op types:

- `NodePropSet`
- `EdgePropSet`

M13 will also introduce a raw/canonical op split:

- **Raw ops** are the persisted on-disk/on-wire patch operations
- **Canonical ops** are the operations seen by reducers, provenance logic, receipt generation, and query/materialization logic

For M13:

- persisted edge-property writes remain legacy raw `PropSet` operations
- decoded raw legacy edge-property `PropSet` operations are normalized into canonical `EdgePropSet`
- canonical `EdgePropSet` writes are lowered back to legacy raw `PropSet` before persistence

Normalization will happen at the decode boundary, not in the reducer.

Lowering will happen at the encode boundary, not in the builder or reducer.

## Detailed Decision

### Raw ops in M13

The persisted patch format remains:

- `NodeAdd`
- `NodeRemove`
- `EdgeAdd`
- `EdgeRemove`
- `PropSet`
- `BlobValue`

### Canonical ops in M13

The internal semantic model becomes:

- `NodeAdd`
- `NodeRemove`
- `EdgeAdd`
- `EdgeRemove`
- `NodePropSet`
- `EdgePropSet`
- `BlobValue`

### Required conversion functions

M13 will define explicit compatibility functions:

- `normalizeRawOp(rawOp) -> canonicalOp`
- `lowerCanonicalOp(canonicalOp, targetWireSchema) -> rawOp`

### Reducer behavior

The reducer will operate only on canonical ops.

It will no longer treat legacy edge-property `PropSet` as a special case implicitly. Instead:

- `NodePropSet` uses node property encoding
- `EdgePropSet` uses `encodeEdgePropKey(from, to, label, key)` directly

The reducer should defensively reject or assert on unnormalized legacy edge-property `PropSet` reaching canonical apply paths.

### Validation

New writes must reject reserved identifiers that make the legacy encoding ambiguous.

At minimum:

- reject node IDs containing `\0`
- reject node IDs beginning with `\x01`
- reject edge labels containing `\0`
- reject property keys containing `\0`

## Rationale

This gives the codebase an honest internal model immediately while preserving backward compatibility.

It solves the real maintenance problem now:

- reducers become explicit
- receipts and provenance can speak in honest terms
- type-level tooling can distinguish node and edge property writes
- legacy encoding knowledge gets isolated into one compatibility shim

It avoids the distributed-compatibility problem for now:

- no new persisted op type
- no schema-4 sync boundary in M13
- no mixed-version breakage caused by unknown op rejection
- no dangerous patch rewriting in transit

## Consequences

### Positive

- Internal code becomes semantically correct.
- Legacy encoding logic is centralized.
- Historical patches remain valid.
- Mixed-version deployments remain interoperable in M13.
- Future wire-format migration remains possible.

### Negative

- The legacy persisted encoding remains in use for now.
- The codebase will temporarily have both raw and canonical op representations.
- Some helper renaming and boundary cleanup is required.

### Non-goals

- M13 does not introduce a new persisted patch schema for edge properties.
- M13 does not remove legacy edge-property encoding from historical patches.
- M13 does not solve future wire-format migration.

## Invariants

1. Every historical legacy edge-property raw op normalizes to the same canonical `EdgePropSet`.
2. The reducer never receives a legacy edge-property `PropSet`.
3. Lowering canonical `EdgePropSet` in M13 produces the exact legacy raw encoding.
4. Materialized state is identical before and after the refactor.
5. LWW behavior is unchanged.
6. Receipts and provenance reflect canonical semantics regardless of raw source.
7. New ambiguous identifiers are rejected deterministically.

## Implementation Notes

Expected file-level impact:

- **WarpTypesV2.js**
  - add canonical typedefs/unions for `NodePropSet` and `EdgePropSet`
  - distinguish raw op types from canonical op types
- **WarpMessageCodec.js**
  - add normalization and lowering boundary
- **JoinReducer.js**
  - consume canonical ops only
  - add explicit `NodePropSet` / `EdgePropSet` handling
  - assert on unnormalized legacy edge-property `PropSet`
- **PatchBuilderV2.js**
  - construct canonical `EdgePropSet`
  - validate identifiers
- **KeyCodec.js**
  - split raw-legacy helpers from encoded-state-key helpers
- **MessageSchemaDetector.js**
  - no schema bump for M13 edge-property cleanup
  - localize legacy detection helpers
- **SyncProtocol.js**
  - no compatibility change required for M13
- **CheckpointSerializerV5.js**
  - no structural change unless bytes change

## Test Cases

### A1-T01 — Normalize legacy raw edge-property op

**Type:** unit

**Setup:** raw op `{ "type": "PropSet", "node": "\u0001alice\u0000bob\u0000follows", "key": "weight", "value": 0.9 }`

**Assert:** `normalizeRawOp()` returns `{ "type": "EdgePropSet", "from": "alice", "to": "bob", "label": "follows", "key": "weight", "value": 0.9 }`

### A1-T02 — Normalize plain node property op

**Type:** unit

**Setup:** raw op `{ "type": "PropSet", "node": "alice", "key": "color", "value": "blue" }`

**Assert:** `normalizeRawOp()` returns canonical `NodePropSet`, not `EdgePropSet`.

### A1-T03 — Lower canonical edge-property op to legacy raw form

**Type:** unit

**Setup:** canonical `EdgePropSet`

**Assert:** `lowerCanonicalOp(..., schema3)` returns a raw `PropSet` whose `node` equals `\x01alice\0bob\0follows`.

### A1-T04 — Normalize/lower round-trip is stable

**Type:** property-based

**Domain:** safe identifiers excluding reserved bytes

**Assert:** `lowerCanonicalOp(normalizeRawOp(rawLegacyEdgeProp)) === rawLegacyEdgeProp`

### A1-T05 — Encoded key identity still holds

**Type:** unit

**Assert:** `encodePropKey(encodeLegacyEdgePropNode(from, to, label), key) === encodeEdgePropKey(from, to, label, key)`

### A1-T06 — Reducer never sees unnormalized legacy edge-property ops

**Type:** unit/invariant

**Setup:** decoded historical patch containing legacy edge-property raw ops

**Assert:** reducer apply path receives only canonical ops

**Extra assert:** direct injection of legacy edge-property raw `PropSet` into canonical reducer path throws/asserts

### A1-T07 — Materialized state unchanged by refactor

**Type:** golden/integration

**Setup:** historical patch corpus or fixture repo with edge properties

**Assert:** materialized state before/after refactor is byte-for-byte identical in `state.prop`, node existence, edge topology, and visible query results

### A1-T08 — LWW behavior unchanged

**Type:** integration

**Setup:** two writes to same edge property at different Lamport times using canonical internal ops lowered to legacy raw

**Assert:** winner is unchanged from pre-refactor behavior

### A1-T09 — Receipt path uses canonical semantics

**Type:** integration

**Setup:** apply historical legacy edge-property patch through `applyWithReceipt()`

**Assert:** receipt records an edge-property semantic outcome, not a node-property semantic outcome

### A1-T10 — Provenance queries are raw-form agnostic

**Type:** integration

**Setup:** histories containing node props and legacy edge props

**Assert:** `patchesFor()` and `materializeSlice()` include correct edge-property causal contributors

### A1-T11 — Checkpoint round-trip preserves state

**Type:** integration

**Setup:** materialize state containing edge properties, serialize checkpoint, reload

**Assert:** loaded state equals original materialized state

### A1-T12 — Reserved-byte validation rejects ambiguous identifiers

**Type:** unit

**Cases:** node ID starts with `\x01`, node ID contains `\0`, label contains `\0`, property key contains `\0`

**Assert:** write path rejects all of them with deterministic errors

## Implementation Notes (Post-Facto)

### Normalization location deviation

ADR 1 specified that normalization should happen "at the decode boundary" (CBOR
decode). In practice, normalization is performed at the **reducer entry points**
(`applyFast`, `applyWithReceipt`, `applyWithDiff` in `JoinReducer.js`), not at
the codec boundary. This is a pragmatic choice: the reducer already iterates ops,
so normalizing there avoids an extra pass. The invariant is preserved — the reducer
never sees unnormalized legacy edge-property `PropSet` ops.

### KNOWN_OPS split (wire gate fix)

The initial implementation added `NodePropSet` and `EdgePropSet` to a single
`KNOWN_OPS` set. This created a subtle hazard: the sync gate in `SyncProtocol.js`
used `isKnownOp()` to fail-close on unrecognized wire types. With canonical types
in `KNOWN_OPS`, the gate would silently accept `NodePropSet`/`EdgePropSet` if they
appeared on the wire — but they must NEVER appear on the wire before ADR 2
capability cutover.

Fixed by splitting into:

- `RAW_KNOWN_OPS` — 6 raw wire types only
- `CANONICAL_KNOWN_OPS` — 8 types (adds `NodePropSet`, `EdgePropSet`)
- `isKnownRawOp()` — for sync/wire validation (used by `SyncProtocol.js`)
- `isKnownCanonicalOp()` — for internal guards
- `isKnownOp()` — deprecated alias → `isKnownRawOp` (backward compat)

Tripwire tests in `SyncProtocol.wireGate.test.js` and `JoinReducer.opSets.test.js`
ensure canonical ops are rejected at the wire boundary.

# ADR 2 — Defer Persisted EdgePropSet Wire-Format Migration Until Explicit Graph Capability Cutover

## Status

Proposed

## Governed by

ADR 3 — Readiness Gates for EdgePropSet Wire-Format Cutover

## Date

2026-02-28

## Context

A first-class persisted op of the form:

```json
{
  "type": "EdgePropSet",
  "from": "alice",
  "to": "bob",
  "label": "follows",
  "key": "weight",
  "value": 0.9
}
```

would be cleaner than the legacy raw `PropSet` encoding.

However, persisted patches are immutable Git commits. Historical commits cannot be rewritten. Writers upgrade independently. Sync currently fail-closes on unknown op types. That means introducing raw persisted `EdgePropSet` is a distributed compatibility event, not a local cleanup.

In particular:

- older readers will reject unknown raw op types
- mixed-version deployments are normal
- per-peer patch translation is dangerous because rewriting a patch payload changes the commit bytes and therefore the commit identity
- commit identity is not negotiable

## Decision

M13 will not introduce raw persisted `EdgePropSet`.

Any future introduction of raw persisted `EdgePropSet` must be governed by a separate graph-level capability cutover with explicit rules.

That future cutover must satisfy all of the following:

1. **Graph capability, not peer negotiation**
   Whether a graph may contain raw `EdgePropSet` must be determined by graph capability state, not by the version of the specific remote peer in a sync session.

2. **No per-peer patch rewriting**
   Sync must not translate committed `EdgePropSet` patches into legacy `PropSet` payloads for older peers.

3. **Fail closed for unsupported readers**
   Readers that do not support the graph capability must reject affected patches/graphs loudly.

4. **Monotonic capability ratchet**
   Once a graph is allowed to contain raw `EdgePropSet`, that capability cannot be downgraded.

5. **Checkpoint and patch version namespaces must be separate**
   Patch schema version and checkpoint format version must not share an overloaded version number space.

## Detailed Decision

### M13 behavior

Before any future cutover exists:

- all canonical `EdgePropSet` writes are lowered to legacy raw `PropSet`
- `KNOWN_OPS` for persisted patches does not expand for this feature
- mixed-version deployments continue using the legacy raw encoding

### Future cutover shape

When raw persisted `EdgePropSet` is eventually introduced, it must be behind an explicit graph capability such as:

- `minPatchSchema = 4`, or
- feature flag `edgePropSetWire = true`

The precise storage location is future work, but the decision is already made that the cutover must be graph-scoped and monotonic.

### Reader behavior after future cutover

After capability activation:

- supporting readers must accept both historical legacy edge-property raw ops and new raw `EdgePropSet`
- non-supporting readers must fail closed
- writers that observe the capability may emit raw `EdgePropSet`
- writers that do not support the capability must not continue writing to the graph

## Rationale

This avoids the fake "compatibility" of per-peer translation, which is unsafe in a content-addressed commit model.

It also keeps the eventual schema boundary honest:

- before cutover: full interoperability
- after cutover: explicit incompatibility with older readers
- no silent divergence
- no alternate commit encodings for the same logical write

## Consequences

### Positive

- Future persisted wire migration has a safe shape.
- Compatibility boundaries become explicit instead of accidental.
- Old readers either work or fail loudly.
- Git commit identity remains stable.

### Negative

- A future wire-format migration will require an operational rollout.
- Old readers will eventually lose interoperability with cutover-enabled graphs.
- There is no magical "mixed peer" compatibility trick.

### Non-goals

- This ADR does not define the exact graph capability storage format.
- This ADR does not implement the cutover now.
- This ADR does not allow peer-specific patch transcoding.

## Invariants

1. No raw persisted `EdgePropSet` is emitted before graph capability cutover.
2. Graph capability cutover is monotonic and non-reversible.
3. Sync never rewrites committed patches per peer.
4. Unsupported readers fail closed after cutover.
5. Supported readers materialize pre-cutover and post-cutover histories consistently.
6. Patch schema versioning and checkpoint format versioning are distinct namespaces.

## Future Design Constraints

When this ADR is implemented later, the design must answer:

- where graph capability state lives
- how writers discover capability state
- whether capability activation requires an explicit admin action
- what operational checks must pass before activation
- how bootstrap and checkpoint loading behave after cutover
- how old binaries detect and reject the graph early

## Test Cases

These are future-facing tests. They should exist before any raw persisted `EdgePropSet` write path is enabled.

### A2-T01 — Pre-cutover writes remain legacy raw

**Type:** integration

**Setup:** graph capability absent

**Action:** write canonical `EdgePropSet`

**Assert:** persisted patch contains legacy raw `PropSet`, not raw `EdgePropSet`

### A2-T02 — Post-cutover writes emit raw EdgePropSet

**Type:** integration

**Setup:** graph capability present and observed

**Action:** write canonical `EdgePropSet`

**Assert:** persisted patch contains raw `EdgePropSet`

### A2-T03 — Capability ratchet cannot be downgraded

**Type:** integration

**Setup:** graph capability activated

**Action:** attempt to revert or lower graph capability

**Assert:** operation fails or is ignored; graph remains at the higher capability

### A2-T04 — Unsupported reader fails closed on cutover graph

**Type:** compatibility

**Setup:** old reader without raw `EdgePropSet` support reads/syncs cutover graph

**Assert:** deterministic `SchemaUnsupportedError` or equivalent hard failure; no partial materialization

### A2-T05 — Supported reader accepts mixed historical/raw forms

**Type:** integration

**Setup:** graph history contains pre-cutover legacy edge-property patches and post-cutover raw `EdgePropSet` patches

**Assert:** materialized state is correct and deterministic

### A2-T06 — Sync path does not rewrite patch payload by remote version

**Type:** invariant/integration

**Setup:** same patch synced to two different peers with different capability levels

**Assert:** transmitted patch bytes / commit identity are identical; sender does not emit alternate encodings per peer

### A2-T07 — Capability controls write format, not peer version

**Type:** integration

**Setup:** new writer syncing with old peer before cutover

**Assert:** writer still emits legacy raw because graph capability is not active

### A2-T08 — Old reader is blocked as soon as it encounters cutover history

**Type:** compatibility

**Setup:** old reader can read pre-cutover portion of graph, then receives first raw `EdgePropSet` patch

**Assert:** failure occurs immediately at boundary; no silent ignore

### A2-T09 — Patch schema and checkpoint format versions do not collide

**Type:** unit/integration

**Setup:** patch schema version 4 exists while checkpoint format stays unchanged

**Assert:** loaders distinguish patch schema from checkpoint format unambiguously

### A2-T10 — Checkpoint created after cutover reloads correctly on supporting reader

**Type:** integration

**Setup:** cutover graph with mixed historical and raw `EdgePropSet` history

**Action:** materialize, checkpoint, reload

**Assert:** loaded state equals live materialized state

### A2-T11 — Cutover activation requires explicit graph state

**Type:** integration

**Setup:** supporting writer, no graph capability marker

**Assert:** raw `EdgePropSet` emission is forbidden even though the binary supports it

### A2-T12 — Cutover activation is observable in provenance/debug surfaces

**Type:** integration

**Assert:** admin/debug tooling can explain why the graph permits raw `EdgePropSet`, and which boundary caused old readers to fail

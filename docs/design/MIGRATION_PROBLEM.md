# The Edge Property Schema Migration Problem

**Context:** M13 SCALPEL II (B116 / STANK S2)
**Status:** Design phase — no implementation yet
**Last updated:** 2026-02-28

---

## What's Wrong Today

Edge properties in git-warp are encoded as a hack on top of node properties. There is no dedicated `EdgePropSet` operation type. Instead, the system smuggles edge property data through the existing `PropSet` op by encoding the edge identity into the `node` field with a `\x01` prefix byte.

### The Hack in Detail

When you call `setEdgeProperty('alice', 'bob', 'follows', 'weight', 0.9)`, the PatchBuilderV2 does this:

```javascript
// PatchBuilderV2.js:492
const edgeNode = `${EDGE_PROP_PREFIX}${from}\0${to}\0${label}`;
//              = '\x01alice\0bob\0follows'
this._ops.push(createPropSetV2(edgeNode, key, value));
```

This produces a standard `PropSet` operation:

```json
{
  "type": "PropSet",
  "node": "\u0001alice\u0000bob\u0000follows",
  "key": "weight",
  "value": 0.9
}
```

The JoinReducer processes it identically to a node property — it calls `encodePropKey(op.node, op.key)`, which concatenates `node + '\0' + key`. Because `op.node` is already `'\x01alice\0bob\0follows'`, the resulting map key is `'\x01alice\0bob\0follows\0weight'`, which happens to equal `encodeEdgePropKey('alice', 'bob', 'follows', 'weight')`. A mathematical identity by construction.

### Where the Discrimination Happens

The `\x01` prefix is the only way to tell edge properties from node properties. This check is scattered across the codebase in **three different syntaxes**:

| File | Syntax | Usage |
|------|--------|-------|
| `KeyCodec.js:100` | `key[0] === EDGE_PROP_PREFIX` | `isEdgePropKey()` predicate |
| `MessageSchemaDetector.js:53` | `op.node.startsWith(EDGE_PROP_PREFIX)` | Schema version detection |
| `PatchBuilderV2.js:492` | `\`${EDGE_PROP_PREFIX}${from}\0${to}\0${label}\`` | Encoding at write time |

All three are semantically equivalent, but the inconsistency means a reader must know all three patterns to audit the system. The `isEdgePropKey()` function in KeyCodec.js is the canonical predicate, but not every call site uses it.

### Why This Is Bad (The STANK Diagnosis)

1. **No type-level distinction.** An `OpV2PropSet` has `type: 'PropSet'` whether it's a node property or an edge property. The only discriminator is a runtime byte check on the `node` field. Type-level tooling (JSDoc, TypeScript consumers) cannot distinguish them.

2. **Collision risk.** If a node ID ever starts with `\x01`, its properties become indistinguishable from edge properties. The system has no validation preventing this — it relies on the assumption that node IDs are user-supplied strings that will never start with a control character.

3. **Scattered encoding knowledge.** The encode/decode/discriminate logic lives in `KeyCodec.js`, `PatchBuilderV2.js`, `MessageSchemaDetector.js`, `query.methods.js`, `JoinReducer.js`, and `StateSerializerV5.js`. Anyone adding a feature that touches properties must know the `\x01` convention or risk corruption.

4. **Schema version detection depends on op content, not op type.** `detectSchemaVersion()` scans ops looking for PropSet operations whose `node` field starts with `\x01`. A new `EdgePropSet` type would make schema detection trivial: does the ops array contain any `EdgePropSet`? Yes → schema 4.

5. **The JoinReducer doesn't know.** The reducer's `PropSet` case doesn't distinguish node properties from edge properties. It processes both through `encodePropKey(op.node, op.key)` and relies on the mathematical identity to produce the correct map key. This works, but it means the reducer has zero awareness of what it's actually doing — a maintenance hazard.

---

## What the Fix Looks Like (Proposed)

Introduce a new operation type `EdgePropSet` at schema version 4:

```text
// New op type
{
  type: 'EdgePropSet',
  from: 'alice',
  to: 'bob',
  label: 'follows',
  key: 'weight',
  value: 0.9
}
```

New writes emit `EdgePropSet`. The JoinReducer gets a dedicated case that encodes the map key directly via `encodeEdgePropKey(from, to, label, key)`. Schema detection checks for `type === 'EdgePropSet'` instead of inspecting the `node` field contents.

This is conceptually simple. The complexity is entirely in backwards compatibility.

---

## Why This Is Hard

### 1. Patches Are Immutable Git Commits

Every patch ever written is a Git commit. The commit message contains CBOR-encoded operation data. You cannot rewrite these commits — that would destroy the content-addressed integrity that the entire system is built on.

This means **every `PropSet` op with a `\x01`-prefixed `node` field that has ever been committed will exist forever.** Old patches don't get migrated. They must be understood by all future readers.

### 2. No Central Coordinator

git-warp is a multi-writer CRDT. Writers operate independently, pushing patches to their own ref chains without coordination. There is no upgrade ceremony, no version negotiation, no "all writers must upgrade before proceeding."

This means a graph can have:
- Writer A running v12.2.x (schema ≤3, emits `PropSet` for edge properties)
- Writer B running v13.x (schema 4, emits `EdgePropSet`)
- Both writing concurrently to the same graph

Materialization must produce **identical results** regardless of which writer wrote which ops, and regardless of which patches arrive first.

### 3. The Semantic Identity Must Hold Across Versions

The following must produce the same materialized state:

**Writer A (v12, schema 3):**
```json
{ "type": "PropSet", "node": "\u0001alice\u0000bob\u0000follows", "key": "weight", "value": 0.9 }
```

**Writer B (v13, schema 4):**
```json
{ "type": "EdgePropSet", "from": "alice", "to": "bob", "label": "follows", "key": "weight", "value": 0.9 }
```

Both must resolve to the same map key (`\x01alice\0bob\0follows\0weight`) in `state.prop`, and LWW conflict resolution must work correctly across both op formats. If Writer A sets `weight = 0.9` at Lamport 5 and Writer B sets `weight = 0.5` at Lamport 7, the result must be `0.5` — regardless of schema version.

### 4. Schema Version Boundary: Who Can Read What

The current schema compatibility model is:

| Reader Schema | Can Read Schema 2 | Can Read Schema 3 | Can Read Schema 4 |
|--------------|-------------------|-------------------|-------------------|
| 2 (pre-7.3) | Yes | **No** (rejects edge prop ops) | **No** |
| 3 (7.3+) | Yes | Yes | ??? |
| 4 (M13+) | Yes | Yes | Yes |

The open question: **Can schema 3 readers understand schema 4 patches?**

**Option A: Yes (lenient).** Schema 3 readers silently ignore unknown `EdgePropSet` ops (the current `default` case in the reducer). Edge properties written by v4 writers would be invisible to v3 readers, causing **silent data divergence** — v3 and v4 materializations produce different states.

**Option B: No (strict).** Schema 3 readers reject schema 4 patches via `isKnownOp()` (which was added in M12 for exactly this scenario). Sync between v3 and v4 writers fails with `SchemaUnsupportedError`. This is safe but requires all writers to upgrade simultaneously.

**Option C: Translate-on-read (ideal).** Schema 4 readers translate old `PropSet`-with-`\x01` ops to `EdgePropSet` at decode time. Schema 3 readers already understand `PropSet`-with-`\x01` and will correctly process new `EdgePropSet` ops IF the read-path translator converts them back to `PropSet`-with-`\x01` for the reducer.

Option C is the only one that preserves full interoperability, but it adds a translation layer that must be bug-free or the entire CRDT diverges.

### 5. The `isKnownOp` Gate (C2 Fix) Blocks Unknown Types

The M12 fix for C2 added `isKnownOp()` validation in the sync path (`SyncProtocol.js:565`). It currently checks against a hardcoded set:

```javascript
const KNOWN_OPS = new Set(['NodeAdd', 'NodeRemove', 'EdgeAdd', 'EdgeRemove', 'PropSet', 'BlobValue']);
```

If a v12 reader receives a patch containing `EdgePropSet` from a v13 writer, `isKnownOp()` returns `false` and sync throws `SchemaUnsupportedError`. This is exactly the fail-closed behavior we wanted — but it means **v12 and v13 writers cannot sync** unless the v12 reader is taught to translate `EdgePropSet` → `PropSet`-with-`\x01`.

This creates a hard boundary: either all writers upgrade, or there must be a translation layer.

### 6. Checkpoints and Indexes Are Stateless

Checkpoints serialize the materialized `WarpStateV5` object — they don't store individual ops. The `state.prop` map contains encoded keys regardless of which op type produced them. So checkpoints are naturally version-agnostic.

But: the checkpoint **schema version** field (`indexTree ? 4 : 2`) would need to account for the new schema. And if a v13 checkpoint is loaded by a v12 reader, the encoded edge property keys in `state.prop` still use the `\x01` prefix, so the v12 reader can process them correctly — as long as the checkpoint schema number doesn't cause a rejection.

Bitmap indexes are similarly agnostic — they store node IDs and edge topology, not property encoding details. No index changes needed.

### 7. The Receipt Path

`applyWithReceipt()` in JoinReducer produces tick receipts that record which ops were applied and their outcomes. The receipt format includes the op type. Adding `EdgePropSet` means receipts will contain a new type that older audit tooling won't recognize.

The existing receipt-path runtime guards (C3 fix, M12.T3) validate op shapes in each switch case. A new `EdgePropSet` case must be added with its own shape validation.

### 8. Provenance Tracking

`PatchBuilderV2` tracks `_observedOperands` and `_writes` for provenance. The current `setEdgeProperty()` adds the edge key to both sets. A new `EdgePropSet` op type would naturally carry `from`/`to`/`label` fields, making provenance tracking more explicit — but the provenance queries (`patchesFor`, `materializeSlice`) must understand both old and new formats.

---

## The Coordinated File Changes

This is not a single-file fix. The following files must be updated in lockstep:

| File | Change |
|------|--------|
| `WarpTypesV2.js` | New `OpV2EdgePropSet` typedef + `createEdgePropSetV2()` factory. Add to `OpV2` union. |
| `JoinReducer.js` | New `case 'EdgePropSet'` in `applyOpV2()` and `applyWithReceipt()`. Add `'EdgePropSet'` to `KNOWN_OPS`. |
| `PatchBuilderV2.js` | `setEdgeProperty()` emits `EdgePropSet` instead of `PropSet`-with-`\x01`. |
| `KeyCodec.js` | No structural change, but `encodeEdgePropKey()` gets used directly by the reducer instead of relying on the mathematical identity. |
| `MessageSchemaDetector.js` | New `SCHEMA_V4 = 4` constant. `detectSchemaVersion()` checks for `type === 'EdgePropSet'`. `assertOpsCompatible()` gets a v3→v4 boundary check. |
| `WarpMessageCodec.js` | Read-path translator: convert `PropSet`-with-`\x01` ops to `EdgePropSet` at decode time (for schema ≤3 patches read by schema 4 readers). |
| `SyncProtocol.js` | `isKnownOp()` already gates unknown types. May need compatibility shim for mixed-version sync. |
| `CheckpointSerializerV5.js` | Checkpoint schema version field may need updating. No structural change (state encoding is agnostic). |

If any one of these is wrong, materialization diverges silently between readers.

---

## The Translation Strategy: Proposed Approach

### Read-Path Normalization (Translate-on-Read)

The safest approach: normalize all ops to the new format at read time, before they reach the reducer.

```text
Git commit (raw bytes)
  → CBOR decode
  → Op normalization layer (NEW)
      - PropSet with \x01 node → EdgePropSet { from, to, label, key, value }
      - PropSet without \x01 → PropSet (unchanged)
      - EdgePropSet → EdgePropSet (pass-through)
  → JoinReducer (only sees EdgePropSet, never PropSet-with-\x01)
```

**Advantages:**
- JoinReducer never sees the old hack — clean code path
- Single translation point (patch decode)
- Old patches and new patches produce identical internal representation
- Schema detection becomes trivial

**Disadvantages:**
- Must handle decode of every historical patch ever committed (performance)
- Translation errors are catastrophic (CRDT divergence)
- The normalization layer must be 100% bijective — old-format encode must round-trip through new-format decode

### Write-Path: New Ops Only

New writes emit `EdgePropSet` unconditionally. The `PatchBuilderV2._hasEdgeProps` flag is replaced with `_hasEdgePropSet` to detect schema 4.

### Sync-Path: Compatibility Window

During the migration window (v12 and v13 writers coexist):

1. **v13 writer → v13 reader:** `EdgePropSet` ops pass through. Schema 4.
2. **v12 writer → v13 reader:** `PropSet`-with-`\x01` ops are normalized to `EdgePropSet` at decode time. Transparent.
3. **v13 writer → v12 reader:** `EdgePropSet` ops hit `isKnownOp()` gate → `SchemaUnsupportedError`. **Sync fails.**
4. **v12 writer → v12 reader:** `PropSet`-with-`\x01` ops work as today. Schema 3.

Case 3 is the hard one. Two options:

**Option 3a: Accept the hard boundary.** v12 and v13 writers cannot sync. Operators must upgrade all writers before enabling edge property writes from v13. This is the simplest and safest approach but requires coordination — which violates the "no coordinator" design principle.

**Option 3b: Emit dual ops.** v13 writers emit `EdgePropSet` for schema 4 readers AND the equivalent `PropSet`-with-`\x01` for schema 3 readers. Wasteful (2x op count for edge properties) but allows mixed-version sync. The v13 reducer ignores the duplicate `PropSet` (idempotent LWW), and the v12 reducer ignores the unknown `EdgePropSet` (falls through default case... wait, no — `isKnownOp()` rejects it). So this doesn't work either.

**Option 3c: Version negotiation at sync time.** The sync protocol already exchanges capability information. Add a `maxSchema` field. If the remote reports `maxSchema < 4`, the sender translates `EdgePropSet` back to `PropSet`-with-`\x01` before transmission. This preserves interoperability but adds sync protocol complexity.

**Option 3d: Just wait.** Don't remove the old `PropSet`-with-`\x01` write path. Keep the old write format and add the new `EdgePropSet` as a read-path normalization + future write format behind a feature flag. Flip the flag once all writers in a cluster have upgraded. This is pragmatic but means the hack lives on indefinitely.

---

## Open Design Questions

1. **Which sync compatibility strategy?** 3a (hard boundary), 3c (negotiation), or 3d (deferred flip)?

2. **Where does normalization live?** In `WarpMessageCodec.decodePatchMessage()` (single decode site) or in `JoinReducer.applyOpV2()` (keep both paths in the reducer)?

3. **Should `PropSet`-with-`\x01` detection be removed from `isEdgePropKey()`?** If the reducer only ever sees `EdgePropSet`, the predicate becomes dead code. But it's still needed for checkpoint deserialization (state.prop map keys still use the `\x01` encoding).

4. **Does `SCHEMA_V4` change the checkpoint schema number?** Checkpoints serialize state, not ops. The state encoding is unchanged. But the checkpoint schema field is currently `indexTree ? 4 : 2` — this would collide with the new patch schema 4. Need to disambiguate.

5. **What is the minimum test matrix?**
   - v3-only patches → materialize → expected state
   - v4-only patches → materialize → expected state (identical)
   - Mixed v3+v4 patches from different writers → materialize → expected state (identical)
   - LWW tiebreaker across v3 and v4 ops → correct winner
   - Checkpoint created from mixed-schema state → load → correct state
   - Sync between v3 and v4 writers → correct behavior per chosen strategy
   - `patchesFor()` / `materializeSlice()` with mixed-schema provenance → correct causal cones
   - `noCoordination.test.js` with mixed-version writers → passes

6. **Can we leverage the `BlobValue` op precedent?** `BlobValue` was added as a new op type without a schema bump. How was that handled? Does it provide a pattern we can reuse?

---

## Summary

The edge property encoding is a clever hack that works correctly today. The migration is not about fixing broken behavior — it's about eliminating a maintenance hazard and making the op model honest. The real difficulty is:

1. **Immutable history** — old patches can never be rewritten
2. **No coordinator** — writers upgrade independently
3. **Deterministic materialization** — all readers must produce identical state from the same patches, regardless of their software version
4. **The `isKnownOp` gate** — the C2 fix that protects against silent data loss also blocks forward compatibility

The safest path is read-path normalization (translate old ops at decode time) combined with either a hard upgrade boundary (3a) or sync-time version negotiation (3c). The implementation touches 8 files in lockstep and requires a cross-schema test matrix to verify deterministic materialization.

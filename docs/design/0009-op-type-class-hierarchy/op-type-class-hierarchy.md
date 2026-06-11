# Cycle 0009 — Op Type Class Hierarchy

**Status:** HILL MET

**Date:** 2026-04-05

## Sponsors

- **Human:** James Ross
- **Agent:** Claude (Opus)

## Hill

Replace 8 typedef ops with a frozen class hierarchy so the domain
model has runtime identity, constructor validation, and `instanceof`
dispatch — eliminating all string-based tag switching.

## Playback questions

### Agent questions

1. Does `new NodeAdd(nodeId, dot)` throw when `nodeId` is empty or
   `dot` is not a `Dot`?
2. Does `op instanceof NodeAdd` return true for NodeAdd instances and
   false for EdgeAdd instances?
3. Does `instanceof Op` return true for all 8 op subclasses?
4. Are all op instances frozen (`Object.isFrozen(op) === true`)?
5. Does `OpNormalizer.normalizeRawOp()` return canonical op class
   instances (`NodePropSet`, `EdgePropSet`)?
6. Does `OpNormalizer.lowerCanonicalOp()` return raw op class
   instances (`PropSet`)?
7. Does `JoinReducer.OP_STRATEGIES` dispatch by `instanceof` instead
   of string keys?
8. Do factory functions in WarpTypesV2.js delegate to constructors?
9. Does the CBOR decode boundary produce op class instances (not
   plain objects)?

### Human questions

1. Can I still do `patch.addNode('user:alice')` and have it just
   work?
2. Does `git warp history` still show op types correctly?
3. Do existing patches in a real repo still materialize identically?

## Scope

### What changes

| Component | Change |
|---|---|
| `src/domain/types/ops/` | New directory. 8 op classes + base `Op` class. One file per class. |
| `src/domain/types/WarpTypesV2.js` | Factory functions delegate to constructors. Typedefs become re-exports. |
| `src/domain/services/OpNormalizer.js` | `normalizeRawOp` returns class instances. `lowerCanonicalOp` uses `instanceof`. |
| `src/domain/services/JoinReducer.js` | `OP_STRATEGIES` keyed by class reference, not string. Lookup via `instanceof` chain or class-to-strategy Map. |
| `src/domain/types/TickReceipt.js` | `OP_TYPES` array becomes class references or derives names from classes. |
| `src/domain/services/codec/MessageSchemaDetector.js` | `instanceof` checks replace string comparisons. |
| `bin/presenters/text.js` | `instanceof` checks replace string comparisons. |
| `src/domain/services/PatchBuilderV2.js` | Builds canonical op class instances internally. `build()`/`commit()` lower via `lowerCanonicalOp`. |
| CBOR decode boundary | `CborCodec` or `CborPatchJournalAdapter` hydrates plain objects into op classes. |

### Delivered vs. Deferred

| Component | Status |
|---|---|
| `src/domain/types/ops/` | **Delivered** — 9 classes + validate.js |
| `src/domain/types/WarpTypesV2.js` | **Delivered** — factory functions delegate to constructors |
| `src/domain/services/OpNormalizer.js` | **Delivered** — returns class instances via factory functions |
| `src/domain/services/JoinReducer.js` | **Deferred** — OP_STRATEGIES still string-keyed (works with class instances via .type). See `PROTO_op-consumer-instanceof-migration` |
| `src/domain/types/TickReceipt.js` | **Deferred** — See `PROTO_op-consumer-instanceof-migration` |
| `src/domain/services/codec/MessageSchemaDetector.js` | **Deferred** — See `PROTO_op-consumer-instanceof-migration` |
| `bin/presenters/text.js` | **Deferred** — See `PROTO_op-consumer-instanceof-migration` |
| `src/domain/services/PatchBuilderV2.js` | **Not needed** — already uses factory functions which now produce class instances |
| CBOR decode boundary | **Deferred** — See `PROTO_cbor-op-hydration` |

### What does NOT change

- Wire format. Persisted patches remain CBOR with `{ type: 'NodeAdd', ... }` plain objects. The class boundary is at decode, not encode.
- PatchV2 class. It holds `ops: Op[]` instead of `ops: PatchOp[]` but the shape is the same.
- CRDT semantics. JoinReducer mutation logic is identical.
- Public API surface. `createPatch().addNode()` still works.

## Non-goals

- Moving strategy methods onto op classes. That's the JoinReducer
  strategy registry cycle (separate design doc exists). This cycle
  gives ops runtime identity; behavior coupling is a follow-on.
- Changing the wire format. ADR-0002 defers that.
- Touching test files that construct ops with plain objects — those
  become integration tests for the CBOR decode hydration path.

## Accessibility / assistive reading posture

Not applicable — no UI changes.

## Localization / directionality posture

Not applicable — no user-facing strings.

## Agent inspectability / explainability posture

Op classes are `instanceof`-dispatchable and frozen. An agent can
inspect any op with `op.constructor.name` and get a meaningful
domain name. This is strictly better than the current string tags
for agent tooling.

## Cut plan

### Slice 1 — Op classes + tests (RED then GREEN)

- Base `Op` class (abstract-ish — no direct instantiation)
- 8 subclasses: `NodeAdd`, `NodeRemove`, `EdgeAdd`, `EdgeRemove`,
  `NodePropSet`, `EdgePropSet`, `PropSet`, `BlobValue`
- Constructor validation, freeze, instanceof
- Factory functions in WarpTypesV2.js delegate to constructors

### Slice 2 — OpNormalizer + tests

- `normalizeRawOp` returns class instances
- `lowerCanonicalOp` uses `instanceof`
- Round-trip: raw → canonical → raw preserves identity

### Slice 3 — JoinReducer wiring + tests

- `OP_STRATEGIES` lookup by constructor, not string
- `RAW_KNOWN_OPS` / `CANONICAL_KNOWN_OPS` become class-based checks
- Existing noCoordination test suite must pass unchanged

### Slice 4 — Consumer wiring (presenter, detector, receipt)

- `MessageSchemaDetector` uses `instanceof`
- `bin/presenters/text.js` uses `instanceof`
- `TickReceipt.OP_TYPES` derives from class hierarchy

### Slice 5 — CBOR hydration boundary

- Decode path hydrates plain objects into op class instances
- Golden blob round-trip test: encode → decode → class instance

## Hard gates

- **noCoordination test suite passes unchanged.** This is the
  multi-writer safety regression suite. Non-negotiable.
- **Existing BATS CLI tests pass.** No user-visible behavior change.
- **Wire format compatibility.** Encode a patch with the new classes,
  decode with the old code path — must produce identical state.

# WarpStateV5.prop carries `LWWRegister<unknown>` — the value type is a lie

**Effort:** M

## What's wrong

`WarpStateV5.prop: Map<string, LWWRegister<unknown>>` — the stored property
value is typed `unknown`. The `unknown` propagates through every caller:

- `_mergeProps`, `_mutateProp`, `_snapshotProp`, `_accumulatePropDiff`
  helpers on `OpStrategy`
- `ReceiptBuilder.propOutcomeForKey` / `propSetOutcome` /
  `edgePropSetOutcome`
- `PatchDiff.propsChanged[].value` / `.prevValue`
- Every `Op` subclass that carries a `value` field (`PropSet`,
  `NodePropSet`, `EdgePropSet`)
- `MigrationService` (inherited from the target type)
- The CBOR codec layer
- The serializer (`CheckpointSerializerV5`, `StateSerializerV5`)

Nothing downstream can reason about what a prop value actually is.
Everything reads it as `unknown` and either stringifies it, compares it,
or passes it through.

## Why it's load-bearing

SSTS rule: "No `unknown` outside parser functions." The prop value is
read and written all over the domain, not just at boundaries. It is
unknown-by-design in the current code, and the design is wrong.

It also blocks the cleanup of `LWWRegister<T>` consumers that are forced
to instantiate with `<unknown>` at the call site.

## What needs to happen

1. **Investigation phase** (probably its own ADR): determine what a prop
   value actually is at runtime. Candidates:
   - `Uint8Array` only (git-warp is bytes-in/bytes-out at the wire level)
   - `JsonValue` (null | boolean | number | string | array | object)
   - `PropValue` recursive union that includes `Uint8Array` + JSON
   - Something else entirely that the serializer enforces
2. **Decision as ADR**: record the canonical value shape and the
   rationale.
3. **Implementation phase**: define `PropValue` (or pick the right
   existing type), cascade it through the 20-30 affected files in a
   single dedicated slice.

This MIGHT reveal that the honest answer is `unknown` at a specific
boundary (arbitrary opaque payloads). If so, the "fix" is to document
the boundary explicitly and confine `unknown` to that one parser
function — not sprinkle it throughout.

## Severity

HIGH. Persistent sludge at the heart of the domain. Every turn that
touches prop-value code propagates the lie.

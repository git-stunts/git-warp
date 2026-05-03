---
id: PROTO_v17-reducer-capability-boundary
feature: v17-optics-checkpoint-tail
blocked_by:
  - 0117-v17-plumber-recovery-contract
blocks: []
---

# v17 Reducer Capability Boundary

**Effort:** S

## Hill

Define the complete v17 checkpoint-tail reducer capability surface and require
fail-closed behavior outside it.

## Problem

The implementation already has a deliberate boundary:

- `NodeAdd` in the tail can update liveness.
- `NodePropSet` in the tail can project scalar and `Uint8Array` values.
- `NodeRemove` in the tail fails closed because raw liveness witnesses are
  required.
- object and array property values in the tail fail closed because the reducer
  does not own that parser boundary.

That behavior is now characterized by tests, but it is not yet a binding
capability contract.

## Must Define

Supported in v17 tail reduction:

- node liveness from `NodeAdd`
- property projection from `NodePropSet` values that are:
  - `string`
  - `number`
  - `boolean`
  - `null`
  - `Uint8Array`

Unsupported in v17 tail reduction:

- `NodeRemove`
- object property values
- array property values
- edge liveness
- edge properties
- attachments
- recursive WARP payloads
- neighbor slices

## Required Guarantee

The reducer must fail closed outside the supported set. It must not:

- guess liveness after `NodeRemove`
- parse object or array tail values ad hoc
- call `_materializeGraph()`
- call `materialize()`
- read `state.cbor`
- return a partial value as if it were complete

## Acceptance

- The v17 reducer support matrix is explicit.
- Every unsupported tail case names a recovery operation or a future backlog
  direction.
- Existing tests for `NodeRemove` and object property tails are cited as
  characterization evidence.
- Future support broadening must update this boundary first.

## Non-Goals

- No raw liveness witness support.
- No full property decoding.
- No neighbor optic.
- No attachment optic.
- No recursive WARP optic.
- No reducer implementation changes.

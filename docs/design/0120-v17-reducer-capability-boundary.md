# 0120 v17 Reducer Capability Boundary

- Status: `design-only contract hill`
- Release lane: `v17.0.0`
- Source: `PROTO_v17-reducer-capability-boundary`
- Design role: exact checkpoint-tail optic reducer support matrix
- Depends on:
  - `0117-v17-plumber-recovery-contract`
  - `0118-v17-optic-error-contract`
  - `0119-v17-tail-budget-semantics`

## Hill

Define the v17 reducer capability boundary for checkpoint-tail optic reads.
Outside this matrix, reads fail closed or remain unsupported selector scopes.

No runtime behavior changes are part of this cycle.

## Current Evidence

| Evidence | Current behavior |
| --- | --- |
| `CheckpointShardFactReader.readNodeAlive` | reads targeted checkpoint liveness shard |
| `CheckpointShardFactReader.readProperty` | reads targeted checkpoint property shard |
| `CheckpointTailFactReducer.reduceNodeLiveness` | folds target tail `NodeAdd`; fails on target tail `NodeRemove` |
| `CheckpointTailFactReducer.reduceProperty` | folds target tail `NodePropSet` with LWW projection |
| `v17CheckpointTailOpticReadBasis.test.ts` | pins no-materialization, missing basis, tail `NodeRemove`, unsupported tail object value |

## Supported Facts

| Surface | Fact | Supported value / effect | Notes |
| --- | --- | --- | --- |
| checkpoint node read | node liveness | alive / not alive | Targeted `meta_${shard}.cbor`; no `state.cbor`. |
| checkpoint property read | node property | `PropValue` or missing | Targeted `props_${shard}.cbor`; checkpoint parser owns value shape. |
| tail node read | `NodeAdd` for target node | alive becomes `true` | Tail witness is evidence. |
| tail property read | `NodePropSet` string | LWW value | Uses tail event identity. |
| tail property read | `NodePropSet` number | LWW value | Uses tail event identity. |
| tail property read | `NodePropSet` boolean | LWW value | Uses tail event identity. |
| tail property read | `NodePropSet` null | LWW value | Uses tail event identity. |
| tail property read | `NodePropSet` `Uint8Array` | LWW value | Uses tail event identity. |

## Unsupported Matrix

| Case | v17 outcome | `context.cause` | Recovery now | Future work |
| --- | --- | --- | --- | --- |
| target tail `NodeRemove` | `E_OPTIC_NO_BOUNDED_BASIS` | `tail-node-remove-needs-raw-liveness-witnesses` | `plumber.checkpoint.createIndexedBasis` | raw liveness witness support |
| target tail object property value | `E_OPTIC_NO_BOUNDED_BASIS` | `tail-property-value-needs-parser` | `plumber.checkpoint.createIndexedBasis` | tail property parser widening |
| target tail array property value | `E_OPTIC_NO_BOUNDED_BASIS` | `tail-property-value-needs-parser` | `plumber.checkpoint.createIndexedBasis` | tail property parser widening |
| edge liveness optic | `E_OPTIC_NO_BOUNDED_BASIS` if exposed | `unsupported-worldline-selector` | none | edge optic contract |
| edge property optic | `E_OPTIC_NO_BOUNDED_BASIS` if exposed | `unsupported-worldline-selector` | none | edge property optic contract |
| neighbor slice optic | `E_OPTIC_NO_BOUNDED_BASIS` if exposed | `unsupported-worldline-selector` | none | neighbor slice contract |
| attachment optic | `E_OPTIC_NO_BOUNDED_BASIS` if exposed | `unsupported-worldline-selector` | none | attachment optic contract |
| recursive WARP optic | `E_OPTIC_NO_BOUNDED_BASIS` if exposed | `unsupported-worldline-selector` | none | recursive optic contract |

Edge, neighbor, attachment, and recursive WARP rows are selector-scope
boundaries. The current v17 public optic surface is node and node-property
reads. Unrelated tail ops outside the requested node/property fact do not make
that fact fail.

## Checkpoint Recovery Rule

`plumber.checkpoint.createIndexedBasis` can recover only cases where the
unsupported tail fact becomes an ordinary checkpoint fact:

| Unsupported tail fact | Checkpoint can recover? | Reason |
| --- | --- | --- |
| target `NodeRemove` | yes | checkpoint liveness stores the post-reduce alive fact |
| target object property value | yes | checkpoint property shard stores the property value |
| target array property value | yes | checkpoint property shard stores the property value |
| edge / neighbor / attachment / recursive scope | no | no v17 public optic contract exists for that scope |

Creating a checkpoint is not automatic and does not broaden the reducer.

## Fail-Closed Rule

Unsupported reducer capability means the read lacks complete evidence for the
requested result. The runtime must not:

- guess node liveness after tail `NodeRemove`
- parse object or array tail values ad hoc
- return checkpoint-only data while hiding an unsupported tail witness
- call `_materializeGraph()` or `materialize()`
- read `state.cbor`
- emit fake `stateHash`

No partial `NodeOpticReadResult`, `NodePropertyOpticReadResult`, or complete
`readIdentity` may be returned for failed reductions.

## Playback Questions

- Does each unsupported in-scope tail case map to one 0118 cause?
- Can a fresher checkpoint recover this case, or does it need future reducer
  work?
- Is any forbidden shortcut being used instead of failing closed?

## Non-Goals

- No runtime implementation.
- No reducer broadening.
- No parser broadening.
- No raw liveness witness support.
- No edge, neighbor, attachment, or recursive optic.
- No materialization fallback.
- No release artifact, tag, or version bump.

## Follow-On Work

This closes the current v17 contract-doc sequence. Runtime implementation
hills must be pulled separately and must preserve 0117, 0118, 0119, and this
boundary.

## Validation

Run for this design-only cycle:

```sh
npx markdownlint docs/design/0117-v17-plumber-recovery-contract.md \
  docs/design/0118-v17-optic-error-contract.md \
  docs/design/0119-v17-tail-budget-semantics.md \
  docs/design/0120-v17-reducer-capability-boundary.md
git diff --check
npm run lint:sludge
```

## SLUDGE STRIKER SUMMARY

- Fixed: reducer support is now an explicit table.
- Rejected: hidden materialization, ad hoc parsers, partial results.
- Deferred: raw liveness witnesses and broader optic families.

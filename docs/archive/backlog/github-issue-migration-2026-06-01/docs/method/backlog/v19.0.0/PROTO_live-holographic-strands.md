---
id: PROTO_live-holographic-strands
feature: observer-admission-runtime
blocked_by:
  - PROTO_observer-plan-reading-envelopes
  - PROTO_witnessed-suffix-admission-shells
blocks: []
---

# Live holographic strands

## Why

The runtime still teaches the older strand model:

- pinned base observation
- frozen frontier digest
- overlay chain replayed over that frozen base

That is older than current WARP doctrine. The shipped strand semantics
need to move to basis-relative realization over inherited parent
history with owned local divergence.

## What it should look like

- public strand semantics are live-following by default
- a strand stores parent lane identity, anchor coordinate, owned local
  divergence, validation witness, and optional braid support
- untouched regions read through to the chosen parent basis
- touched regions require revalidation when parent changes overlap the
  owned footprint
- braid validation uses common-basis normalization, not byte-identical
  pinned bases

## Done looks like

- `StrandDescriptor` is no longer centered on frozen
  `baseObservation.frontier`
- `StrandMaterializer` resolves against a chosen parent basis
- braid validation speaks common-basis normalization honestly
- tests prove parent drift flows through outside owned regions and
  forces conflict/revalidation inside them

## Starting points

- `src/domain/types/StrandDescriptor.ts`
- `src/domain/services/strand/StrandCoordinator.ts`
- `src/domain/services/strand/StrandMaterializer.ts`
- `src/domain/services/strand/StrandDescriptorStore.ts`

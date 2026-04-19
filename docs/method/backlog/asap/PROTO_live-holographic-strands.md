# Live holographic strands

Refines:

- `docs/design/worldline-observer-strand-model.md`
- `docs/design/strand-intent-ticks.md`

## Why

git-warp's public docs are now ahead of the runtime here. The runtime
still treats a strand as:

- a pinned base observation
- a frozen frontier digest
- an overlay chain replayed on top of that frozen base

That is coherent, but it is the older model. Current WARP doctrine is
stronger: a strand is a real speculative lane whose realised state is
resolved against inherited parent history at the chosen basis, with
copy-on-write ownership only over the closed optic footprint that the
local divergence actually needs.

git-warp needs a corrective cut before the pinned-base descriptor
becomes the permanent ontology.

## What it should look like

- Public strand semantics are live-following by default.
- A strand stores:
  - parent lane identity
  - anchor coordinate
  - local divergence / owned regions
  - validation witness
  - optional support/braid references
- Untouched regions read through to the currently chosen parent basis.
- Touched regions are local and must be revalidated when the parent
  changes inside their owned footprint.
- Materialization is basis-relative and holographic:
  - resolve the parent reading at the chosen basis
  - overlay the strand-owned divergence
  - slice only the backward causal cone needed for the request
- Braiding does not require identical pinned base observations.
  Braiding requires normalization to a common basis and produces a
  plural object over that basis.
- Child-worldline or overlay-chain machinery may remain as a storage
  tactic, but not as the semantic definition of a strand.

## Done looks like

- `StrandDescriptor` is no longer centered on a frozen
  `baseObservation.frontier` as the semantic heart of the strand.
- `StrandMaterializer` can resolve against a chosen parent basis rather
  than only replaying a pinned frozen base plus overlay patches.
- braid validation is defined in terms of common-basis normalization,
  not "base observations must be byte-identical".
- one test proves parent changes outside the owned footprint flow
  through
- one test proves overlapping parent changes force revalidation or
  explicit conflict

## Starting points

- `src/domain/types/StrandDescriptor.ts`
- `src/domain/services/strand/StrandCoordinator.ts`
- `src/domain/services/strand/StrandMaterializer.ts`
- `src/domain/services/strand/StrandDescriptorStore.ts`

## Non-goals

- Do not design final human-facing braid UX here.
- Do not require immediate major-version public API polish in the
  first implementation cut.
- Do not remove existing pinned-coordinate reads that remain useful as
  explicit frozen-coordinate operations.

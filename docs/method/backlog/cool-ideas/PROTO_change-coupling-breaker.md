# PROTO_change-coupling-breaker

**Title:** Break change-coupling chains via extracted shared types

## Idea

The top change-coupling pairs (PatchBuilderV2 <-> CheckpointService:
22x, PatchBuilderV2 <-> JoinReducer: 20x) suggest these files share
concepts that aren't extracted. When two files always change together,
they're either doing the same thing (merge them) or sharing a concept
that lives in neither (extract it). The shared concept is likely the
patch format + state projection types. Extracting these to dedicated
type files would let each service import the types without importing
each other, breaking the coupling chain.

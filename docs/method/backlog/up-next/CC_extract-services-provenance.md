# Extract provenance/ from domain/services/

Move the 3 provenance files into `src/domain/services/provenance/`.

## Files

- ProvenanceIndex.js (336)
- ProvenancePayload.js (241)
- BoundaryTransitionRecord.js (598)

Note: ProvenanceController.js (243) stays in controllers/.

## Why

Paper III implementation — provenance payloads, BTRs, causal
indexing. Cohesive cluster with clear single responsibility.

## Scope

Move files, update imports. No behavioral changes.

## Source

Cycle 0004 analysis.

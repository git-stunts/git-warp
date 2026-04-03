# BEARING

Updated at cycle boundaries. Not mid-cycle.

## Where are we going?

Structural decomposition of `domain/services/` — 83 files in a flat
directory becoming 10 cohesive subdirectories. 10 extraction backlog
items queued in `up-next/` under the CC legend.

## What just shipped?

Cycle 0004 (domain-services-audit). Design-only cycle — import graph
analysis, 10 cohesive groups identified, no circular dependencies.

## What feels wrong?

- WorldlineSource is still a tagged object, not a subclass hierarchy.
- `defaultCodec.js` lives in `domain/utils/` but imports `cbor-x`
  directly — a hexagonal boundary violation.
- The two legends (CLEAN_CODE, NO_DOGS_NO_MASTERS) overlap
  significantly. May need consolidation or clearer boundaries.
- JoinReducer is imported by 8 of 10 service clusters — it is the
  gravitational center. Any structural change to JoinReducer has
  wide blast radius.
- The shared kernel (~24 files in services/ root after extraction)
  is still a big drawer. Revisit after the 10 extractions stabilize.

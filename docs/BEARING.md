# BEARING

Updated at cycle boundaries. Not mid-cycle.

## Where are we going?

Closing the Systems-Style audit RED findings. God object decomposition
(WarpRuntime, StrandService) and structural quality across
`domain/services/`.

## What just shipped?

Cycle 0003 (safe-context). PR #75 merged — CRDT foundation (VV, ORSet,
PatchV2 promoted to classes), kernel extraction (3 controllers, 2,115
LOC from mixins), tsc zero.

## What feels wrong?

- `domain/services/` is 83 files in a flat directory. 54% of the
  codebase with no internal structure. Audit is in `asap/`.
- WorldlineSource is still a tagged object, not a subclass hierarchy.
- `defaultCodec.js` lives in `domain/utils/` but imports `cbor-x`
  directly — a hexagonal boundary violation.
- The two legends (CLEAN_CODE, NO_DOGS_NO_MASTERS) overlap
  significantly. May need consolidation or clearer boundaries.

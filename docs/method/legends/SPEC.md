# SPEC

The executable spec must stay honest.

## Invariant

Tests, docs, mocks, and coverage residue reflect the real contract.
Vacuous assertions, misleading mocks, stale docs, and “covered but not
really” games are debt.

## Use this when

- tests are vacuous, over-mocked, or miss the real surface
- docs or declarations drift from repo truth
- coverage residue survives only because the design is opaque
- mocks no longer satisfy the runtime contract they claim to model

## Not this

- The underlying runtime shape problem may still be `MODEL` or `OWN`
- Raw boundary decode problems are `BND`
- host or infrastructure leaks are `HEX`

## Legend code

`SPEC`

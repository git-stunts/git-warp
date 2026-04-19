# BOUNDARY

Decode once, at the edge.

## Invariant

Raw transport shapes, decoded payloads, and schema checks stop at the
boundary. Core receives validated values, not hopeful bags.

## Use this when

- a decoder accepts or emits undecoded reality into core
- validation is missing, partial, or silent
- message parsing or shape probing happens in domain logic
- a boundary silently accepts malformed or ambiguous data

## Not this

- Host or infrastructure leakage into core: `HEX`
- Runtime type lies and cast corridors: `CAST`
- Missing runtime-backed domain classes: `MODEL`

## Legend code

`BND`

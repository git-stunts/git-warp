# MODEL

Runtime truth wins.

## Invariant

Concepts with identity, invariants, or behavior exist as runtime-backed
types with constructor validation. Typedef folklore does not count.

## Use this when

- a primary domain concept is only a typedef or shape corridor
- constructors do not validate their own invariants
- parallel wire and runtime shapes drift without a real model
- a concept should be a class, value object, or validated form

## Not this

- Boundary parsing and schema problems: `BND`
- Type lies used to avoid the real model: `CAST`
- God-object or duplication ownership problems: `OWN`

## Legend code

`MODEL`

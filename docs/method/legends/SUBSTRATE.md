# SUBSTRATE

Storage truth must stay explicit.

## Invariant

Streaming, CAS, checkpoint, index, and storage-version semantics are
explicit, inspectable, and durable. No hidden raw-blob assumptions or
ambiguous substrate fallback corridors.

## Use this when

- checkpoint/index/blob/cas behavior is mixed, implicit, or brittle
- serialization belongs to the wrong layer
- storage/versioning reachability or integrity is unclear
- streaming or CAS paths drift from the declared substrate model

## Not this

- A missing decoder or schema is `BND`
- host leakage is `HEX`
- a god object owning too much is `OWN`

## Legend code

`SUB`

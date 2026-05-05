# CAST

No cast-cosplay.

## Invariant

Code does not lie about runtime reality with double-casts, escape
hatches, fake host identities, or “unknown for now” corridors.

## Use this when

- `as unknown as` or equivalent escape hatches hide the real issue
- one runtime object pretends to be another
- opacity or fallback corridors exist only because the types are lying
- a fake cast stands in for a missing guard, model, or boundary

## Not this

- The missing decoder or validation belongs to `BND`
- The missing domain form belongs to `MODEL`
- The missing port contract belongs to `PORT`

## Legend code

`CAST`

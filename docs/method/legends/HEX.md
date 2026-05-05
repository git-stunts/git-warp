# HEX

Dependencies point inward only.

## Invariant

Core code does not reach out to host APIs, infrastructure adapters, raw
Git subprocesses, ambient clocks, or ambient entropy.

## Use this when

- `src/domain/**` or `src/ports/**` import Node or infrastructure
- Git is accessed outside a port plus `@git-stunts/plumbing`
- CAS or other storage infrastructure is inferred from adapter internals
- time, randomness, env, or process state leak into core

## Not this

- Missing decoders or schema validation: `BND`
- Missing constructors or typedef corridors: `MODEL`
- Fake type lies used to hide the problem: `CAST`

## Legend code

`HEX`

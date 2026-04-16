---
id: PROTO_purge-boundary-leaks
cycle: 0025B
parent_cycle: 0025
blocked_by:
  - PROTO_purge-cast-hacks
blocks:
  - PROTO_purge-fake-models
---

# 0025B — Boundary purge

## Problem

Per the P6.5 contamination map, the repository contains 353 uses of
`Record<string, unknown>` outside adapters, plus an unknown number
of `unknown` references scattered through domain/application paths.
Raw transport shapes are leaking into core code.

The symptom: ad-hoc property poking in business logic, optional-
chain soup, and `typeof x === 'string'` guards that should have
been decoders. Every one of these is an invitation to cast — and
once 0025A is done, the real question is: *why is `unknown` in
core at all?*

## Fix

For every `Record<string, unknown>` and `unknown` in non-adapter
code:

1. Trace to the boundary that produced it. Boundaries live in
   `src/infrastructure/adapters/**`. If the shape entered core
   without decoding, the decoder is missing.
2. Define the decoded domain type (runtime-backed class per SSTS,
   with validated constructor).
3. Write the decoder as a method on the adapter OR as a parser
   function colocated with the domain type.
4. Core code now receives the decoded type; replace every
   downstream property-poke with a method call on the real type.

Also in scope:

- Direct calls to `JSON.parse`, `JSON.stringify`, `fetch`,
  `process.env` in `src/domain/**` must move to adapters.
- `Date.now()` / `new Date()` / `Math.random()` in core are already
  banned by existing lint; this cycle ensures the quarantine list
  graduates to zero.

## Allowed residue

`src/infrastructure/adapters/**` may retain `unknown` and
`Record<string, unknown>` as **boundary-local raw input variables
only**. They must be consumed by a decoder in the same module or in
a directly-imported parser; they cannot escape the adapter layer
as-is.

## Scope

**In:**
- Every file listed in
  `policy/quarantines/0025B-boundary.json`.
- New decoders / parsers colocated with domain types.
- New runtime-backed domain classes where a shape needs a name.

**Out:**
- `*Like` — that's 0025C.
- Import walls — that's 0025D.

## Exit criteria

- `policy/quarantines/0025B-boundary.json` has `files: []`.
- `rg 'Record<string, unknown>' src` returns matches only in
  `src/infrastructure/adapters/**`.
- `rg '\bunknown\b' src/domain src/ports` returns no matches
  (except parser-function return types, which are boundary-local).
- Zero `JSON.parse`, `JSON.stringify`, `fetch`, `process.env` in
  `src/domain/**`.

## Retro expectations

- List every new domain class introduced and the boundary that
  previously leaked its raw shape.
- Note which adapters grew new decoders. This is healthy adapter
  growth — the sludge moves from core to the boundary where it
  belongs.

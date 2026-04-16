---
id: PROTO_purge-fake-models
cycle: 0025C
parent_cycle: 0025
blocked_by:
  - PROTO_purge-boundary-leaks
blocks:
  - PROTO_purge-import-law
---

# 0025C — Fake-model purge

## Problem

Per the P6.5 contamination map, the repository contains 14+ files
with `*Like` placeholder types, including an explicit
`src/domain/services/OpLike.ts`. Cycle 0023 identified the pattern:
`-Like` names describe what a thing vaguely resembles rather than
what it IS. Shape-talk produces shape-trust.

Most `*Like` types survive only because the boundary didn't decode
properly (0025B would have fixed that) or because a genuine domain
concept was never named. The first case is automatic cleanup; the
second demands modeling.

## Fix

For every `*Like` type in `src/**`:

1. Does it describe a transport shape? If so, rename to an
   explicit transport DTO (e.g. `RawFooRequest`, `FooWireFormat`)
   and confine it to the adapter layer.
2. Does it describe a domain concept? If so, name the concept. If
   it has invariants, identity, or behavior, it's a class (SSTS
   Rule P1). Example from cycle 0023: `ORSetLike` was actually just
   "the in-memory OR-Set" — that's `ORSet`, a concrete class.
3. Does it describe a duck-typed narrow slice of a real type (e.g.
   `{ nodeAlive: { contains(key): boolean } }`)? If so, delete the
   alias and use the real type. If the real type is too heavy for
   the use site, the use site is wrong.

## Allowed residue

None. `*Like` is banned everywhere in `src/**`. The semgrep rule
`ts-no-like-types` runs as a hard error after 0025C closes.

## Scope

**In:**
- Every file listed in
  `policy/quarantines/0025C-fake-models.json`.
- Renames and rewrites required to eliminate every `*Like` type.
- New domain classes where real concepts surface during the purge.

**Out:**
- Import walls — that's 0025D.

## Exit criteria

- `policy/quarantines/0025C-fake-models.json` has `files: []`.
- `rg '\b[A-Z][A-Za-z0-9]*Like\b' src/**/*.ts` returns no matches.

## Retro expectations

- For each `*Like` that died, record what it became: a real class,
  an adapter DTO, or (rarely) deleted.
- Any `*Like` that was ACTUALLY a real concept with multiple
  implementations (unlikely after 0025A/B) is documented with
  evidence — cycle 0023 is the cautionary tale against this.

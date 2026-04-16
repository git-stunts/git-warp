---
id: PROTO_purge-cast-hacks
cycle: 0025A
parent_cycle: 0025
blocks:
  - PROTO_purge-boundary-leaks
---

# 0025A — Cast purge

## Problem

Per the P6.5 contamination map, the repository contains 69 uses of
`as unknown as` and an unknown count of `as any` patterns. Every
one of these is a runtime lie — it tells the compiler to stop
asking questions about a type it cannot prove.

Casts are sludge concealment. A `foo as unknown as Something` can
hide a boundary-decode failure, a missing port method, a structural
mismatch, or a real domain modeling gap. Until they are removed, the
downstream sludge cannot even be seen.

## Fix

For every `as unknown as` in `src/**`:

1. Trace upstream to find where the raw value entered the type
   system. If it came from `JSON.parse`, `codec.decode`, `fetch`, a
   DB client, or another untyped boundary — the fix is a decoder
   that returns a concrete domain type.
2. If the cast is "I know more than the compiler" because of a
   runtime check, replace with a proper type guard function and
   delete the cast.
3. If the cast exists because a port returns `unknown`, narrow the
   port's return type.

For every `as any`: same pattern. `as any` is strictly worse and
should disappear from non-adapter code entirely.

## Allowed residue

Adapters may still use `unknown` as the *temporary* raw-input
variable before decoding. Casts from `unknown` to concrete types
must be replaced with decoder return values; a cast is never a
decode.

## Scope

**In:**
- Every file listed in
  `policy/quarantines/0025A-casts.json`.
- New decoders / type guards as needed to eliminate casts.

**Out:**
- `Record<string, unknown>` — that's 0025B.
- `*Like` — that's 0025C.
- Import boundaries — that's 0025D.
- `test/**` — tests retain relaxed rules.

## Exit criteria

- `policy/quarantines/0025A-casts.json` has `files: []`.
- `rg 'as unknown as' src/**/*.ts` returns no matches.
- `rg 'as any' src/**/*.ts` returns no matches outside
  `src/infrastructure/adapters/**` (and even there, justify).
- All tests pass. All gates pass.

## Retro expectations

- Record the pre-cycle cast count and post-cycle cast count.
- Note any patterns encountered (common upstream boundaries, common
  downstream cast shapes). This feeds 0025B's boundary fixing.

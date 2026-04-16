---
id: PROTO_purge-cast-hacks
cycle: 0025A
parent_cycle: 0025
blocks:
  - PROTO_purge-boundary-leaks
---

# 0025A — Cast purge

## Problem

Per the P6.5 contamination map, 33 files in `src/**` use
`as unknown as`. Every one is a runtime lie — it tells the
compiler to stop asking questions about a type it cannot prove.

Casts are sludge concealment. A `foo as unknown as Something` can
hide a boundary-decode failure, a missing port method, a structural
mismatch, or a real domain modeling gap. Until they are removed,
the downstream sludge cannot even be seen.

## Cluster analysis

The 33 files cluster into three groups:

### Group A1 — Controller casts (8 files)

`src/domain/services/controllers/` — likely downstream effects of
port `unknown` returns (see 0025B1) and of transport shapes
leaking inward (see 0025B2). Most of these casts probably
evaporate during 0025B without direct 0025A work, but any cast
that remains after 0025B port-fixing is real cast sludge that
needs explicit removal.

### Group A2 — WarpGraph / WarpRuntime public-entry casts

- `src/domain/WarpGraph.ts`
- `src/domain/WarpRuntime.ts`
- `src/domain/services/ImmutableSnapshot.ts`

These are the top-level public entry points. Casts at the public
API boundary are especially load-bearing and may be **structurally
tied to the `_wiredMethods.d.ts` / WarpRuntime `defineProperty`
circus** (see prior handoffs). Some of these casts may not die
cleanly without the WarpRuntime facade cleanup, which has its own
separate backlog item.

**Annotation for future maintainers:** do not "fix" these casts by
inventing worse abstractions. If the cast cannot be removed
without the WarpRuntime cleanup, the retro should document the
dependency and defer the specific site, NOT camouflage it with a
fresh abstraction.

### Group A3 — Adapters and scattered sites

`src/infrastructure/adapters/GitGraphAdapter.ts`,
`gitErrorClassification.ts` (also in 0025C — double contamination
is fine, just a dirty adapter), plus scattered sites in
strand/, sync/, provenance/, stream/. Most are mechanical: trace
upstream to find the raw boundary, write a decoder, delete the
cast.

## Fix

For every `as unknown as` in `src/**`:

1. Trace upstream to find where the raw value entered the type
   system. If it came from `JSON.parse`, `codec.decode`, `fetch`, a
   DB client, or another untyped boundary — the fix is a decoder
   that returns a concrete domain type.
2. If the cast is "I know more than the compiler" because of a
   runtime check, replace with a proper type guard function and
   delete the cast.
3. If the cast exists because a port returns `unknown` or
   `Record<string, unknown>` (common after reading 0025B), fix
   the **port** and the cast vanishes. 0025B precedes 0025C for
   this reason; 0025A and 0025B are co-scheduled in practice.

For every `as any` in `src/**` (outside adapter boundary-local
variables): same pattern. `as any` is strictly worse and should
disappear from non-adapter code entirely.

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
- Coordination with 0025B port fixes where casts are downstream
  of port `unknown` returns.

**Out:**
- `Record<string, unknown>` in non-port domain code — that's 0025B.
- `*Like` — that's 0025C.
- Import boundaries — that's 0025D.
- `test/**` — tests retain relaxed rules.
- WarpRuntime / `_wiredMethods.d.ts` defineProperty circus cleanup
  — tracked separately.

## Exit criteria

- `policy/quarantines/0025A-casts.json` has `files: []`.
- `rg 'as unknown as' src/**/*.ts` returns no matches.
- `rg 'as any' src/**/*.ts` returns no matches outside
  `src/infrastructure/adapters/**` (and even there, justified).
- All tests pass. All gates pass.

## Retro expectations

- Record the pre-cycle cast count (33) and post-cycle cast count
  (target: 0).
- Note any casts that survived because of the WarpRuntime
  structural debt, linked to the separate cleanup backlog item.
- Name patterns encountered (common upstream boundaries, common
  downstream cast shapes). This feeds 0025B's port and ingress
  fixing.

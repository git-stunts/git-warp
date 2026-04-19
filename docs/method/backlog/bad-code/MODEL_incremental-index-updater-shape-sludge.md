---
id: BAD_IncrementalIndexUpdater-shape-sludge
file: src/domain/services/index/IncrementalIndexUpdater.ts
---

# IncrementalIndexUpdater leans on `Record<string, unknown>` and a duck-typed `WarpStateLike`

## Symptom

`src/domain/services/index/IncrementalIndexUpdater.ts` contains:

1. A duck-typed local alias:
   ```ts
   type WarpStateLike = {
     nodeAlive: { contains(key: string): boolean };
     edgeAlive: ORSet;
   };
   ```
   This is shape-trust posing as a type. The method-set happens to
   be compatible with `WarpState`, but nothing enforces that at
   runtime.

2. At least eight `Record<string, unknown>` sites (lines
   approximately 33, 34, 234, 244, 392, 394, 398, 409) used to carry
   shard-prop data through the updater. Per SSTS, `Record<string,
   unknown>` is banned inside the domain — raw bags of untyped
   fields do not correspond to a domain concept.

3. An `as` assertion decoding shard props:
   ```ts
   this._codec.decode(buf) as Array<[string, Record<string, unknown>]>;
   ```
   The decode should either return a typed runtime value via a
   parser at the boundary, or throw.

## Why it's not in cycle 0024's scope

Cycle 0024 (`PROTO_orset-internal-encapsulation`) fixes #1 — the
`WarpStateLike` duck type goes away as part of retyping consumers to
`WarpState` / `ORSet`. That's the only slice of this file touched by
0024.

Items #2 and #3 require a domain model for "shard props" (or
"indexed property bag"). That is a design decision: what are the
real concepts inside the index builder, and how do they cross the
codec boundary? Punting that to its own cycle so 0024 stays narrow.

## Proposed fix

1. Name the domain concept — probably something like
   `IndexShardProps` or `PropertyBag` — and give it a runtime-backed
   class with validated invariants.
2. Move CBOR decoding to a parser method on that class (or to a
   dedicated adapter-side parser) so raw `Record<string, unknown>`
   never enters the domain.
3. Audit the rest of `src/domain/services/index/` for the same
   pattern — this file is unlikely to be the only offender.

## Related

- Cycle 0024 retro (once it lands) should reference this item.
- Cycle 0023 retro surfaced the broader SSTS vigilance problem that
  let this sludge accumulate.

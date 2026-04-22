---
id: MODEL_op-wire-pojo-class-duality
blocked_by: []
blocks: []
---

# Op wire POJOs and Op class instances flow through the same pipeline

**Effort:** L

## What's wrong

The reducer, strategy dispatchers, and receipt builder all accept ops that
may be **either** real `Op` class instances (from domain-internal
construction via `PatchBuilder`) **or** POJOs decoded from CBOR on the
wire. The code has no way to tell them apart until it reads the `type`
field — and because the fields are optional on the loose `OpLike` union,
every field access requires an `as` cast.

Concrete sites (all flagged in the JoinReducer-split footnotes):

- `OpStrategies.ts` — every concrete strategy method has multiple
  `op.node as string`, `op.dot as Dot`, `op.from as string` casts
- `OpValidator.ts` — `assertDot` reads `op['dot']` as a generic object
  and narrows field-by-field
- `ReceiptBuilder.ts` — `edgeRemoveOutcome` reconstructs the edge key from
  `op.from as string` etc.
- `JoinReducer.ts` — the dispatcher casts `canonOp as { readonly type:
  string; readonly [key: string]: unknown }` before calling
  `strategy.validate`
- `MigrationService.ts` — legacy v4→v5 boundary also sees POJOs

The root cause is that **CBOR decode lands POJOs** (plain objects with
primitive fields) and nothing between the decoder and the reducer
hydrates them into `new NodeAdd(...)`, `new EdgeAdd(...)`, etc. The
reducer tolerates this by using discriminated-union narrowing via the
literal `type` field, but the narrowing doesn't carry through to field
access because the fields aren't declared on the discriminated type.

## Why it's load-bearing

Every `as` cast is a lie the compiler can't verify. If the wire format
changes and drops a field, the strategy will blow up at runtime instead
of at compile time. The type system is not protecting the reducer.

It also blocks **Footnote 7** of the JoinReducer-split scorecard —
we can't fully type `OpStrategy<O extends OpLike>` generic strategies
because the op values at the dispatch site are POJOs without field
narrowing.

## Suggested fix

The architectural fix is an **Op hydrator at the CBOR decode boundary**
(filed separately as cool-idea `DX_op-hydration-at-cbor-boundary.md`).
The decoder would produce real class instances, not POJOs. Downstream
code would drop every `as` cast.

Alternatives if the full hydrator is too invasive:
1. Widen `RawOpV2` / `CanonicalOpV2` to full discriminated unions with
   field declarations per variant, so `type === 'NodeAdd'` narrows to
   `{ type: 'NodeAdd', node: string, dot: Dot }` without casts. The
   strategies still receive POJOs but fields are typed after narrowing.
2. A thin `hydrateOp(pojo): Op` function called at the CBOR decode
   boundary and at the migration boundary, producing real class
   instances without touching the reducer dispatch.

## Severity

HIGH. This is the root cause of most remaining `as` casts in the reducer
pipeline post-JoinReducer-split. Fixing it unblocks a ratchet-clean
strategy-generics refactor.

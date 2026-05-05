---
id: DX_discriminated-op-union-fields
blocked_by: []
blocks: []
feature: sync-trust-security
---

# Full discriminated unions for RawOpV2 / CanonicalOpV2 with typed fields

**Effort:** M

## Idea

`Op.type` is already a literal discriminator (landed this session via
`Op<T extends string>`). But `RawOpV2` and `CanonicalOpV2` are still
unions of **class types**, so field access requires the caller to have
a real instance — not a POJO decoded from CBOR.

What if the wire-format unions declared their fields as plain
discriminated union members?

```ts
// Current (class-based)
export type RawOpV2 =
  | NodeAdd | NodeRemove | EdgeAdd | EdgeRemove | PropSet | BlobValue;

// Proposed (field-based, for the wire-facing type)
export type RawOpV2Wire =
  | { readonly type: 'NodeAdd'; readonly node: string; readonly dot: Dot }
  | { readonly type: 'NodeRemove'; readonly node: string; readonly observedDots: readonly string[] }
  | { readonly type: 'EdgeAdd'; readonly from: string; readonly to: string; readonly label: string; readonly dot: Dot }
  | { readonly type: 'EdgeRemove'; readonly from: string; readonly to: string; readonly label: string; readonly observedDots: readonly string[] }
  | { readonly type: 'PropSet'; readonly node: string; readonly key: string; readonly value: PropValue }
  | { readonly type: 'BlobValue'; readonly node: string; readonly oid: string };

// Class union stays for the internal/already-hydrated path
export type RawOpV2 = NodeAdd | NodeRemove | EdgeAdd | EdgeRemove | PropSet | BlobValue;
```

Then the reducer dispatch can narrow via `if (op.type === 'NodeAdd')`
and get typed field access for both the wire POJO and the class
instance (since both satisfy the field-based union).

## Why cool

- **Fixes the `as` cast cluster in OpStrategies** without needing the
  full `hydrateOp` architecture (`DX_op-hydration-at-cbor-boundary.md`).
- **Additive change.** The class union stays; the wire union is new.
  Consumers pick whichever they need.
- **Documents the wire format explicitly** — right now the wire shape
  is implicit in the CBOR codec. The type is the documentation.
- **Enables switch-based dispatch.** Reducer can collapse the strategy
  Map back into a single switch (or keep both approaches side-by-side).

## Relationship to other items

- Complements `DX_op-hydration-at-cbor-boundary.md`: that idea hydrates
  POJOs to classes. This one types the POJOs themselves so hydration
  becomes optional rather than required.
- Blocks the same way on `CC_warpstate-prop-unknown-value.md`: the
  wire union's `value: PropValue` only makes sense if `PropValue` is
  defined.

## Cost

Mechanical type definitions. No runtime changes. The main work is
propagating the new type through OpStrategies so concrete strategies
take the narrowed wire variant as their input.

## Severity

Lower impact than full hydration but MUCH lower cost. A good
intermediate step if the hydration architecture is too big to swallow
in one cycle.

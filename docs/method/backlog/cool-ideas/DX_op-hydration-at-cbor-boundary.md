# Op hydration at the CBOR decode boundary

**Effort:** M-L

## Idea

Right now, CBOR-decoded ops flow through the entire reducer as POJOs.
The reducer tolerates this by using the discriminated `type` tag to
dispatch, but every field access on those POJOs requires an `as`
assertion because the fields aren't declared on the discriminated
union types.

What if the CBOR decode path produced real `Op` class instances?

```ts
// At the CBOR decode boundary
function decodePatchOps(bytes: Uint8Array): CanonicalOpV2[] {
  const decoded: unknown[] = cborDecode(bytes);  // unknown[] here — boundary
  return decoded.map(hydrateOp);                 // parser: unknown → class
}

function hydrateOp(raw: unknown): CanonicalOpV2 {
  if (raw === null || typeof raw !== 'object' || !('type' in raw)) {
    throw new PatchError('Op must be an object with a type field');
  }
  const type = (raw as { type: unknown }).type;
  switch (type) {
    case 'NodeAdd':
      return NodeAdd.fromWire(raw);
    case 'EdgeAdd':
      return EdgeAdd.fromWire(raw);
    // ... one case per op type, each returning a real instance
    default:
      throw new PatchError(`Unknown op type: ${String(type)}`);
  }
}
```

Each `Op` subclass gets a static `fromWire(raw: unknown)` parser
method that validates the shape and returns a real class instance.
Validation lives on the class, not scattered across strategy dispatchers.

## Why cool

- **Kills every `as` cast in the reducer pipeline.** Strategies receive
  real class instances; field access is fully typed.
- **Collapses OpValidator field-assertion methods.** The
  `assertString` / `assertIterable` / `assertDot` family becomes
  constructor-level validation on the Op subclasses — SSTS P2
  ("boundary validation at construction").
- **Enables full discriminated narrowing via `instanceof`** instead of
  tag checks. SSTS P7.
- **Removes the reducer's silent-unknown-op no-op** (filed separately)
  as a side effect — `hydrateOp` throws on unknown types at the decode
  boundary, so the reducer never sees them.
- **Fixes the MigrationService boundary** — v4 POJOs can reuse the
  same `fromWire` entry point (or a `fromV4` variant).
- **Moves closer to SSTS compliance** — parser functions at the edge,
  class instances inside.

## Cost / risk

- Touches the CBOR decode path, PatchBuilder, the reducer dispatch, and
  every Op subclass.
- Performance concern: constructing class instances per op is slightly
  slower than handling POJOs. Benchmark needed.
- Forward-compat story changes: unknown op types now throw at decode
  instead of silently no-op'ing at dispatch. This might be the desired
  behavior (see CC_reducer-silent-unknown-op-type.md) but it's a
  behavior change.

## Blockers

- Decision on prop value type (CC_warpstate-prop-unknown-value.md) —
  `hydrateOp` for prop ops needs to know the value type.

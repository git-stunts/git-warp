# Optics

An **optic** is the bounded question you ask of causal history — "which node,
property, neighbor set, or traversal do I want?" It names the read you mean,
instead of materializing the whole graph to go looking.

## Why optics

- **Coherence.** An optic answers from a fixed position, so concurrent writes
  cannot shift the result mid-read.
- **Boundedness.** The runtime only touches the causal support the question
  needs (see [Bounded Reads](bounded-reads.md)).
- **Honesty.** If a bounded basis cannot be established, the read fails closed
  rather than silently folding the whole graph.

## The read path (shipped)

```typescript
await events.prepareOpticBasis();
const coordinate = await events.coordinate();

const role = await coordinate
  .optic()
  .node('user:alice')
  .prop('role')
  .read();
```

- `prepareOpticBasis()` **verifies** an existing checkpoint-tail basis; it does
  not create one by materializing the full graph. With no bounded basis it
  throws `E_OPTIC_NO_BOUNDED_BASIS`
  (`src/domain/WarpWorldline.ts`, `src/domain/services/optic/CheckpointTailBasisVerifier.ts`).
- `coordinate()` captures a stable, observer-relative position (a causal basis
  plus a ceiling). Later writes advance the live worldline; reads through the
  captured coordinate keep answering from the captured position.
- `coordinate().optic()` chains `.node()`, `.prop()`, traversals, and `.read()`
  (`src/domain/WarpWorldlineCoordinate.ts`).

Coordinate optics report ordinary absence as data, not exceptions: a missing
node reads `{ nodeId, alive: false, readIdentity }`; a missing property reads
`{ nodeId, key, exists: false, value: undefined, readIdentity }`. Evidence
failures are different — `E_OPTIC_TAIL_BUDGET_EXCEEDED` and
`E_OPTIC_READ_IDENTITY` are integrity failures, not missing values.

`events.optic()` is a convenience for one-off live optic reads when a basis
already exists. For two reads that must describe the same causal position, use a
single captured coordinate.

## Noun status: reified runtime type

The optic **read path above is callable today**, and it lowers into a
first-class, reified runtime **type/noun** before execution. The exported
`Optic` object carries the read target, coordinate posture, basis posture,
support rule, aperture posture, and translated Continuum evidence posture.

That makes `Optic` a git-warp runtime noun, not a Continuum-native witness. The
current noun is marked `transition` in [`docs/GLOSSARY.md`](../GLOSSARY.md)
because remote optic transport, native Continuum witnesshood, and observer-owned
aperture transport remain future work.

## For the Nerds™ — the categorical optic

In category theory, an optic from a whole `(S, T)` to a part `(A, B)` is an
element of a coend over a hidden *residual* `M`:

```text
Optic((S,T),(A,B)) = ∫^M  𝒞(S, M ⊗ A) × 𝒞(M ⊗ B, T)
```

git-warp uses the read-only half: `S` is a coordinate, `A` is the bounded
question, and the residual `M` is the rest of history you deliberately do not
materialize. The bounded support rule is `M` made small and explicit, and
`prepareOpticBasis()` is the witness that a lawful factorization `S → M ⊗ A`
exists. Chaining `.node().prop()` is optic composition: it tensors residuals
(`M₁ ⊗ M₂`), so a chained read stays bounded by construction.

## See also

- [Bounded Reads](bounded-reads.md) · [Observers](observers.md)
- Example: [`examples/optics.ts`](../../examples/optics.ts)

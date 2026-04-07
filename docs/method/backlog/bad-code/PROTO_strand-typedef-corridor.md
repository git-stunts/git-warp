# Strand model still lives as a typedef corridor across collaborator files

**Severity:** medium
**Category:** bad-code

## Problem

Cycle 0011 pulled `StrandService` apart into explicit collaborators and
later centralized the shared typedefs in `strandTypes.js`:

- `StrandDescriptorStore`
- `StrandMaterializer`
- `StrandPatchService`
- `StrandIntentService`

That fixed the ownership problem and removed the repeated declaration
sludge, but the core strand concepts are still typedef-backed rather
than runtime-backed:

- `StrandDescriptor`
- `StrandIntentQueue`
- `StrandQueuedIntent`
- `StrandRejectedCounterfactual`
- `StrandTickRecord`

This is still Systems-Style sludge. The code now has better boundaries,
but the runtime model remains mostly phantom.

## Why it stinks

- Invariants are still enforced indirectly by normalization helpers
  instead of constructors or a single boundary-owned representation.
- The shapes are now centralized, but they are still phantom contracts
  enforced by parsers and helper logic instead of constructors.
- The collaborators are more honest now, but they still speak through a
  typedef dialect instead of a single runtime-backed model.

## What to do

Follow the post-split cleanup with one of these approaches:

1. Introduce a dedicated shared strand model module with one canonical
   definition site for descriptor/queue/tick concepts.
2. Promote the highest-value strand concepts to runtime-backed forms,
   starting with `StrandDescriptor` and `StrandTickRecord`.
3. Keep pure normalization at the descriptor boundary and treat
   `strandTypes.js` as the temporary canonical shape boundary until the
   runtime model exists.

## Scope note

This was intentionally left out of the initial split so cycle 0011 could
finish the ownership decomposition first without expanding into a full
object-model migration.

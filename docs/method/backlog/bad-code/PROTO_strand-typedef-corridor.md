# Strand model still lives as a typedef corridor across collaborator files

**Severity:** medium  
**Category:** bad-code

## Problem

Cycle 0011 pulled `StrandService` apart into explicit collaborators:

- `StrandDescriptorStore`
- `StrandMaterializer`
- `StrandPatchService`
- `StrandIntentService`

That fixed the ownership problem, but the core strand concepts are still
mostly shared as repeated JSDoc typedef shapes across those files:

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
- Multiple files repeat the same shape definitions, so drift remains
  possible even after the service split.
- The collaborators are more honest now, but they still speak through a
  typedef dialect instead of a single runtime-backed model.

## What to do

Follow the post-split cleanup with one of these approaches:

1. Introduce a dedicated shared strand model module with one canonical
   definition site for descriptor/queue/tick concepts.
2. Promote the highest-value strand concepts to runtime-backed forms,
   starting with `StrandDescriptor` and `StrandTickRecord`.
3. Keep pure normalization at the descriptor boundary and stop repeating
   shape declarations inside each collaborator.

## Scope note

This was intentionally left out of the initial split so cycle 0011 could
finish the ownership decomposition first without expanding into a full
object-model migration.

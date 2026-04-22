---
id: OWN_comparison-controller-shadow-selectors
blocked_by: []
blocks: []
---

# ComparisonController contains 4 shadow selector classes

**Effort:** M

`ComparisonController.js` (1212 LOC) defines 4 non-exported selector
classes (`LiveSelector`, `CoordinateSelector`, `StrandSelector`,
`StrandBaseSelector`) that shadow the domain types in
`src/domain/types/`. They have different semantics (comparison-specific)
but identical names, which is confusing and untestable in isolation.

## What's wrong

- **1TPF violation**: 5 classes in one file.
- **Name collision**: Shadowed names make grep and navigation unreliable.
- **Untestable**: Internal classes can't be unit-tested independently.

## Suggested fix

Extract to `src/domain/services/controllers/comparison/` with distinct
names (e.g., `ComparisonLiveSelector`, `ComparisonCoordinateSelector`).
One file per class. Re-evaluate whether they should extend the domain
`WorldlineSelector` hierarchy or remain separate.

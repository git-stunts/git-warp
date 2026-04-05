# Mutation testing to find tests that bless bugs

The removeNode bug proved that test count and pass rate are not
measures of correctness. 5554 tests passed. The bug was in 6 of
them — they asserted the bug was correct.

Mutation testing would have caught it.

A mutation tester (Stryker, for JS) makes small changes to the
source — flipping conditions, replacing return values, removing
lines — and checks if any test fails. If a mutation survives (no
test catches it), that's a gap in test quality, not test quantity.

For the removeNode bug, a mutation tester would have:
1. Changed `state ? [...orsetGetDots(...)] : []` to `state ? [] : []`
2. All 6 unit tests still pass (they already expected `[]`)
3. Stryker reports: "Mutation survived — empty array fallback is untested"

That's the signal. Not "you need more tests" but "your existing
tests don't detect this change."

The practical approach: run Stryker on the highest-risk files
(JoinReducer, PatchBuilderV2, CheckpointService, SyncProtocol)
rather than the full 61K LOC codebase. A focused mutation run on
PatchBuilderV2 alone would have found the removeNode bug.

Start with: `npx stryker run --mutate 'src/domain/services/PatchBuilderV2.js'`

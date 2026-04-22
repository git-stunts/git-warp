---
id: SPEC_untested-controllers
blocked_by: []
blocks: []
feature: api-capabilities
---

# CC_untested-controllers

**Title:** 8 controllers have ZERO dedicated test files
**Effort:** XL

## Issue

QueryController (946 LOC), MaterializeController (1010 LOC),
ComparisonController (1212 LOC), CheckpointController (431 LOC),
PatchController (515 LOC), ForkController (293 LOC),
ProvenanceController (243 LOC), SubscriptionController (247 LOC) — all
have zero dedicated test files and zero direct test cases. They are
tested only indirectly through WarpGraph integration tests. These are
high-coupling, high-complexity files that control critical domain flows.

## Fix

Create dedicated unit test files for each controller, starting with the
highest-risk ones (MaterializeController, QueryController,
ComparisonController). Mock the host runtime, test each method in
isolation.

# DRY up WarpRuntime delegation boilerplate

**Effort:** XS

## Problem

`WarpRuntime.js` repeats the same `Object.defineProperty` delegation
loop 10 times (StrandController, QueryController, ForkController,
ProvenanceController, SubscriptionController, ComparisonController,
SyncController, PatchController, CheckpointController,
MaterializeController). Each loop is identical except for the controller
field name and method list.

## Fix

Extract a helper: `delegateToController(Class, controllerField, methods)`.
One call per controller, zero boilerplate. This was the deleted
`wireWarpMethods` pattern but for controller delegation.

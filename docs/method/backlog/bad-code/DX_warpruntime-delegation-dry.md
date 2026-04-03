# DRY up WarpRuntime delegation boilerplate

**Effort:** XS

## Problem

`WarpRuntime.js` lines 646-813 repeat the same `Object.defineProperty`
delegation loop 7 times (StrandController, QueryController,
ForkController, ProvenanceController, SubscriptionController,
ComparisonController, SyncController). Each loop is identical except
for the controller field name and method list.

## Fix

Extract a helper: `delegateToController(Class, controllerField, methods)`.
One call per controller, zero boilerplate.

---
id: PORT_effect-sink-union-return
blocked_by: []
blocks: []
feature: runtime-boundaries
release_home: v17.0.0
---

# EffectSinkPort.deliver() has union return type

**Effort:** S

## Problem

`deliver()` returns `Promise<DeliveryObservation | DeliveryObservation[]>`.
Every caller must perform an `Array.isArray()` check. The unpredictable
return shape leaks implementation details of individual sinks into all
consumer code.

## Suggested Fix

Always return `DeliveryObservation[]`. Single-observation sinks wrap
their result in a one-element array. Callers get a uniform interface
with no branching.

---
id: OWN_effect-pipeline-global-counter
blocked_by: []
blocks: []
feature: testing-quality
release_home: v17.0.0
---

# EffectPipeline uses module-level mutable counter

**Effort:** XS

## Problem

Module-level `let _counter = 0` is shared across all `EffectPipeline`
instances. ID generation is non-deterministic across tests and
concurrent pipelines. Test isolation requires careful ordering or resets.

## Suggested Fix

Move the counter into the instance, or accept an ID generator function
via the constructor for deterministic testing.

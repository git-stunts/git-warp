# CheckpointSerializerV5 returns empty state for null/undefined input

**Effort:** XS

## Issue

Deserializing `null` or `undefined` returns an empty state with zero
nodes/edges instead of throwing. Callers can't distinguish "checkpoint
was genuinely empty" from "checkpoint was missing/corrupt." Tests
bless this.

## Fix

Throw on `null`/`undefined` input. A missing checkpoint is an error,
not an empty state.

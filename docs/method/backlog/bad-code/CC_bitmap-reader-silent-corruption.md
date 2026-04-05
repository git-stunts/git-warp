# BitmapIndexReader returns empty array for corrupted shards (silent data loss)

**Effort:** S

## Issue

Non-strict mode returns `[]` for invalid JSON or wrong data types.
`getParents('X')` returning `[]` due to corruption is
indistinguishable from `getParents('X')` returning `[]` because X
has no parents. Tests bless this silent data loss without testing
that callers are warned.

## Fix

Return a result type that distinguishes "no neighbors" from "shard
corrupted." Or at minimum log a warning when returning empty due to
corruption.

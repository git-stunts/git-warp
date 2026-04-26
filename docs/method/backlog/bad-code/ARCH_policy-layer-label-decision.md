---
id: ARCH_policy-layer-label-decision
blocked_by: []
blocks: []
feature: runtime-boundaries
release_home: v17.0.0
---

# Decide whether policy is an architecture layer

**Effort:** S

## What's Wrong

The sludge map currently uses `layer: "policy"` for snapshot/default
policy nouns. That is useful conceptually, but the formal architecture
layers are normally `domain`, `application`, `ports`, and `adapters`.

`policy` must not become a fifth ghost layer where rules avoid the
architecture law.

## Why This Matters

Follow-up implementation cycles need to know where
`MaterializationSnapshotPolicy`, `SeekSnapshotPolicy`, and
`SnapshotRetentionPolicy` belong. If the layer model is vague, policy
nouns can become configuration sludge.

## Suggested Fix

Decide whether `policy` is an allowed layer or only a feature/category.
Then update the sludge map, tests, and guide to match.

## Acceptance

- Decide whether policy is an allowed layer or only a feature/category.
- Update sludge-map schema/tests accordingly.
- Update existing policy noun entries if needed.
- Document where snapshot/default policies live architecturally.


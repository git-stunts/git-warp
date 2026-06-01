---
id: PROTO_safe-path-map-materialization
blocked_by: []
blocks: []
feature: trie-state-storage
---

# Safe path-map materialization pattern

**Effort:** S

## Design

[0151 safe path-map materialization](../../../design/0151-safe-path-map-materialization/safe-path-map-materialization.md)

## Idea

Write down a small, reusable pattern for turning untrusted path-keyed
collections into public records without writing untrusted keys through
a plain object accumulator.

The default implementation shape should be boring:

- accumulate in `Map<string, string>` or another typed map;
- validate each key before public materialization;
- materialize only at the boundary where callers already expect a
  record-shaped API;
- cover prototype-like keys in tests.

This may become a helper only if repeated call sites justify it. Until
then, the design can serve as the rule.

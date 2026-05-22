---
id: BND_path-keyed-object-accumulators
blocked_by: []
blocks: []
feature: trie-state-storage
release_home: v18.0.0
---

# Path-keyed object accumulators at Git boundaries

**Effort:** M

## Design

[0150 path-keyed boundary accumulator audit](../../../design/0150-path-keyed-boundary-accumulator-audit/path-keyed-boundary-accumulator-audit.md)

## What's Wrong

The v17.0.1 recursive tree read review found a real boundary smell:
Git path names were being used as keys on a plain object accumulator.
The specific `readTreeOids()` parser is fixed, but the pattern can
reappear anywhere Git paths, transport field names, or generated
artifact identifiers become object keys before validation.

That is boundary debt. Path strings from Git or transport inputs are
data, not trusted object-member names.

## Suggested Fix

Audit adapters and transport parsers for path-keyed plain object
accumulators. Replace risky accumulators with `Map` or an explicitly
validated materialization step, then add regression coverage for
prototype-like path names such as `__proto__` and `constructor`.

---
id: OWN_duplicate-payload-too-large-error
blocked_by: []
blocks: []
feature: runtime-boundaries
release_home: v17.0.0
---

# PayloadTooLargeError defined in two files independently

**Effort:** XS

## Problem

`NodeHttpAdapter.js` and `httpAdapterUtils.js` both define identical
`PayloadTooLargeError` classes with no shared base. Pure DRY violation --
two independent class definitions for the same concept.

## Suggested Fix

Define `PayloadTooLargeError` once in `httpAdapterUtils.js`. Import it
in `NodeHttpAdapter.js`.

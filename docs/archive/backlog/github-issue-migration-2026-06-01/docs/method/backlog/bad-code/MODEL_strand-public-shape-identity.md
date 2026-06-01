---
id: MODEL_strand-public-shape-identity
blocked_by: []
blocks: []
feature: merge-strands-worldlines
release_home: v21.0.0
---

# strandPublicShape.js is a complex identity transform

**Effort:** S

## Problem

`TO_PUBLIC_KEY`, `TO_INTERNAL_KEY`, `TO_PUBLIC_KIND`, and
`TO_INTERNAL_KIND` mapping tables all map every key to itself
(`'strand' -> 'strand'`, `'strandId' -> 'strandId'`, etc.). The
transform function does nothing. This is scaffolding for a rename that
never happened.

## Suggested Fix

Delete the file and use values directly. If a rename is still planned,
implement the mapping when the rename actually happens.

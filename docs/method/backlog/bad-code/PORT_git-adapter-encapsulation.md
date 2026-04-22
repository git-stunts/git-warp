---
id: PORT_git-adapter-encapsulation
blocked_by: []
blocks: []
---

# GitGraphAdapter exposes this.plumbing as public

**Effort:** XS

## Problem

`plumbing` is stored as `this.plumbing` (public) rather than
`this._plumbing` (private by convention). External code can bypass
validation and retry logic. Additionally, 5 thin wrapper methods exist
for "test mockability" that `InMemoryGraphAdapter` doesn't use.

## Suggested Fix

Rename to `_plumbing`. Remove the unnecessary wrapper methods -- tests
should mock at the port boundary, not at internal method boundaries.

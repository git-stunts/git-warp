---
id: PORT_cbor-codec-triple-export
blocked_by: []
blocks: []
feature: runtime-boundaries
---

# CborCodec.js exports bare functions, class, and singleton

**Effort:** S

## Problem

Three ways to access CBOR functionality: named exports (`encode`/`decode`
functions), the `CborCodec` class extending `CodecPort`, and a default
singleton export (the `defaultCodec`). Consumers pick whichever they find
first, leading to inconsistent usage patterns.

## Suggested Fix

After the `defaultCodec` migration completes, keep only the class
export. Remove bare function exports and the singleton default.

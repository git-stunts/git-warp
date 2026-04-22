---
id: DX_typed-custom-zod-helper
feature: runtime-boundaries
blocked_by: []
blocks: []
---

# `typedCustom()` Zod Helper

**Effort:** S

## Problem

`z.custom()` without a generic yields `unknown` in JS; a JSDoc-friendly wrapper (or `@typedef`-based pattern) would eliminate verbose `/** @type {z.ZodType<T>} */ (z.custom(...))` casts across HttpSyncServer and future Zod schemas.

## Notes

- Part of P3 Type Safety tier

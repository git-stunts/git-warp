---
id: DX_jsr-publish-deno-panic
feature: tooling-release
blocked_by: []
blocks: []
---

# Fix JSR Publish Dry-Run Deno Panic

**Effort:** M

## Problem

Deno 2.6.7 `deno_ast` panics on overlapping text changes from duplicate `roaring` import rewrites. Either pin Deno version, vendor the import, or file upstream issue and add workaround.

## Notes

- Promote if JSR publish becomes imminent

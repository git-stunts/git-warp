---
blocked_by: []
blocks: []
id: DX_index-dts-hand-maintained
---

# index.d.ts is hand-maintained — should be generated

`index.d.ts` is 2400+ lines of hand-written type declarations. It
can drift from the actual exports in `index.js`. When the publish
pipeline ships TS output, this file should be auto-generated from
the source types. Until then, it's a correctness liability —
any new export or renamed type must be manually synchronized.

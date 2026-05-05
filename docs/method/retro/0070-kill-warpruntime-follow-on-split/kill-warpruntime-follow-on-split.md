# 0070 Kill WarpRuntime Follow-On Split

- Outcome: `hill met`
- Cycle doc: [docs/design/0070-kill-warpruntime-follow-on-split.md](../../../design/0070-kill-warpruntime-follow-on-split.md)

## What changed

- rewrote `API_kill-warpruntime` around the actual remaining residue
- added:
  - API_openwarpgraph-composition-root.md
  - PORT_delete-runtime-controller-host-types.md
  - PORT_delete-internal-runtime-shim.md
- updated the `v17` release ledger and workload map to the same three-cut order
- removed stale `_wiredMethods.d.ts` launch-prep references from
  `TS_publish-pipeline.md`

## Why it mattered

This keeps the runtime kill honest after `0069`. The remaining work is no
longer “delete WarpRuntime somehow.” It is three specific cuts with a real
order.

## Witness

- `npm exec vitest run test/unit/scripts/kill-warpruntime-split.test.ts test/unit/scripts/backlog-feature-scope.test.ts`
- `git diff --check`

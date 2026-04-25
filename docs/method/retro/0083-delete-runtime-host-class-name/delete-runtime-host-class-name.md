# 0083 Delete Runtime Host Class Name

- Outcome: `hill met`
- Cycle doc: [docs/design/0083-delete-runtime-host-class-name.md](/Users/james/git/git-stunts/git-warp/docs/design/0083-delete-runtime-host-class-name.md)

## What changed

- moved `src/domain/WarpRuntime.ts` to `src/domain/RuntimeHost.ts`
- renamed the internal host class to `RuntimeHost`
- replaced `openWarpRuntime()` with `openRuntimeHost()`
- deleted `getWarpRuntimePrototype()`
- moved CLI open paths to `openRuntimeHostProduct()`
- removed the completed `API_delete-warpruntime-class` backlog card
- unblocked the `API_kill-warpruntime` umbrella closeout

## Why it mattered

The runtime deletion line no longer has a public/internal class noun named
`WarpRuntime` in active source. The remaining work is bookkeeping: close the
umbrella and let downstream publish-pipeline work depend on a completed
runtime-kill chain.

## Witness

- `npx vitest run test/unit/scripts/openwarpgraph-composition-root.test.ts test/unit/scripts/runtime-host-product-seam.test.ts test/unit/scripts/runtime-wiring-surface-closeout.test.ts test/unit/scripts/public-api-cost-signaling.test.ts test/unit/scripts/public-api-strand-noun.test.ts test/unit/scripts/delete-warpruntime-class-split.test.ts test/unit/scripts/kill-warpruntime-split.test.ts`
- `npm run typecheck`
- `git diff --check`

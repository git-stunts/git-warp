# 0074 Kill WarpRuntime Resplit After Shim Closeout

- Outcome: `hill met`
- Cycle doc: [docs/design/0074-kill-warpruntime-resplit-after-shim.md](/Users/james/git/git-stunts/git-warp/docs/design/0074-kill-warpruntime-resplit-after-shim.md)

## What changed

- rewrote [API_kill-warpruntime.md](/Users/james/git/git-stunts/git-warp/docs/method/backlog/v17.0.0/API_kill-warpruntime.md)
  as an umbrella over the real remaining delete chain
- added the three explicit successor notes:
  - [API_delete-openwarpruntime-bridge.md](/Users/james/git/git-stunts/git-warp/docs/method/backlog/v17.0.0/API_delete-openwarpruntime-bridge.md)
  - `PORT_delete-warpcore-runtime-bridge` (later closed in cycle `0076`)
  - [API_delete-warpruntime-class.md](/Users/james/git/git-stunts/git-warp/docs/method/backlog/v17.0.0/API_delete-warpruntime-class.md)
- updated the `v17` release ledger and workload map to the same four-step
  order:
  - `API_delete-openwarpruntime-bridge`
  - `PORT_delete-warpcore-runtime-bridge`
  - `API_delete-warpruntime-class`
  - `API_kill-warpruntime`

## Why it mattered

This keeps the runtime delete honest after the shim closeout. The remaining
work is no longer “kill WarpRuntime somehow.” It is three concrete precursor
cuts followed by the final class deletion umbrella.

## Witness

- `npm exec vitest run test/unit/scripts/kill-warpruntime-split.test.ts test/unit/scripts/backlog-feature-scope.test.ts`
- `git diff --check`

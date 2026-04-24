# 0066 Kill WarpRuntime Split

- Outcome: `hill met`
- Cycle doc: [docs/design/0066-kill-warpruntime-split.md](/Users/james/git/git-stunts/git-warp/docs/design/0066-kill-warpruntime-split.md)

## What changed

- `API_kill-warpruntime` now names three explicit successor cuts
- added:
  - `API_warpgraph-runtime-bridge`
  - `PORT_runtime-helper-wrapper-seams`
  - `PROTO_delete-runtime-wiring-surface`
- the `v17` release ledger now points at that split directly

## Why it mattered

This kills the last fake “one-shot runtime exorcism” story. The remaining work
is now executable in bounded slices instead of hiding behind a single giant
umbrella note.

## Witness

- `npm exec vitest run test/unit/scripts/kill-warpruntime-split.test.ts`
- `git diff --check`

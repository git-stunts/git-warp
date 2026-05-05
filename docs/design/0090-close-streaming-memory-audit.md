---
title: "Close streaming memory audit"
cycle: "0090-close-streaming-memory-audit"
---

# Close Streaming Memory Audit

## Sponsor human

James Ross

## Sponsor agent

Codex

## Why this exists

`CORE_streaming-memory-audit` mixed one immediate v17 crash fix with a broader
out-of-core architecture concern. The immediate fix already shipped in
`f8a49c71`: `GitGraphAdapter.readBlob()` now passes
`maxBytes: Number.POSITIVE_INFINITY`, and the plumbing stream boundary type
names the `maxBytes` option.

The broader "do not assume the whole graph fits in memory" work is not lost.
It remains live under `PERF_out-of-core-materialization` and the dependent
up-next stream-read chain.

## Hill

The stale v17 `CORE_streaming-memory-audit` card is removed from the live
release queue, while the release ledger and ratchets preserve both facts:
the immediate blob-read cap fix is shipped, and general out-of-core reads are
still tracked separately.

## Playback questions

### Agent

- Is `CORE_streaming-memory-audit.md` deleted from the live v17 lane?
- Does `GitGraphAdapter.readBlob()` still pass an explicit unbounded
  `maxBytes` value to plumbing stream collection?
- Does the closeout point future whole-graph memory work at
  `PERF_out-of-core-materialization` instead of pretending it is done?
- Are workload and backlog counts updated after removing the stale card?

### Human

- If I inspect v17, does the crash fix read as shipped without erasing the
  broader streaming/out-of-core horizon?

## Test plan

### Witness

- `npx vitest run test/unit/scripts/streaming-memory-audit-closeout.test.ts test/unit/scripts/remaining-big-files-closeout-shape.test.ts`
- `npm run typecheck`
- `git diff --check`

## Playback

### Verdict

`hill met`

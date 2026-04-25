---
title: "Close WarpGraph factory"
cycle: "0089-close-warpgraph-factory"
---

# Close WarpGraph Factory

## Sponsor human

James Ross

## Sponsor agent

Codex

## Why this exists

`API_warpgraph-factory` is already shipped: `openWarpGraph()` is exported,
documented as the v17 admission architecture entry point, and implemented as a
frozen capability bag over the runtime bridge seam. The live backlog card is
now stale bookkeeping.

## Hill

The stale `API_warpgraph-factory` card is removed from the live v17 queue, and
the release ledger no longer describes completed composition-root residue as
remaining work.

## Playback questions

### Agent

- Is `API_warpgraph-factory.md` deleted?
- Does the public package still export `openWarpGraph()`?
- Do README/release docs still present `openWarpGraph()` as the v17 API?
- Is the stale `openWarpGraph()` / `WarpRuntime` residue line gone?

### Human

- If I inspect v17, does `openWarpGraph()` read as shipped public API rather
  than a still-open factory task?

## Test plan

### Witness

- `npx vitest run test/unit/scripts/warpgraph-factory-closeout.test.ts test/unit/scripts/capability-interfaces-closeout.test.ts test/unit/scripts/capability-consumer-migration-closeout.test.ts`
- `npm run typecheck`
- `git diff --check`

## Playback

### Verdict

`hill met`

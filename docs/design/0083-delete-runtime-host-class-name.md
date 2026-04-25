---
title: "Delete WarpRuntime class name"
cycle: "0083-delete-runtime-host-class-name"
---

# Delete WarpRuntime Class Name

## Sponsor human

James Ross

## Sponsor agent

Codex

## Why this exists

The runtime-kill chain is down to one executable source cut: the class and
export residue still named `WarpRuntime`. The public API already routes through
`openWarpGraph()` / `WarpCore` and the runtime-facing tests/helpers no longer
open the old class directly.

This cycle removes the remaining class/file/open-function noun from active
source while preserving the internal host behavior behind the explicit
`RuntimeHostProduct` seam.

## Hill

The active source tree no longer contains `src/domain/WarpRuntime.ts`,
`openWarpRuntime()`, `getWarpRuntimePrototype()`, or a `WarpRuntime` class.

## Playback questions

### Agent

- Is the internal host class now named `RuntimeHost`?
- Does `RuntimeHostProduct` open the host through `openRuntimeHost()`?
- Are CLI open paths off direct `WarpRuntime` imports?
- Do the runtime-host seam and public API ratchets pass?

### Human

- If I inspect the runtime-kill queue, is only the umbrella closeout left?

## Accessibility / assistive reading posture

Not user-facing. No additional accessibility posture is required.

## Localization / directionality posture

Not user-facing. No localization or directionality impact.

## Agent inspectability / explainability posture

The deletion is inspectable by file paths, import paths, and executable script
ratchets. The new source noun is `RuntimeHost`, and product-facing code still
enters through `openWarpGraph()` / `WarpCore`.

## Non-goals

- No capability redesign in this slice
- No controller/service decomposition in this slice
- No public API expansion in this slice
- No historical audit/archive rewrite in this slice

## Test plan

### RED

Update the class-delete ratchet so it fails while:

- `src/domain/WarpRuntime.ts` exists
- `openWarpRuntime()` exists
- `getWarpRuntimePrototype()` exists
- the `API_delete-warpruntime-class` backlog card still exists
- `API_kill-warpruntime` is still blocked by the class-delete card

### GREEN

- move `WarpRuntime.ts` to `RuntimeHost.ts`
- rename the class to `RuntimeHost`
- replace `openWarpRuntime()` with `openRuntimeHost()`
- delete `getWarpRuntimePrototype()`
- route CLI/runtime product boot through `openRuntimeHostProduct()`
- remove the completed class-delete backlog card
- unblock `API_kill-warpruntime`

### Witness

- `npx vitest run test/unit/scripts/openwarpgraph-composition-root.test.ts test/unit/scripts/runtime-host-product-seam.test.ts test/unit/scripts/runtime-wiring-surface-closeout.test.ts test/unit/scripts/public-api-cost-signaling.test.ts test/unit/scripts/public-api-strand-noun.test.ts test/unit/scripts/delete-warpruntime-class-split.test.ts test/unit/scripts/kill-warpruntime-split.test.ts`
- `npm run typecheck`
- `git diff --check`

## Playback

### Agent

- Yes. The internal host class is now `RuntimeHost`.
- Yes. `RuntimeHostProduct` opens through `openRuntimeHost()`.
- Yes. CLI open paths use `openRuntimeHostProduct()` instead of direct
  `WarpRuntime` imports.
- Yes. The runtime-host seam and public API ratchets pass.

### Human

- Yes. The only remaining runtime-kill queue item is the umbrella closeout.

### Verdict

`hill met`

## Drift check

No negative drift. The old public/runtime class noun is gone from active source;
remaining historical mentions live in audits, archives, or ratchet strings that
describe what must stay deleted.

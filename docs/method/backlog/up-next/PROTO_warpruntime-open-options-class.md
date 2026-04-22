---
id: PROTO_warpruntime-open-options-class
blocked_by: []
blocks: []
---

# PROTO: WarpRuntime.open() options → WarpOpenOptions class

## Legend

PROTO — protocol-level structural improvement

## Problem

`WarpRuntime.open()` takes **23 destructured parameters**. The constructor
body makes **90 `this._` assignments**. Validation, defaulting, and
normalization all happen inline inside `open()`.

This violates SSJS Rule 0 (Runtime Truth Wins) and P1 (Domain Concepts
Require Runtime-Backed Forms). The options bag is a domain concept with
invariants — it deserves a class.

`WarpOptions.js` exists but only holds typedefs for `ServeOptions`,
`MaterializeOptions`, and `PatchCommitEvent`. The one options bag that
actually needs runtime backing (`open()` params) is unmodeled.

## Proposal

Create a `WarpOpenOptions` class:

- Constructor validates required fields (`persistence`, `graphName`, `writerId`)
- Constructor validates optional fields (`checkpointPolicy`, `onDeleteWithData`)
- Defaults ports (`clock`, `codec`, `crypto`) at construction
- Freezes after construction
- `WarpRuntime.open(options)` accepts `WarpOpenOptions` (or a raw object
  that gets parsed into one at the boundary)

## Impact

- Simplifies `WarpRuntime.open()` from ~80 lines of validation+defaulting to ~5
- Makes the options surface testable independently
- Enables builder pattern for tests: `WarpOpenOptions.minimal({ persistence })`
- Kills the 23-param max-params ESLint override

## Risk

Breaking change to `WarpRuntime.open()` signature if we stop accepting
raw objects. Recommend accepting both (raw parsed at boundary, class
passed through) for backward compat.

## Related

- `CC_patchbuilder-12-param-constructor.md` — same smell on PatchBuilderV2
- `PROTO_warpruntime-god-class.md` — WarpRuntime decomposition

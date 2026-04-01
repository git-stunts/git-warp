# OG-002 — Split Mutable Session `WarpRuntime` From Immutable Snapshot Noun

Status: DONE

Promoted to: `docs/design/warpstate-runtime-noun-split.md`

Completed in: `15.0.0`

## Problem

`WarpRuntime` had been carrying too many roles at once under the old
`WarpGraph` noun: mutable session handle,
materialization driver, and the intended immutable snapshot noun.

## Why This Matters

The new observer/worldline model will stay semantically muddy until the public
names make the substrate boundary obvious.

## Promotion

This item was promoted when `Worldline` and immutable observer/worldline
handles made the remaining `WarpGraph` noun overload the next explicit cleanup
decision.

## Outcome

The hard major-version cut landed:

- public runtime noun is now `WarpRuntime`
- `WarpGraph` was removed instead of preserved as a compatibility alias
- package version bumped to `15.0.0`

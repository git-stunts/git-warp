# Retro — 0060 observer capability seam

## Outcome

`hill met`

The observer/traversal seam no longer depends on `WarpRuntime`.

What changed:

- `Observer.ts` now accepts an explicit `ObserverBacking` contract
- traversal is now constructed directly from the observer seam
- the touched observer path no longer carries the stale `StateReader.js`
  import
- the live `API_migrate-consumers-to-capabilities` note and the `v17`
  release ledger now describe the remaining detached/query/core bridge tail
  more precisely

## Evidence

- [0060-observer-capability-seam.md](../../../design/0060-observer-capability-seam.md)
- [Observer.ts](../../../../src/domain/services/query/Observer.ts)
- [observer-capability-seam.test.ts](../../../../test/unit/scripts/observer-capability-seam.test.ts)

## Witness

- `npm exec vitest run test/unit/domain/services/Observer.test.ts test/unit/scripts/observer-capability-seam.test.ts`
- `npm run typecheck`
- `git diff --check`

## What we got ourselves into

The observer seam was still doing runtime cosplay: it imported
`WarpRuntime`, self-cast into traversal, and hid the real live backing
contract behind `as unknown as`.

## What we got ourselves out of

The seam is now explicit. `Observer` names the operations it actually needs,
and traversal consumes the observer directly instead of pretending the
observer is a runtime.

## What comes next

- `QueryController` and detached graph runtime coupling
- `WarpApp` / `WarpCore` bridge residue
- then `API_kill-warpruntime`

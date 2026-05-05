# 0125 Consumer Typecheck Materialize Residue

- Status: `hill met`
- Date: 2026-05-04
- Release lane: `v17.0.0`
- Source task: `SPEC_consumer-typecheck-materialize-residue`
- DAG source: [0124-v17-release-blocker-dag.md](0124-v17-release-blocker-dag.md)

## Hill

`npm run typecheck:consumer` proves the v17 `openWarpGraph()` public
surface has no materialize frontdoor and has positive coverage for the
blessed query/worldline/observer read surface.

This cycle fixes the consumer type gate only. It must not restore a
compatibility materialize shim to `WarpGraph`, widen public exports, or
edit production query/runtime/storage code.

## User Stories

- As an app developer using `openWarpGraph()`, I can discover the public
  read path through `graph.query`, `graph.query.worldline()`, and
  `graph.query.observer(...)`, not by materializing a graph first.
- As a maintainer, I can run `npm run typecheck:consumer` and trust it
  to fail if `openWarpGraph()` accidentally regains `materialize`.
- As a release reviewer, I can distinguish the legacy/plumbing
  `WarpCore` materialization surface from the v17 `WarpGraph` app
  surface.

## Requirements

- Keep `WarpGraph` materialize-free:
  - no `graphBag.materialize`;
  - no `graphBag.materialize.materialize`;
  - no `graphBag.query.materialize`.
- Add positive consumer type coverage for:
  - `graphBag.query.getStateSnapshot()`;
  - `graphBag.query.query()`;
  - `graphBag.query.worldline()`;
  - `graphBag.query.observer({ match: '*' })`;
  - `graphBag.query.getNodeProps(...)`.
- Preserve existing `WarpCore` compile coverage where it still represents
  substrate/tooling behavior. Do not use this slice to solve the broader
  docs/runtime materialization purge.
- Keep the patch test-only plus docs/status bookkeeping only.

## Acceptance Criteria

- `npm run typecheck:consumer` passes.
- The consumer fixture contains `@ts-expect-error` checks proving the
  v17 `openWarpGraph()` capability bag does not expose materialization.
- The consumer fixture includes positive public read-surface checks for
  query, worldline, observer, state snapshot, and node props.
- `npm run typecheck` passes.
- `npm run lint` passes for the touched code.
- `npm run lint:md` and `npm run lint:md:code` pass for the cycle docs.
- The DAG status marks `SPEC_consumer-typecheck-materialize-residue`
  complete and regenerates the SVG.

## Test Plan

### RED

Run:

```sh
npm run typecheck:consumer
```

Known current failure:

```text
test/type-check/consumer.ts(318,64): error TS2339:
Property 'materialize' does not exist on type 'WarpGraph'.
```

This is the correct RED because the consumer contract still tries to use
`graphBag.materialize.materialize()` even though `WarpGraph` no longer
has that public capability.

### Goldens

- `npm run typecheck:consumer` is the golden public API compile gate.
- The positive golden is the public read path:
  `openWarpGraph() -> graph.query -> state snapshot/query/worldline/observer`.
- The negative golden is a compile-time error for materialize on the
  `openWarpGraph()` surface.

### Known Fails Outside This Cycle

- `npm run test:local` is still expected to fail on non-0125 clusters:
  checkpoint schema drift, controller reading-basis seams, stale
  materialize-spy tests, observer coordinate pinning, and the uniform
  git-cas upgrade contract drift.
- `npm run lint:quarantine-graduate` is still expected to fail until
  later source-churn blockers are paid down.

### Stress / Jitter

This is a compile-only public surface task, so runtime stress/jitter is
not meaningful inside the slice. The guard against future jitter is the
negative `@ts-expect-error` coverage: if a later refactor accidentally
reintroduces the materialize capability on `WarpGraph`, the consumer
typecheck fails because the expected error disappears.

## Playback Questions

1. Does the consumer fixture now fail if `openWarpGraph()` regains
   `materialize`?
2. Does the fixture positively prove the v17 read surface is
   query/worldline/observer-shaped?
3. Did this slice avoid production compatibility shims?
4. Did this slice avoid touching broad RuntimeHost/query/storage code?
5. Are remaining release blockers still visible in the DAG and status
   table?

## Non-Goals

- Do not fix docs materialize drift in this cycle.
- Do not replace runtime error text in this cycle.
- Do not remove `_materializeGraph()` in this cycle.
- Do not solve the post-v17 live-tail bounded query/checksum substrate.
- Do not run or fix the whole `test:local` failure set here.

## GREEN

Changed only the compile-only consumer fixture and release bookkeeping:

- Removed the stale positive
  `graphBag.materialize.materialize()` expectation.
- Added positive `openWarpGraph()` app-surface read coverage through
  `graphBag.query.getStateSnapshot()`, `graphBag.query.getNodeProps()`,
  `graphBag.query.query()`, `graphBag.query.worldline()`, and
  `graphBag.query.observer(...)`.
- Added negative `@ts-expect-error` coverage for:
  - `graphBag.materialize`;
  - `graphBag.materialize.materialize`;
  - `graphBag.query.materialize`.
- Updated `CHANGELOG.md` and the 0124 DAG status artifacts.

No production source, runtime, query, storage, or materialization code
changed.

## Validation

| Command | Result |
|---------|--------|
| `npm run typecheck:consumer` before GREEN | FAIL at `test/type-check/consumer.ts(318,64)`: `Property 'materialize' does not exist on type 'WarpGraph'`. |
| `npm run typecheck:consumer` after GREEN | PASS. |
| `npm run typecheck` | PASS. |
| `npm run lint` | PASS. |
| `npm run lint:md` | PASS. |
| `npm run lint:md:code` | PASS; 936 Markdown files checked. |
| `dot -Tsvg docs/design/0124-v17-release-blocker-dag.dot -o docs/design/0124-v17-release-blocker-dag.svg` | PASS. |

## Playback

1. Does the consumer fixture now fail if `openWarpGraph()` regains
   `materialize`?

   Yes. The `@ts-expect-error` checks on `graphBag.materialize` and
   `graphBag.materialize.materialize` become unused if materialize
   returns to the `WarpGraph` surface, which makes
   `npm run typecheck:consumer` fail.

2. Does the fixture positively prove the v17 read surface is
   query/worldline/observer-shaped?

   Yes. The fixture now typechecks the app-surface path through
   `graphBag.query.getStateSnapshot()`, `getNodeProps()`, `query()`,
   `worldline()`, and `observer(...)`.

3. Did this slice avoid production compatibility shims?

   Yes. No production source changed. The fix is a consumer contract
   correction, not a compatibility layer.

4. Did this slice avoid touching broad RuntimeHost/query/storage code?

   Yes. The only TypeScript code change is
   `test/type-check/consumer.ts`.

5. Are remaining release blockers still visible in the DAG and status
   table?

   Yes. The status CSV marks this node complete, preserves all remaining
   incomplete nodes, and updates the current open-node set. The SVG was
   regenerated with the completed node marked.

## Drift Check

- No public API was widened.
- No `materialize` capability was reintroduced to `WarpGraph`.
- `WarpCore` materialization compile coverage remains because it is the
  legacy/plumbing substrate surface, not the v17 `openWarpGraph()` app
  surface.
- The post-v17 live-tail bounded query/checksum blocker remains excluded
  from the v17 release-blocker DAG.
- `npm run test:local` and `npm run lint:quarantine-graduate` remain
  outside this cycle and are still tracked by the DAG.

## Cycle End

`SPEC_consumer-typecheck-materialize-residue` is complete.

The new open front is:

- `SPEC_docs-materialize-frontdoor-drift`
- `BND_checkpoint-schema-contract-drift`
- `PORT_patch-controller-reading-basis`
- `PORT_sync-controller-reading-basis`
- `SPEC_observer-coordinate-pinning`
- `SPEC_uniform-git-cas-upgrade-contract-drift`
- `HEX_sync-secret-plain-string`

Recommended next node: `SPEC_docs-materialize-frontdoor-drift`.

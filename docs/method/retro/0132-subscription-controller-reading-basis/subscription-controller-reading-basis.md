# 0132 Subscription Controller Reading Basis Retro

- Date: 2026-05-05
- Cycle: `0132-subscription-controller-reading-basis`
- Source task: `PORT_subscription-controller-reading-basis`
- Status: `Closed`

## Playback

The cycle answered the hill: subscription polling no longer performs a
hidden `_materializeGraph()` refresh. A changed frontier is now an
explicit stale reading-basis error, and local patch commits over a clean
cached reading basis publish subscriber diffs without another
materialization call.

## Drift

The first read exposed two related but distinct problems. The direct
controller seam still called `_materializeGraph()`, and runtime local
patch commits had enough diff information to notify subscribers but did
not publish it. The fix stayed within that boundary: no sync behavior,
observer pinning, or live-tail substrate work moved into this slice.

## Good

- The RED tests failed for the right reasons before production changes.
- The controller host contract is narrower and no longer names
  `_materializeGraph()`.
- A real behavior gap closed: clean local patch commits now notify
  subscribers without an extra replay.

## Bad

- `WarpGraph.watch.test.ts` still contains a lot of old internal
  materialization setup outside the polling cluster.
- RuntimeHost remains a large side-effect owner, and `_setMaterializedState`
  now carries subscriber publication as another responsibility.
- The subscription contract still lacks a real live-tail bounded read
  substrate for external frontier changes.

## Ideas

- Extract a named subscription publication owner from RuntimeHost once the
  sync and materialize-spy clusters settle.
- Add a small public v17 subscription example that demonstrates local
  patch notifications without teaching `materialize()`.
- When the live-tail substrate exists, replace the stale poll error with a
  bounded subscription read refresh.

## Next

The next open controller seam is `PORT_sync-controller-reading-basis`.
Closing it should unlock `SPEC_materialize-spy-test-clusters` for the
remaining stale public/internal materialization tests.

## Validation Snapshot

- Focused subscription controller test passed: `53` tests.
- Focused runtime watch/subscribe tests passed: `75` tests.
- `npm run lint`, `npm run lint:sludge`, `npm run typecheck`,
  `npm run typecheck:consumer`, `npm run lint:md`,
  `npm run lint:md:code`, `npm audit --omit=dev --audit-level=high`,
  and `git diff --check` passed.
- `npm run test:local` remains red: `17` files failed, `66` tests
  failed. The remaining red clusters map to still-open DAG nodes.

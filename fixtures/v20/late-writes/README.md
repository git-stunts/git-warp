# V20 Late-Writes Fixture

Evidence for the v20-to-v21 migration boundary
([#1015](https://github.com/git-stunts/git-warp/issues/1015)). v20.0.0 caches
its substrate check per graph, so a v20 process opened before the migration
keeps writing after it. The migration cannot fence that process; it contains
its writes.

`generate.mjs` builds this with real code on the host:

1. The released v20.0.0 build writes graph `late`: alice writes `lane:1` and
   creates strand `side` with `side:1`.
2. A v20.0.0 RuntimeHost opens as alice and materializes.
3. The current tree's migration (`scripts/v20-to-v21`) migrates `late`.
4. The still-open v20.0.0 host writes `late:lane` to the lane and
   `late:strand` to strand `side`. Both succeed.
5. A fresh v20.0.0 open is refused (`outcome.freshV20Open`).

`manifest.json` pins the bundle digest, every ref, and those outcomes.
`test/unit/scripts/v20-to-v21-late-writes.test.ts` restores the bundle and
checks that:

- the v21 runtime reads the late lane write;
- the late-write report lists that commit beyond the migration frontier;
- the late strand write moved only legacy refs, which v21 never reads and the
  report lists.

## Regenerating

```bash
git worktree add --detach ../git-warp-v20.0.0 v20.0.0
(cd ../git-warp-v20.0.0 && npm ci --ignore-scripts && npx patch-package && npm run build)
node fixtures/v20/late-writes/generate.mjs ../git-warp-v20.0.0 <empty-dir>
git -C <empty-dir> for-each-ref --format='%(refname)' refs/warp/ \
  | git -C <empty-dir> bundle create "$PWD/fixtures/v20/late-writes/v20-late-writes.bundle" --stdin
```

Then copy the printed outcome, the bundle digest and the refs of a fresh
restore into `manifest.json`. Run it on the host: it authors data with a
released build. Tests that read the fixture run in Docker.

# V19 Pre-Worldline Fixture

Authentic legacy history for the v20→v21 worldline dot-mint migration
([#1015](https://github.com/git-stunts/git-warp/issues/1015)). Released code
wrote every commit. The **v19.1.0** tag (`20a9b7f7`) was checked out into a
worktree and built, and the generator imports only that build's `dist`. v20 did
not change the on-disk format, so this is the input a v21 migration will see.

The bundle is about 64 KiB. It holds 32 `refs/warp/*` refs across seven graphs,
one scenario per graph:

| Graph | Class | What it pins |
| --- | --- | --- |
| `golden` | golden | Lane writers alice and bob write nodes, edges, properties and an entity. Alice forks strand `review`, which writes the checkpoint, then writes to the strand and settles it into the lane. No duplicate dots. |
| `braided` | edge case | Strand `main-work` braids strand `support`. The braid pin and the support overlay head are the same commit. |
| `collision` | edge case | Lane writer `next` and alice's strand `next` both mint the legacy dot `next:1`. Under the v21 keys `@w.next` and `@w.alice@s.next` they no longer collide. |
| `dotted-ids` | edge case | Writer `ops.bot-1` owns strand `rel.v2`. `.` is legal in legacy ids and is also the sigil separator. |
| `dot-reuse` | known failure | Two alice sessions both mint `alice:1`. Each fresh v19 lane handle seeds counters from an empty vector; #1001 fixed this. |
| `dot-reuse-tombstone` | known failure | The same reuse, then a remove of `note:drop`. The remove tombstones the shared dot, so v19.1.0 also hides `note:keep`. |
| `ownerless` | known failure | Strand `orphan` has `owner: null`. The release's internal `createStrand` writes that when no owner is given. |

`manifest.json` pins the bundle SHA-256 and every ref head and object type. For
each scenario it also records the proposed migration outcome: `migrate` with the
expected v21 mint ids, or `refuse` with a refusal reason. `release-census.json`
is what v19.1.0 itself observes for each graph, as printed by `census.mjs`:

- every chain and every add dot;
- duplicate dots;
- strand descriptors;
- visible lane and strand state.

`test/unit/scripts/v19-pre-worldline-fixture.test.ts` restores the bundle and
requires the current runtime to reproduce that census exactly.

Dot reuse is not rare in v19 and v20 history. Any writer that opened a lane in
more than one session repeated its counters, so the migration's duplicate-dot
policy decides the outcome for most real repositories.

## Regenerating

```bash
git worktree add --detach ../git-warp-v19.1.0 v19.1.0
(cd ../git-warp-v19.1.0 && npm ci --ignore-scripts && npx patch-package && npm run build)
node fixtures/v19/pre-worldline/generate.mjs ../git-warp-v19.1.0 <empty-dir>
git -C <empty-dir> for-each-ref --format='%(refname)' refs/warp/ \
  | git -C <empty-dir> bundle create "$PWD/fixtures/v19/pre-worldline/v19-pre-worldline.bundle" --stdin
git init -q --initial-branch=fixture <restored-dir>
git -C <restored-dir> fetch -q "$PWD/fixtures/v19/pre-worldline/v19-pre-worldline.bundle" \
  'refs/warp/*:refs/warp/*'
node fixtures/v19/pre-worldline/census.mjs ../git-warp-v19.1.0 <restored-dir> \
  > fixtures/v19/pre-worldline/release-census.json
# Copy these into manifest.json as bundleSha256 and refs[]:
shasum -a 256 fixtures/v19/pre-worldline/v19-pre-worldline.bundle
git -C <restored-dir> for-each-ref --format='%(refname) %(objectname) %(objecttype)' refs/
```

Both the generator and the census refuse to run unless the worktree `HEAD` is
the release commit. Author and committer identity and time are fixed, so every
`refs/warp/*` head reproduces exactly. The git-cas materialization cache
(`refs/cas/caches/git-warp/materializations`) is not deterministic, and it is
derived data, so the bundle leaves it out. Run the census against a scratch
restore, because materialization can write caches. These scripts run on the
host because they author data; tests that read the fixture run in Docker.

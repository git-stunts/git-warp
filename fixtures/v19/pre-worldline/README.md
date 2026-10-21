# V19 Pre-Worldline Fixture

Authentic legacy history for the v20→v21 worldline dot-mint migration
([#1015](https://github.com/git-stunts/git-warp/issues/1015)). Released code
wrote every commit. The **v19.1.0** tag (`20a9b7f7`) was checked out into a
worktree and built, and the generator imports only that build's `dist`. v20 did
not change the on-disk format, so this is the input a v21 migration will see.

The bundle is about 175 KiB. It holds 44 `refs/warp/*` refs across ten
graphs, one scenario per graph:

| Graph | Class | What it pins |
| --- | --- | --- |
| `golden` | golden | Lane writers alice and bob write nodes, edges, properties and an entity. Alice forks strand `review`, which writes the checkpoint, then writes to the strand and settles it into the lane. No duplicate dots. |
| `braided` | edge case | Strand `main-work` braids strand `support`. The braid pin and the support overlay head are the same commit. |
| `collision` | edge case | Lane writer `next` and alice's strand `next` both mint the legacy dot `next:1`. Once identities are resolved, the lane dot stays `next` and the strand dot becomes `@w.alice@s.{next}`. |
| `collision-remove` | edge case | Lane writer `next` mints `next:1`. Alice's strand `next` mints `next:2` and `next:3`, then removes `lane:1` (observing lane dot `next:1`) and `strand:2` (observing its own `next:3`). References have to be resolved by origin, not by string. |
| `dotted-ids` | edge case | Writer `ops.bot-1` owns strand `rel.v2`. `.` is legal in legacy ids and is also the sigil separator. |
| `counter-reset` | known failure | 100 adds in one session, then a restarted session mints `alice:1` again. The head's own context counter is 1, so a mint seeded from the head alone would reuse `alice:2` ([#1021](https://github.com/git-stunts/git-warp/issues/1021)). |
| `dot-reuse` | known failure | Two alice sessions both mint `alice:1`. Each fresh v19 lane handle seeds counters from an empty vector; #1001 fixed this. |
| `dot-reuse-tombstone` | known failure | The same reuse, then a remove of `note:drop`. The remove tombstones the shared dot, so v19.1.0 also hides `note:keep`. |
| `ownerless` | known failure | Strand `orphan` has `owner: null`. The release's internal `createStrand` writes that when no owner is given. |
| `shared-dot-strand-remove` | known failure | Two alice sessions both mint `alice:1`. Bob's strand `cleanup` removes `note:drop`, observing the shared dot, so the strand view also loses `note:keep` while the lane keeps both. The migration preserves that strand-local deletion and reports it. |

For each scenario, `manifest.json` records the bundle SHA-256, every ref head
and object type, and the proposed migration outcome. That outcome follows the
amended contract in #1015: preserve the existing interpretation, report the
damage, and never block because of duplicates.

- `migrate` lists the expected mint ids:
  - lane keys stay bare, as in v20;
  - strand mints are written `@w.<owner>@s.{<strand name>}`, where the braces
    stand for the immutable strand id the migration assigns (#1014).
- `damage` lists what the migration must report.
- `allocationFloors` lists the counter each writer must mint above (#1021).
- `refuse` names the refusal reason. Only ownerless strands refuse.
- Repair is a separate operation ([#1022](https://github.com/git-stunts/git-warp/issues/1022)).

`release-census.json` is what v19.1.0 itself observes for each graph, as
printed by `census.mjs`:

- every chain;
- each patch's own context counter, add dots, and removes with the dots they observed;
- duplicate dots;
- strand descriptors;
- visible lane and strand state.

`test/unit/scripts/v19-pre-worldline-fixture.test.ts` restores the bundle and
requires the current runtime to reproduce that census exactly.

### What this corpus cannot contain

No released version can put one legacy dot on both a lane object and a
strand object inside a single view:

- strand mints are seeded from the strand's `observedFrontier`, so they start
  above every counter already in its view;
- a strand's base is fixed when it is created;
- a braid requires identical pinned base observations, and is refused with
  `E_STRAND_COORDINATE_INVALID` otherwise (covered in
  `test/unit/domain/WarpGraph.strands.test.ts`).

So a cross-origin alias followed by a remove is not authentic history. The
migration tests for it (#1015) build that input synthetically and label it as
such.

Dot reuse is not rare in v19 and v20 history. Any writer that opened a lane in
more than one session repeated its counters, so a migration that refused on
duplicates would refuse most real repositories.

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
restore, because materialization can write caches and automatic checkpoints.
Take the manifest refs from a fresh restore of the bundle, never from a
repository the census has touched. These scripts run on the
host because they author data; tests that read the fixture run in Docker.

# Operations

Use this page when maintaining or diagnosing a Runtime repository. For
application code, start with [Getting started](../topics/getting-started.md).

## Health

Run the bounded Runtime diagnostic for each affected Lane:

```bash
git warp doctor --repo ./team-repo --lane users
```

Doctor reports structural, audit, hook, and retained-materialization findings.
It does not mutate authoritative history or silently repair git-cas.

## Upgrade v19 to v20

These instructions apply to v20.0.0. Test and deploy the same reviewed package
version across the fleet before resuming shared operation.

The upgrade changes interpretation, not authoritative Git history. Node membership
remains observed-remove, while qualifying removals immediately establish a node-wide
LWW property clear. Older properties remain cleared even when concurrent membership
survives. Schema bumps do not fence an old reader or writer.

1. Test the v20 application against a disposable backup. Preserve historical hashes
   and receipts with their original interpreter identity.
2. Stop every reader and writer sharing the repository. Make an independent mirror
   backup and run `git fsck --full`, as shown in the retained-v18 procedure below.
3. Deploy the same reviewed v20 interpretation to all readers and writers. Do not
   resume a mixed-interpreter fleet.
4. Regenerate derived materializations/checkpoints from immutable patch history.
   Use the explicit [bounded-basis repair](#prepare-a-bounded-basis) for each affected
   Lane, then verify bounded reads, a write and its Receipt, restart and backup.
   An unavailable lifecycle/checkpoint basis is a refusal, not permission to use a
   whole-graph fallback or relabel old evidence.
5. Resume shared operation after those checks. Keep recovery/retention anchors until
   a separate verified retention decision permits their removal.

Current state is `full-v7`; materialization descriptors use schema 7 and lifecycle
shards/receipts schema 2. Direct `full-v6` decoding is refused. Legacy `full-v5`
decoding does not reconstruct lifecycle witnesses. Membership compaction retains
all evidence; property GC does not establish constant total metadata memory and
remains disabled by default. See [Property reclamation](../topics/property-reclamation.md)
and the [shipped upgrade guide](../migrations/v19/README.md#upgrade-v19-to-v20).

## Migrate retained v18 state

The following command deliberately pins the published v19.1.0 intermediate
package for the retained-v18 migration. It is distinct from the v20 interpretation
upgrade above. The safe migrator was introduced
in v19.0.2; the v19.0.1 migrator lacks complete per-commit progress and durable
post-TUI completion evidence, and the v19.0.0 migrator is unsafe for retained
v18 state. A repository already on v19 required no retained-data migration for v19.1.0;
the v20 interpretation upgrade still requires the coordinated steps above.

Prepare and test the v19 application without opening the authoritative
repository. During the maintenance window, stop every writer and make an
independent mirror backup:

```bash
REPOSITORY=/path/to/repository
BACKUP=/path/to/git-warp-backup.git

git clone --mirror --no-hardlinks "$REPOSITORY" "$BACKUP"
git -C "$BACKUP" fsck --full
```

Run the migration without `--dry-run`; the framed application discovers graph
names, reports source and scratch capacity, and asks for confirmation:

```bash
GRAPH_NAME='<graph-name>' # one of the names the discovery listed
```

<!-- v18-to-v19-cli: example promote shell -->
```bash
npm exec --package=@git-stunts/git-warp@19.1.0 -- git-warp-v18-to-v19 \
  --repo "$REPOSITORY" \
  --graph "$GRAPH_NAME"
```

After a successful cutover, rerun with `--yes --json`. The idempotent
verification must report `already-current`. Then start the already-tested v19
application and verify a bounded read, one write, its Receipt, restart
behavior, and the next backup.

An omitted `checkpointPolicy` now defaults to `{ every: 64 }` in v19.1.0.
Use `checkpointPolicy: null` only when disabling automatic checkpoints is a
deliberate operating choice.

Keep the recovery refs reported by the command until those checks and a
separate retention decision are complete. Do not move writer refs backward or
run garbage collection as part of the migration window. The
[complete migration guide](../migrations/v19/README.md) explains the Git object
rewrite, capacity formula, compare-and-swap promotion, automatic rollback, and
recovery topology.

## Prepare a bounded basis

When an Observation reports that no bounded basis is available:

```bash
git warp repair \
  --repo ./team-repo \
  --lane users \
  --action materialization
```

This is an explicit local repair. Patch history remains authoritative;
materializations and checkpoints are derived acceleration/evidence structures.

## Audit

```bash
git warp audit --repo ./team-repo --lane users
git warp audit --repo ./team-repo --lane users --writer local
```

Audit verifies the Lane's local Runtime trail. It does not replace deterministic
replay or grant trust to a writer.

## Inspect a Receipt

```bash
git warp receipt show --input receipt.json
```

The CLI uses the same canonical Receipt renderer as observe. Keep the
machine envelope when a later incident may need exact operation, outcome,
support, or repair evidence.

## Review and Settlement

v21 removed the CLI `fork` and `settle` commands with `Runtime.fork` and
settlement ([#1054](https://github.com/git-stunts/git-warp/issues/1054)).
[#1053](https://github.com/git-stunts/git-warp/issues/1053) brings strands and
settlement back as Coordinate-derived handles.

## Substrate and git-cas rollout coordination

When upgrading `@git-stunts/git-cas` (such as the 7.2.0 compressed reservation
index), upgrade every process that reads or writes a shared clone before any
7.2.0 reservation-ledger write occurs.

`git-cas` 7.1.0 cannot safely read the compressed reservation index written by
7.2.0 and rejects it as corrupt. `git-warp` does not provide an ambient runtime
version gate for mixed-version clone access; coordinating the rollout across all
concurrent processes is required.

## Garbage collection

git-warp stores its graph in the repository that `GitStorage.root()` names,
which is normally your own source repository. The git-warp runtime does not
run garbage collection there. Its read and write paths use only Git plumbing
commands, and plumbing commands never start `git gc --auto`. The one
exception is the one-off `git-warp-v18-to-v19` migrator: its `git fetch` can
start Git's automatic maintenance, as any fetch can.

Other Git commands in the same repository can collect git-warp's objects:

- **Your own porcelain commands.** `git commit`, `git merge` and `git fetch`
  run `git gc --auto` when the repository is over Git's `gc.auto` threshold,
  which is 6,700 loose objects by default. By default that GC runs in the
  background, at the same time as git-warp writes.
- **When this does not happen.** If `gc.auto` is `0`, `git gc --auto` does
  nothing, and the scheduled `git gc --cruft` below is the only collector.
  `git maintenance register` and `git maintenance start` set
  `maintenance.auto=false`. That setting stays after `git maintenance
  unregister`, so porcelain no longer starts automatic GC in that repository.

The risk of a GC that runs alongside git-warp writes is low, but not zero.
GC removes only unreachable objects older than `gc.pruneExpire`, two weeks by
default. A write's objects become reachable from the writer ref and the
custody refs under `refs/cas/` as the write completes; the write's attempt
ref holds only a small journal blob. Under cruft packs (`git gc --cruft`, and
a plain `git gc` from Git 2.41 or with `gc.cruftPacks=true`),
`git fast-import` can reuse an old unreachable object that is already in a
cruft pack without refreshing its age. A prune can then delete that object
while a write still needs it. This is the race that git-gc(1) describes in
its NOTES section. Whether git-warp can hit it is under investigation in
[#1110](https://github.com/git-stunts/git-warp/issues/1110). By this
mechanism, the race needs a write in flight during the GC; that is reasoning,
not a tested result. While #1110 is open, schedule the GC when no git-warp
process writes to the repository, or accept the risk that this paragraph
states.

A concurrent GC holds Git ref locks for a short time. A write that meets one
of them can return, for example:

- `UnpublishedWriteReceipt`, with a cause such as `write-basis-unavailable`
  or `retention-unavailable`. It is known not to have published; submitting
  the intent again is a new attempt.
- `UnretainedWriteReceipt`, with the retention cause
  `settlement-unacknowledged`. The write is published; only its retention was
  not confirmed. Pass the receipt's `attempt` to
  `warp.as(writer).reconcile(attempt)`, which retries the retention. If it
  returns `UnretainedWriteReceipt` again, call it again later. A `null` result
  means that the attempt was already answered or that a sweep finished it,
  not that the write was lost.

If nothing collects garbage, disk use grows by about 220 KiB for each
retained write, with no upper limit. The default threshold is passed after
about 120 retained writes.

### Schedule `git gc --cruft`

Run `git gc --cruft` on a schedule, for example once a day from cron. It
needs Git 2.37 or later. From Git 2.41, `gc.cruftPacks` defaults to `true`,
so a plain `git gc` does the same. On Git 2.37 to 2.40, also set
`gc.cruftPacks` to `true` once in the repository. On Git older than 2.37,
upgrade Git: a plain `git gc` is not enough above about 18 retained writes a
day. Set `REPOSITORY` to the repository behind `GitStorage.root()`:

```bash
REPOSITORY=/path/to/your/repository

# Git 2.37 to 2.40 only, once:
git -C "$REPOSITORY" config gc.cruftPacks true

git -C "$REPOSITORY" gc --cruft --quiet
```

On Git 2.37 to 2.40 without `gc.cruftPacks=true`, every other full GC in the
repository is not a cruft GC. This includes a `git gc` that you run by hand,
`git maintenance run --task=gc`, and an automatic `git gc --auto` when the
repository has more than `gc.autoPackLimit` packs (50 by default). Such a GC
deletes the cruft pack and writes its garbage back as loose objects, with
their age reset to the cruft pack's modification time, normally the time of
the last cruft GC. The repository can then be over `gc.auto` until the next
`git gc --cruft`. Because the ages were reset, that garbage is also removed
later. By the same mechanism, a plain GC that keeps happening can keep it
from ever being removed; that case is reasoned, not tested. With the setting,
each of these GCs writes a cruft pack and keeps the objects' ages.

`git gc --cruft` packs every reachable object. It puts each unreachable
object into a cruft pack that keeps the object's age, and it removes the
unreachable objects older than `gc.pruneExpire`. Between runs, an automatic
`git gc --auto` from your own commands can still leave young garbage loose.
If more than about 250 retained writes happen between runs (6,700 ÷ 26),
schedule `git gc --cruft` more often, for example hourly. Do not
run `git gc --prune=now` while git-warp writes: an unfinished write can hold
objects that no ref reaches yet.

On Git older than 2.41 without `--cruft` or `gc.cruftPacks=true`, a plain
`git gc` leaves young unreachable objects loose until they are older than
`gc.pruneExpire`. At steady state that is about 26 loose objects for each
retained write in the last two weeks. Above about 18 retained writes a day, the repository stays
over `gc.auto`. Your own commands then print "There are too many unreachable
loose objects" on every run. When that GC runs in the background, which is
the default, Git also writes `gc.log` and stops automatic GC until `gc.log`
is older than `gc.logExpire` (one day by default).

If the repository is already registered with `git maintenance`, run
`git maintenance unregister`, or turn off its `loose-objects` task:

```bash
git -C "$REPOSITORY" config maintenance.loose-objects.enabled false
```

With a plain `git gc` before Git 2.41, the daily `loose-objects` task
re-packs young garbage with the live objects, and it is never removed unless
a GC runs at least daily. With `git gc --cruft`, it is removed one GC cycle
later than it would be otherwise.
git-maintenance(1) advises against enabling both its `loose-objects` and
`gc` tasks; that caution is about maintenance's own tasks.

### Measured cost

These figures were measured in Docker on a fresh repository, with git-cas
7.2.0 and Git 2.39.5
([#1080](https://github.com/git-stunts/git-warp/issues/1080)). Object counts
come from sampled operations. Disk use assumes a filesystem with 4 KiB blocks,
because each loose object takes at least one block. Ranges are the values
seen in sampled operations over several runs, not bounds: the trie depth
varies with random attempt ids.

| Measure | Retained write | Retained read (projection) |
| --- | --- | --- |
| New loose objects | 48 to 57, average 55.1 over 400 writes | 26 to 35 in sampled reads (35 once, at read 100), average 29.9 over 200 reads |
| Loose disk use | about 220 KiB | about 120 KiB |
| Permanent refs | 1, under `refs/cas/reservation-custody/` | 1, under `refs/cas/reservation-custody/` |
| Unreachable when the operation returns | 15 to 21 | 8 to 14 |
| Unreachable in total, including objects that later operations replace | about 26 | about 16 |
| Kept after `git gc --prune=now` | 29.4 objects, 5.45 KiB packed | about 14 objects |

- After 400 writes, the repository held 22,026 loose objects (88,104 KiB) and
  no packs. `git gc --prune=now` packed them into 2,181 KiB. A scheduled
  `git gc --cruft` reaches the same result once the garbage is older than
  `gc.pruneExpire`.
- The cost grows slowly as history grows.
- Unreachable objects are temporary bookkeeping objects. Retained data stays
  reachable from its refs, so GC keeps it.
- The read column is a projection, not shipped behavior. Reads in this
  release do not retain anything. When
  [#1052](https://github.com/git-stunts/git-warp/issues/1052) Slice 3b lands,
  a read will retain only when its query asks for a Coordinate. The read
  figures come from calling observation custody directly, without the
  objects of the test fixture.

A `git warp doctor` check for unremoved garbage is planned in
[#1057](https://github.com/git-stunts/git-warp/issues/1057). A git-cas change
that writes packs instead of loose objects is planned in
[#1101](https://github.com/git-stunts/git-warp/issues/1101). The garbage
collection rule on this page was decided on 2026-11-08 under the maintainer's
delegation; the read retention rule was decided by the maintainer on
2026-11-06. Both are recorded on #1080.

## Storage incidents

Derived materialization repair may remove invalid entries; it cannot recreate
missing bytes. Physical cache/page residency belongs to git-cas. Preserve WARP
writer refs and content objects before attempting storage recovery.

Do not move an authoritative writer ref backward without an isolated rehearsal,
an additive recovery ref, and an exact replay plan.

## Deno consumer smoke

Run `npm run test:deno:smoke` for one installed public consumer in the COPY-based
Deno image. The command builds the current npm tarball, installs it outside the
checkout inside the container, then imports the public API, writes a node,
prepares its materialization through the installed CLI, observes it from a fresh
Deno Runtime and closes both Runtimes. Import, admission, observation or cleanup
failures return a nonzero exit. No host repository or Git directory is mounted.
The first image build and dependency installation still take time; this selects
a small smoke operation rather than the full `npm run test:deno` matrix.

## See also

- [Locked dependency audit and reviewed tooling pins](dependency-audit.md)
- [Locked Bun test-image dependencies](bun-dependencies.md)
- [Coverage runs and threshold updates](coverage.md)
- [Mermaid validation lifecycle](mermaid-validation.md)
- [npm package payload contract](package-payload.md)
- [Public capability guard and shrinking legacy inventory](public-surface.md)
- [CLI](../topics/cli.md)
- [Git substrate](../topics/git-substrate.md)
- [Troubleshooting](../topics/troubleshooting.md)
- [v18-to-v19 migration](../migrations/v19/README.md)

See also: [Session-event consumer conformance](session-event-conformance.md).

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
GRAPH_NAME=your-graph-name

npm exec --package=@git-stunts/git-warp@19.1.0 -- \
  git-warp-v18-to-v19 \
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

The CLI uses the same canonical Receipt renderer as write and observe. Keep the
machine envelope when a later incident may need exact operation, outcome,
support, or repair evidence.

## Review and Settlement

Always separate preview from apply:

```bash
git warp settle preview \
  --repo ./team-repo \
  --source users \
  --strand review-auth \
  --target users \
  --out settlement.json

git warp settle apply \
  --repo ./team-repo \
  --plan settlement.json
```

The apply step revalidates a fresh Runtime-owned plan. A moved source or target
requires a new preview and review.

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

Other Git commands in the same repository can collect git-warp's objects.
Your own porcelain commands, such as `git commit`, `git merge` and
`git fetch`, run `git gc --auto` when the repository is over Git's `gc.auto`
threshold (6,700 loose objects by default). By default that GC runs in the
background while git-warp may be writing. This is safe: GC removes only
unreachable objects older than `gc.pruneExpire`, two weeks by default. The
objects of an unfinished write are younger than that, or its attempt refs
keep them reachable. If `gc.auto` is `0`,
`git gc --auto` does nothing.

If nothing collects garbage, disk use grows by about 220 KiB for each
retained write, with no upper limit. The default threshold is passed after
about 120 retained writes.

### Schedule a plain `git gc`

Run a plain `git gc` (without `--auto`) on a schedule, for example once a day
from cron. Set `REPOSITORY` to the repository behind `GitStorage.root()`:

```bash
REPOSITORY=/path/to/your/repository

git -C "$REPOSITORY" gc --quiet
```

A plain `git gc` packs all objects and removes the unreachable objects that
are older than `gc.pruneExpire`. It is safe to run while git-warp writes,
for the reason given above. Do not run `git gc --prune=now` while git-warp
writes: an unfinished write can hold objects that no ref reaches yet.

Do not use `git maintenance start` for this. Its default incremental schedule
packs loose objects, including unreachable ones, and never removes them. After
it runs, the loose-object count stays low, so `git gc --auto` does not start
either. git-maintenance(1) advises against enabling both the `loose-objects`
and `gc` tasks at the same time.

### Measured cost

These figures were measured in Docker on a fresh repository, with git-cas
7.2.0 and Git 2.39.5
([#1080](https://github.com/git-stunts/git-warp/issues/1080)). Object counts
come from sampled operations. Disk use assumes a filesystem with 4 KiB blocks,
because each loose object takes at least one block.

| Measure | Retained write | Retained read (projection) |
| --- | --- | --- |
| New loose objects | 48 to 57, average 55.1 over 400 writes | 26 to 32, average 29.9 over 200 reads |
| Loose disk use | about 220 KiB | about 120 KiB |
| Permanent refs | 1, under `refs/cas/reservation-custody/` | 1, under `refs/cas/reservation-custody/` |
| Unreachable when the operation returns | 15 to 21 | 8 to 12 |
| Unreachable in total, including objects that later operations replace | about 26 | about 16 |
| Kept after GC | 29.4 objects, 5.45 KiB packed | about 14 objects |

- After 400 writes, the repository held 22,026 loose objects (88,104 KiB) and
  no packs. GC packed them into 2,181 KiB.
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

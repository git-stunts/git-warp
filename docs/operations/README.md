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

- [Locked Bun test-image dependencies](bun-dependencies.md)
- [Coverage runs and threshold updates](coverage.md)
- [Mermaid validation lifecycle](mermaid-validation.md)
- [npm package payload contract](package-payload.md)
- [CLI](../topics/cli.md)
- [Git substrate](../topics/git-substrate.md)
- [Troubleshooting](../topics/troubleshooting.md)
- [v18-to-v19 migration](../migrations/v19/README.md)

See also: [Session-event consumer conformance](session-event-conformance.md).

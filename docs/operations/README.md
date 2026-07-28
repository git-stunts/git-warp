# Operations

Use this page when maintaining or diagnosing a live v19 repository. For
application code, start with [Getting started](../topics/getting-started.md).

## Health

Run the bounded Runtime diagnostic for each affected Lane:

```bash
git warp doctor --repo ./team-repo --lane users
```

Doctor reports structural, audit, hook, and retained-materialization findings.
It does not mutate authoritative history or silently repair git-cas.

## Migrate retained v18 state

Use only the v19.0.1 migrator on an authoritative repository. The v19.0.0
migrator is unsafe for retained v18 state.

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

npm exec --package=@git-stunts/git-warp@19.0.1 -- \
  git-warp-v18-to-v19 \
  --repo "$REPOSITORY" \
  --graph "$GRAPH_NAME"
```

After a successful cutover, rerun with `--yes --json`. The idempotent
verification must report `already-current`. Then start the already-tested v19
application and verify a bounded read, one write, its Receipt, restart
behavior, and the next backup.

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

## See also

- [CLI](../topics/cli.md)
- [Git substrate](../topics/git-substrate.md)
- [Troubleshooting](../topics/troubleshooting.md)
- [v18-to-v19 migration](../migrations/v19/README.md)

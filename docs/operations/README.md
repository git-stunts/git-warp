# Operations

Use this page when you are maintaining or diagnosing a live repository rather
than writing product code against the worldline API.

For ordinary application reads and writes, start with
[Getting started](../topics/getting-started.md),
[Querying](../topics/querying.md), and
[Optic reads](../topics/optic-reads.md).

## Health checks

Start with health and visibility:

```bash
git warp info --repo ./team-repo
git warp check --repo ./team-repo
git warp doctor --repo ./team-repo --strict
```

These commands answer whether expected graphs, writers, frontiers, indexes,
checkpoints, and cursors are visible enough to continue.

## Checkpoints and GC

Checkpoints are substrate acceleration and evidence points. They are not the
source of truth. Patch history remains authoritative.

```bash
git warp checkpoint status --repo ./team-repo
git warp checkpoint create --repo ./team-repo
git warp checkpoint sync-coverage --repo ./team-repo
git warp gc status --repo ./team-repo
git warp gc maybe-run --repo ./team-repo
git warp gc run --repo ./team-repo
```

Use checkpoint and GC commands during maintenance windows, release validation,
or when bounded-read evidence depends on a checkpoint-tail basis.

## Index maintenance

```bash
git warp verify-index --repo ./team-repo
git warp reindex --repo ./team-repo
```

Use index verification when query posture, bitmap indexes, or bounded support
planning are suspect. Reindexing is an operator action, not a normal app read.

## Audit and trust

```bash
git warp verify-audit --repo ./team-repo
git warp trust list --repo ./team-repo
```

Audit receipts and trust records help prove what was admitted and who should be
trusted. They do not replace deterministic replay; they add durable evidence
around it.

## Diagnostic materialization

```bash
git warp materialize --repo ./team-repo
```

Use materialization for inspection, repair, migration, and evidence collection.
Do not make it the normal first-use read path. Prefer worldlines, observers,
and optic reads for application behavior.

## Hooks

```bash
git warp install-hooks --repo ./team-repo
```

Install hooks only when the repository's operators agree that local Git events
should trigger git-warp maintenance. Keep hook behavior visible in project
setup docs rather than relying on developer machine state.

## See also

- [CLI](../topics/cli.md)
- [Git substrate](../topics/git-substrate.md)
- [Sync](../topics/sync.md)
- [Troubleshooting](../topics/troubleshooting.md)

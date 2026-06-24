# Troubleshooting

Use this page when something observable is wrong and you need the next check.

## A read is empty

Check the source first:

```bash
git warp info --repo ./team-repo
git warp check --repo ./team-repo
```

If the writer is missing, fetch the WARP refs explicitly:

```bash
git fetch origin 'refs/warp/team/*:refs/warp/team/*'
```

If refs are present, check whether an observer aperture is filtering the entity
or property out of view.

## Optic basis is unavailable

`E_OPTIC_NO_BOUNDED_BASIS` means the runtime could not prove the checkpoint-tail
basis needed for the bounded read. It is not a missing-node result.

Run checkpoint diagnostics and decide whether to create or sync the needed
checkpoint evidence:

```bash
git warp checkpoint status --repo ./team-repo
git warp checkpoint create --repo ./team-repo
git warp checkpoint sync-coverage --repo ./team-repo
```

Then retry the optic read.

## Sync completed but changes are missing

Confirm the refspec. Normal branch fetches do not always include
`refs/warp/...`.

```bash
git fetch origin 'refs/warp/team/*:refs/warp/team/*'
git warp info --repo ./team-repo
git warp history --repo ./team-repo --node task:auth
```

If refs are visible but state still differs, check trust and audit diagnostics.

## State differs across clones

Check the same graph name, same WARP refs, same visible writers, and same trust
posture on both clones:

```bash
git warp doctor --repo ./clone-a --strict
git warp doctor --repo ./clone-b --strict
git warp verify-audit --repo ./clone-a
git warp verify-audit --repo ./clone-b
```

If both clones have the same refs and replay still differs, treat it as a
runtime defect and preserve the repository state before repairing it.

## Observer hides more than expected

Inspect the aperture:

- `match` controls which entities enter the view;
- `expose` is a property allow-list;
- `redact` wins over `expose`;
- edge visibility depends on both endpoints being visible.

If bytes must be hidden from a local operator, observer redaction is the wrong
tool. Use CAS content encryption.

## CAS content cannot be restored

Common causes:

- blob storage was not configured;
- a CAS payload pointer references missing content;
- vault metadata is missing;
- the passphrase is wrong;
- the encryption scheme is legacy and needs migration;
- the vault rotation limit has been reached.

Fix the storage or vault boundary first. Query changes will not repair missing
content storage.

## CLI cannot find the graph

Pass the graph name explicitly when a repository has more than one graph:

```bash
git warp info --repo ./team-repo --graph team
```

Also confirm that the command is pointed at the repository that owns the WARP
refs.

## See also

- [Operations](operations.md)
- [CLI](cli.md)
- [Sync](sync.md)
- [Content and CAS](content-and-cas.md)

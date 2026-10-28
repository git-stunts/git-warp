# Troubleshooting

Use this page when an observable v19 behavior is wrong and you need the next
bounded check.

## An Observation has no Readings

Run the same generated Observer with `--json` or `--jsonl` and inspect the
Observation Receipt:

```bash
git warp observe \
  --repo ./team-repo \
  --lane users \
  --observer users.exists \
  --reading '{"kind":"node.exists","subject":"user:alice"}' \
  --json
```

An empty accepted Observation is different from an obstructed Observation. The
Receipt records that distinction.

## A read or write is obstructed by the cone basis

Worldline Lane reads and read-before-write intents (`node.remove`,
`edge.remove`, content attach and clear) answer from the Lane's cone basis,
which folds each writer patch once. When a fold cannot proceed, the Observation
Receipt or Write Receipt reports it with a repair hint instead of reading
around it:

| Reason | Status | Meaning and next step |
| --- | --- | --- |
| `cone_shared_dot` | `obstructed` | A patch reuses a dot another element also claims (#1022). Repair the duplicate dot, then retry. |
| `cone_writer_diverged` | `obstructed` | A writer chain no longer extends the patches this clone folded. Delete this clone's `refs/warp/<lane>/cone/head` so it refolds from the writer chains, then retry. |
| `cone_contended` | `underdetermined` | Other folds kept moving the cone head. Retry. |

Write Receipts carry the same reasons under `git-warp.write.<reason>`. Blind
writes (`node.add`, `edge.add`, `property.set`, `entity.add`) need no read and
are not affected. `captureCoordinate()` rejects with `E_OPTIC_CONE_OBSTRUCTED`.

## A strand basis is unavailable

`E_OPTIC_NO_BOUNDED_BASIS` means a strand Lane could not prove the
checkpoint-tail basis its reads need. It is not a missing-value result.

Prepare the local materialization basis explicitly:

```bash
git warp repair \
  --repo ./team-repo \
  --lane users \
  --action materialization
```

Then retry the Observation. Use `git warp doctor --lane users` if repair fails.

## Fetched changes are missing

Normal branch fetches do not always include WARP refs. Receive other writers'
chains with the no-prune, unforced recipe in [Sync WARP refs](sync.md#receive-other-writers),
then reopen the Runtime and check the Lane:

```bash
git warp doctor --repo ./team-repo --lane users
git warp audit --repo ./team-repo --lane users
```

Do not fetch a whole `refs/warp/<lane>/*` wildcard: with `fetch.prune`
enabled it deletes this clone's unpublished writer chain.

If refs are present but the same bounded Observer still differs, preserve the
repository before attempting any repair.

## A Lane reports a missing substrate marker

`E_SUBSTRATE_MARKER_MISSING` means the Lane has WARP refs but no
`refs/warp/<lane>/substrate-version` marker, and its writer heads are current
patch commits or show no patch evidence. This usually means writer chains were
fetched without the marker. Receive them again with the recipe in
[Sync WARP refs](sync.md#receive-other-writers), which fetches the marker with
the chains and refuses a hub whose marker is missing or different. git-warp
does not create a marker over existing refs.

`E_SUBSTRATE_MIGRATION_REQUIRED` is different: a writer head is a v18 patch
commit, so run the one-shot
[v18-to-v19 migration](../migrations/v19/README.md#migrate-retained-v18-state-first).
`E_SUBSTRATE_VERSION_UNSUPPORTED` means a marker exists but is not the current
one.

## State differs across clones

Compare the same Lane, WARP refs, visible writers, and audit posture:

```bash
git warp doctor --repo ./clone-a --lane users
git warp doctor --repo ./clone-b --lane users
git warp audit --repo ./clone-a --lane users
git warp audit --repo ./clone-b --lane users
```

Do not rewrite authoritative writer refs as a diagnostic shortcut.

## A strand cannot reopen

`E_WARP_WORLDLINE_STRAND_COORDINATE_UNAVAILABLE` means the retained strand does
not contain the checkpoint needed to reconstruct its parent coordinate. Run the
one-shot v18-to-v19 migration for legacy repositories. Do not invent a
coordinate from current live state.

## A Settlement artifact is stale

`settle apply` derives a fresh Runtime-owned plan and compares it with the saved
review artifact. If the source or target moved, preview again and review the new
artifact. Never edit a plan digest to bypass revalidation.

## CAS content cannot be restored

Missing content bytes are a git-cas/storage problem, not an Observer problem.
Repair may remove invalid derived entries, but it cannot recreate missing
authoritative bytes. Preserve history and repair the storage boundary first.

## The CLI cannot find a Lane

Pass the Lane explicitly when a repository contains more than one:

```bash
git warp doctor --repo ./team-repo --lane users
```

Also confirm that `--repo` identifies the Git repository that owns the WARP
refs.

## See also

- [CLI](cli.md)
- [Strands](strands.md)
- [Git substrate](git-substrate.md)
- [Content and CAS](content-and-cas.md)

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

## A bounded basis is unavailable

`E_OPTIC_NO_BOUNDED_BASIS` means the Runtime could not prove the bounded basis
needed by the Observer. It is not a missing-value result.

Prepare the local materialization basis explicitly:

```bash
git warp repair \
  --repo ./team-repo \
  --lane users \
  --action materialization
```

Then retry the Observation. Use `git warp doctor --lane users` if repair fails.

## Fetched changes are missing

Normal branch fetches do not always include WARP refs. Fetch the repository's
WARP ref namespace explicitly, then reopen the Runtime:

```bash
git fetch origin 'refs/warp/team/*:refs/warp/team/*'
git warp doctor --repo ./team-repo --lane users
git warp audit --repo ./team-repo --lane users
```

If refs are present but the same bounded Observer still differs, preserve the
repository before attempting any repair.

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

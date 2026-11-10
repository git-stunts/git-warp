# Sync WARP refs

Use this page when Runtime history must travel between clones or machines
through a shared Git remote (a hub).

## The rule

Source branches and WARP history are separate ref families. Source code usually
lives under `refs/heads/*`; Runtime writer chains live under
`refs/warp/<lane>/writers/<writerId>`.

Each clone publishes only the writer chain it owns and receives other writers'
chains without pruning or forcing. Do not move a whole `refs/warp/<lane>/*`
wildcard in either direction:

- A wildcard fetch follows Git's prune policy. With `fetch.prune` or
  `remote.<name>.prune` enabled, it deletes local refs that the hub does not
  have yet, including this clone's unpublished writer chain.
- A wildcard push publishes refs this clone does not own, such as its derived
  checkpoint head.
- In-flight `Warp` state lives under `refs/warp-local/<graph>/`: write attempts in
  `write-attempts/` and support under construction in `observations/construction/`.
  Each of these refs names a reservation in this clone's ledger under `refs/cas/`, so
  it has meaning only beside that ledger. A `refs/warp/*` lane wildcard does not copy
  these refs. A copy of every ref, such as a mirror clone or a full backup, carries
  them together with the ledger, and a `Warp` that writes on that copy sweeps them
  as its own unfinished attempts. Do not copy `refs/warp-local/` refs into a clone that has
  its own ledger, for example with a `refs/*` fetch into an existing clone: the sweep
  of that clone would treat the attempts of another clone as its own.
- A clone that ran a pre-release build of `main` can hold in-flight refs at the old
  location under `refs/warp/<graph>/`, and a lane wildcard still copies those. See
  [Finish in-flight refs from pre-release builds](#finish-in-flight-refs-from-pre-release-builds).
- Never add `+` to a WARP refspec. A forced update can move another writer's
  chain backward.

## Finish in-flight refs from pre-release builds

Use this procedure only for a clone that ran a build of `main` from before the
`refs/warp-local/` layout ([#1078](https://github.com/git-stunts/git-warp/issues/1078)).
No release wrote the old location, so a clone that ran only released versions has
nothing to do.

Those builds saved each unfinished write attempt at
`refs/warp/<graph>/write-attempts/<attempt>` and support under construction at
`refs/warp/<graph>/observations/construction/<attempt>`. This build does not read
either location:

- The recovery sweep does not see an attempt record there.
- `warp.as(writer).reconcile(attempt)` returns `null` for it, although the record
  still exists. In this case `null` does not mean that the attempt was answered.
- No error names the ref. `E_WRITE_ATTEMPT_LAYOUT_UNSUPPORTED` is raised only for a
  record under `refs/warp-local/`.

List the refs:

```bash
git for-each-ref --format='%(refname)' refs/warp/ \
  | grep -E '/(write-attempts|observations/construction)/[0-9a-f]{32}$'
```

Do not use a glob such as `refs/warp/*/write-attempts/` in its place:
`git for-each-ref` matches nothing with it. No output from the listing means that
the clone holds no such ref.

> Warning: `git update-ref -d` on a `write-attempts` ref that you have not finished
> or moved abandons the answer of that attempt. This cannot be undone. The write may
> have published; a patch that it published stays on the chain of its writer. Its
> receipt is lost, and its reservation stays charged in the ledger, which is harmless
> at the current unlimited retention capacity. Delete such a ref only when you accept
> that loss.

For each `write-attempts` ref, finish the attempt before you delete anything. Use
one of these two ways:

- Run `reconcile` for the attempt with the build that wrote it.
- Move the ref to the new location. Run both commands in the repository that holds
  the graph, with your graph name in place of `todos` and the attempt id from the
  listing in place of the example id:

  ```bash
  git update-ref refs/warp-local/todos/write-attempts/0123456789abcdef0123456789abcdef \
    refs/warp/todos/write-attempts/0123456789abcdef0123456789abcdef
  git update-ref -d refs/warp/todos/write-attempts/0123456789abcdef0123456789abcdef
  ```

  The first command points the new ref at the same record. The second deletes only
  the old ref, which loses nothing, because the new ref now holds the record. Quote
  a ref whose graph name holds characters that your shell interprets. After the
  move, this build treats the attempt like any other unfinished attempt: a sweep
  resolves one that nobody holds a receipt for, and `reconcile` answers the writer
  that holds one. If the moved record
  has layout 1, `reconcile` rejects with `E_WRITE_ATTEMPT_LAYOUT_UNSUPPORTED`: only
  the build that wrote it can finish it. The error message prints the command that
  deletes that ref, and the warning above applies to it.

An old `observations/construction` ref holds only support that was under
construction. Recovery does not read it. Delete each one with
`git update-ref -d` and the ref from the listing.

To verify, run the listing again. It prints nothing when no old ref remains.

## Ownership and transport

Ownership says who may advance a ref. Transport says whether the ref travels
between clones. They are separate decisions.

| Ref under `refs/warp/<lane>/` | Owner | Transport |
| --- | --- | --- |
| `writers/<writerId>` | The one clone that writes as `<writerId>` | Owner pushes; everyone else fetches, fast-forward only |
| `substrate-version` | Shared, content-addressed marker | Pushed and fetched by name; identical on every clone |
| `checkpoints/head`, `coverage/head`, `allocation/*` | Each clone, derived locally | Never transferred; each clone rebuilds its own |
| `strands/<strand-id>/*` | The clone that created the strand | Clone-local; transfer rules are tracked in [#999](https://github.com/git-stunts/git-warp/issues/999) |
| `intents/*`, `audit/*`, `trust/records` | Writer or operator | Clone-local; transfer rules are tracked in [#999](https://github.com/git-stunts/git-warp/issues/999) |

A checkpoint head is replaced, not fast-forwarded, whenever its clone
checkpoints. Two clones' heads therefore never share a fast-forward history.
Transferring one would either fail as a non-fast-forward or need a forced
update. A receiver instead rebuilds its own checkpoint from the received writer
chains.

Saved Coordinates are values, not refs. Nothing is published or fetched for
them, so they cannot collide across clones. A Coordinate names its clone's
checkpoint, which the clone may replace, so treat a Coordinate as local to the
clone that captured it.

Git object support travels with the refs: fetching a writer chain transfers its
patch commits and every object they reference, including content attachments.
Configuring routine transfer for public attachments is tracked in
[#955](https://github.com/git-stunts/git-warp/issues/955).

## Publish this writer

Set `LANE` and `WRITER` to the Lane and to the writer identity this clone
writes as. Push only that chain and the Lane's substrate marker:

```bash
git push --atomic origin \
  "refs/warp/$LANE/writers/$WRITER:refs/warp/$LANE/writers/$WRITER" \
  "refs/warp/$LANE/substrate-version:refs/warp/$LANE/substrate-version"
```

Without `+`, Git accepts only a fast-forward. If another clone already published
a different chain under the same writer identity, the push is rejected and the
hub is unchanged. Give each clone its own writer identity. `--atomic` updates
both refs or neither, so a hub holding a different substrate marker never
receives this chain.

## Receive other writers

Check the hub's substrate marker, fetch every other writer's chain explicitly
without pruning, then rebuild this clone's checkpoint. Save the recipe as a
script and run it with `sh` so it stops at the first failure:

```bash
set -e
marker="refs/warp/$LANE/substrate-version"
hub_marker=$(git ls-remote origin "$marker" | cut -f1)
local_marker=$(git rev-parse -q --verify "$marker" || true)
if [ -z "$hub_marker" ] || { [ -n "$local_marker" ] && [ "$hub_marker" != "$local_marker" ]; }; then
  echo "The hub's substrate marker is missing or differs; migrate the hub first." >&2
  exit 1
fi
git fetch --no-prune --no-tags origin \
  "$marker:$marker" \
  "refs/warp/$LANE/writers/*:refs/warp/$LANE/writers/*" \
  "^refs/warp/$LANE/writers/$WRITER"
git warp repair --repo . --lane "$LANE" --writer "$WRITER" --action materialization
```

- The marker check runs before any ref changes. Git updates refs that point at
  blobs, such as the marker, without a fast-forward check even when the refspec
  has no `+`, so the recipe compares object IDs first. A hub with a missing or
  different marker is refused; migrate it before receiving from it. A fresh
  receiver adopts the hub's marker.
- `--no-prune` overrides `fetch.prune` and `remote.<name>.prune`, so refs the
  hub does not have yet stay unchanged.
- The `^` negative refspec (Git 2.29 or later) excludes this clone's own chain,
  which only this clone advances.
- Without `+`, a stale hub cannot move a newer local writer chain backward: Git
  rejects that update, leaves the local ref unchanged and exits non-zero.
- The repair step rebuilds this clone's checkpoint head from the received
  chains; no checkpoint travels between clones.

After receiving, close and reopen affected Runtime resources before observing.

## v19 boundary

v19 does not publish the former graph sync/serve commands or an embedded sync
server. Those capabilities are not compatibility aliases. Network sync must
earn a separately reviewed public boundary.

The supported transport today is Git's ref/object transfer, using the recipes
above.

## CBOR input limits

Treat received repository blobs as untrusted. The shared CBOR decoder checks
each blob before the general decoder interprets its contents:

| Limit | Maximum |
| --- | --- |
| Encoded blob | 5 MiB (5,242,880 bytes) |
| Nesting depth | 32, with the top-level value at depth zero |
| Total items, including container keys and tagged contents | 1,000,000 |
| Entries declared by one container | 1,000,000 |

Only tags 0 and 1 (dates), 2 and 3 (big integers), and 64 (`Uint8Array`)
are accepted over supported content encodings. Tag 1 accepts smaller integer
and floating epoch encodings. Eight-byte integer representations under tag 1
are refused before the full decoder; untagged eight-byte integers are unchanged.
These checks do not establish the semantic validity of every Date value. Other tags,
including regular expressions, sets, explicit maps, records, and shared
references, are refused before they can construct objects or cycles. Ordinary
untagged maps remain supported. Indefinite lengths and truncated values are
also refused.

The existing limits remain unchanged. The fixture measurements recorded in
[#1088](https://github.com/git-stunts/git-warp/issues/1088#issuecomment-6726313391)
reached 201,753 encoded bytes, depth 10, 11,268 total items, and 1,023 entries
in one container. These measurements describe that corpus, not every possible
repository. The tag-focused fixture check finds no new tag refusals in released
fixture blobs; it does not prove that every previously accepted blob still decodes.

A structural preflight refusal from the shared decoder has code
`E_CBOR_DECODE_BOUNDS` and a `reason` in its context. Index-shard readers that
request strict structure limits retain their `E_INDEX_SHARD_MALFORMED` preflight
error boundary. Preserve the offending object and
its identity when diagnosing a refusal; do not remove the checks to read it.
HTTP JSON body limits are separate from these repository-blob limits.

## Verify

Run bounded diagnostics against the same Lane on both clones:

```text
git warp doctor --repo ./clone-a --lane users
git warp doctor --repo ./clone-b --lane users
git warp audit --repo ./clone-a --lane users
git warp audit --repo ./clone-b --lane users
```

If a writer is missing, inspect the refspec first. If refs and objects match but
the same Observer differs, preserve both repositories and treat the result as a
Runtime defect.

## See also

- [Getting started](getting-started.md)
- [CLI](cli.md)
- [Git substrate](git-substrate.md)
- [Troubleshooting](troubleshooting.md)

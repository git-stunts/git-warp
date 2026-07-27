# Sync WARP refs

Use this page when Runtime history must travel between clones or machines.

## The rule

Source branches and WARP history are separate ref families. Source code usually
lives under `refs/heads/*`; Runtime writer chains live under
`refs/warp/<lane>/writers/<writerId>`.

Git remotes do not always transfer custom ref namespaces by default. Name the
WARP refspec explicitly:

```bash
git fetch origin 'refs/warp/team/*:refs/warp/team/*'
git push origin 'refs/warp/team/*:refs/warp/team/*'
```

For a team, encode the refspec in Git configuration or release tooling so
operators do not rely on memory.

## v19 boundary

v19 does not publish the former graph sync/serve commands or an embedded sync
server. Those capabilities are not compatibility aliases. Network sync must
earn a separately reviewed public boundary.

The supported transport today is Git's ref/object transfer. After fetching,
close and reopen affected Runtime resources before observing.

## Verify

Run bounded diagnostics against the same Lane on both clones:

```bash
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

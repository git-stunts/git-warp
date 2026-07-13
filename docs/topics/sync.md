# Sync WARP refs

Use this page when a graph needs to travel between clones, machines, or
processes.

## The rule

Source branches and graph history are separate ref families. Normal source code
lives under refs such as `refs/heads/main`; graph writer chains live under
`refs/warp/<graph>/writers/<writerId>`.

Git remotes do not always fetch or push custom ref namespaces by default. While
you are learning, name the WARP refspecs explicitly:

```bash
git fetch origin 'refs/warp/team/*:refs/warp/team/*'
git push origin 'refs/warp/team/*:refs/warp/team/*'
```

For a real team, encode those refspecs in Git config or release tooling so
operators do not rely on memory.

## Programmatic sync

The v19 package does not expose the former graph capability bag. There is no
supported programmatic sync surface yet. Use the CLI for operator workflows
instead of importing runtime internals. A future embedded sync API must earn an
explicit package boundary of its own.

## CLI sync

The CLI exposes the same operator posture:

```bash
git warp sync status --repo ./team-repo
git warp sync request --repo ./team-repo --json
git warp sync with http://127.0.0.1:3900/sync --repo ./team-repo --auth-secret "$WARP_SYNC_SECRET"
git warp serve --repo ./team-repo --port 3900 --auth-secret "$WARP_SYNC_SECRET"
```

Unauthenticated local serving is intentionally explicit:

```bash
git warp serve --repo ./team-repo --port 3900 --unsafe-allow-unauthenticated-localhost
```

Use that only for local experiments.

## Verify

After sync, inspect the visible writers and frontier:

```bash
git warp info --repo ./team-repo
git warp check --repo ./team-repo
git warp doctor --repo ./team-repo --strict
```

If a writer is missing, check the refspec first. If refs are present but replay
does not converge, move to provenance, audit receipts, or trust diagnostics.

## See also

- [Getting started](getting-started.md)
- [Querying](querying.md)
- [CLI](cli.md)
- [Git substrate](git-substrate.md)
- [Continuum boundary](continuum-boundary.md)

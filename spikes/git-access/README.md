# Git Access Backend Spike

This spike compares ways for git-cas to access immutable Git objects without
changing git-warp's public API or implementing a Git object database.

The candidate backends are:

- one stock Git process per operation;
- stock Git's batch and long-lived `cat-file` protocols;
- NodeGit/libgit2;
- `@napi-rs/simple-git`, a Node-API libgit2 binding;
- `isomorphic-git`, as a portable pure-JavaScript reference point.

Every measured backend must produce the same object identities, bytes, tree
entries, and ref targets. A fast backend with incompatible Git semantics is not
a viable git-cas backend.

Use Node 24, which was used for the retained profiles:

```sh
mise exec node@24.12.0 -- npm ci
mise exec node@24.12.0 -- npm run smoke
mise exec node@24.12.0 -- npm run profile
mise exec node@24.12.0 -- npm run profile:resources -- --quick
mise exec node@24.12.0 -- npm run semantics
```

The decisive page-shaped resource runs use explicit byte budgets:

```sh
mise exec node@24.12.0 -- npm run profile:resources -- \
  --scenario=blob-read \
  --backend=git-persistent-buffered \
  --operations=65536 \
  --payload-bytes=4096 \
  --batch-bytes=262144 \
  --heap-mb=64 \
  --samples=1
```

Increase `--operations` to `262144` for the 1 GiB bounded-memory scan. Use
`--scenario=blob-write` with the desired backend list for the corresponding
materialization-write profile. The semantic profile intentionally records
aggressive concurrent `gc --prune=now` as a failed capability; other failures
in required stock-Git behavior make the command fail.

Fixtures are disposable bare repositories created outside the timed workload.
No command operates on the git-warp repository's object database.

The resource profile runs each backend in an isolated worker under a bounded V8
old-space setting. It records operation wall time, aggregate process CPU, the
worker's maximum RSS, and a sampled sum of RSS across the worker and its Git
children. Large-corpus write validation happens after the timed region through
stock Git. The `--payload-profile` option distinguishes random-looking encrypted
or compressed chunks from compressible materialization pages.

The semantic profile checks checkpoint visibility, abort residue, concurrent
writers, active-reader repacking, atomic multi-ref compare-and-swap, SHA-256,
alternates, and packed refs. Unsupported behavior disqualifies a backend from
being git-cas's canonical Git implementation even when a microbenchmark is
fast.

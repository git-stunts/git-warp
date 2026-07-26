# V18 Medium Retained-Substrate Fixture

This is the repeatable sanity fixture between the 5 KiB golden boundary
witness and a multi-gigabyte real consumer store. Its Git bundle is about
2.2 MiB and contains 18 patches:

- `medium-alice` writes 16 nodes in 16 commits;
- every Alice node carries a unique deterministic 128 KiB binary attachment;
- `medium-bob` writes two independent review nodes in two commits;
- a public v18 query materializes both writers and publishes the blob-backed
  v18 state-cache ref plus its unadvertised payload tree.

The fixture contains no Think or other user data. It was generated in an
isolated temporary npm project through the published v18 public API with the
same exact registry lock as the small golden fixture:

- `@git-stunts/git-warp@18.2.1`;
- `@git-stunts/git-cas@6.0.0`;
- `@git-stunts/plumbing@3.0.3`.

`generate.mjs` creates the graph. Run it only from a disposable project that
has those exact packages installed and an empty `repository/` Git worktree.
The bundle includes both writer refs, the state-cache ref, and the payload root
named in the state-cache JSON:

```bash
git -C repository bundle create ../v18-medium-retained-substrate.bundle \
  refs/warp/v18-medium-retained-substrate/writers/medium-alice \
  refs/warp/v18-medium-retained-substrate/writers/medium-bob \
  refs/warp/v18-medium-retained-substrate/state-cache \
  4b719051011cae35c0df475d644464a4dff63656
```

The committed bundle SHA-256 is recorded in `manifest.json`. Fixture restore
must verify the bundle digest, exact ref heads and object types, writer counts,
state-cache schema, and payload-tree reachability before migration begins.

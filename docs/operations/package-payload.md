# npm Package Payload Contract

The npm artifact is a supported runtime distribution, not a repository
snapshot. A file appearing in a published tarball does not make its filesystem
path a supported JavaScript API, but every extra file still increases transfer,
extraction, inspection, and supply-chain surface.

This contract defines which path classes may cross the npm publication
boundary and how the release gate proves that the actual tarball obeys it.

## Baseline

At `e69c2f970`, after a clean publish build, this command:

```bash
npm pack --dry-run --ignore-scripts --json
```

reported:

- 2,351 files;
- 1,496,506 compressed bytes;
- 6,982,433 unpacked bytes;
- 252 compiled `dist/scripts/` files outside the supported v18-to-v19
  migrator;
- two compiled `dist/test/` fixture files; and
- 28 files under the undifferentiated `docs/` package path.

The export map prevented those internal paths from becoming supported imports,
but physical publication still exposed them. The package gate therefore checks
the artifact inventory independently of the export map.

## Allowlist

The package may contain only these path classes:

| Path class | Publication reason |
| --- | --- |
| `package.json` | npm metadata and the public export/bin maps |
| `README.md`, `CHANGELOG.md`, `LICENSE`, `NOTICE` | User orientation, compatibility history, and legal notices |
| `dist/{index,advanced,diagnostics,charts,testing}.{js,d.ts}` | Supported JavaScript and declaration entrypoints |
| `dist/src/**` | Transitive runtime implementation required by supported entrypoints |
| `dist/bin/**`, `bin/git-warp` | Supported `git-warp` executable implementation and launcher |
| `dist/scripts/v18-to-v19/**` | Supported `git-warp-v18-to-v19` migration executable |
| `scripts/hooks/post-merge.sh` | Runtime asset required by CLI hook installation and diagnostics |
| `scripts/{install-git-warp,uninstall-git-warp}.sh` | Existing explicit bootstrap and removal command surfaces |
| `docs/topics/**` | Curated public learning shelf linked from the README |
| `docs/operations/**` | Curated operator procedures linked from the README |
| `docs/migrations/v19/**` | Safety-critical guide for the supported migration executable |

Repository policy, tests, fixtures, plans, maintainer utilities, performance
drivers, generators, audit scripts, and release machinery do not belong in the
npm artifact. Maintainers use those files from the reviewed source checkout.

## Enforcement

The boundary has four independent witnesses:

1. `tsconfig.publish.json` names supported compile roots. TypeScript follows
   their imports and emits the required transitive implementation without
   compiling every repository script or test fixture.
2. `package.json#files` names the only source and build path classes npm may
   consider.
3. The package-payload gate inventories `npm pack --dry-run --json`, rejects
   every unrecognized path, and enforces reviewed ceilings for compressed
   bytes, unpacked bytes, and entry count.
4. The packed-artifact smoke installs the produced tarball into a clean
   external consumer and exercises every supported export, package metadata,
   CLI executable, migration executable, and private-subpath firewall.

The allowlist and ceilings are release law. A legitimate new public entrypoint,
runtime asset, migration, or documentation path must update this contract and
its executable policy in the same reviewed change. Raising a ceiling requires
an artifact inventory and rationale; it is not a routine version-bump edit.

## Interpretation

The export map remains the JavaScript API authority. The payload allowlist is a
physical publication boundary. Neither grants support to private filesystem
subpaths.

Passing a source-tree import test is insufficient. Passing `npm pack --dry-run`
without inspecting its inventory is also insufficient. Release eligibility
requires a policy-conforming inventory and successful behavior from the exact
packed artifact.

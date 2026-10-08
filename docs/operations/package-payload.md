# npm Package Payload Contract

The npm artifact is a supported runtime distribution, not a repository
snapshot. A file appearing in a published tarball does not make its filesystem
path a supported JavaScript API, but every extra file still increases transfer,
extraction, inspection, and supply-chain surface.

This contract defines which path classes may cross the npm publication
boundary and how the release gate proves that the actual tarball obeys it.

Public declarations carry their required standard-library dependencies. Runtime's emitted declaration preserves a narrow `esnext.disposable` reference so strict ES2022 consumers can import it without a broad ESNext override or `skipLibCheck`. The packed consumer check in `scripts/check-packed-disposable.sh` covers all five public entrypoints, explicit disposal typing and installed close/dispose lifecycle behavior in Docker.

## Baseline

At `e69c2f970`, after a clean publish build, this command:

```bash
npm pack --dry-run --ignore-scripts --json
```

reported:

- 2,351 files;
- 1,496,506 compressed bytes;
- 6,982,433 unpacked bytes;
- 252 compiled `dist/scripts/` files outside the v18-to-v19 directory, of
  which the packed-consumer proof later identified 20 as required migration
  support and 232 as unrelated maintainer code;
- two compiled `dist/test/` fixture files; and
- 28 files under the undifferentiated `docs/` package path.

The export map prevented those internal paths from becoming supported imports,
but physical publication still exposed them. The package gate therefore checks
the artifact inventory independently of the export map.

## Ceilings

Revalidated with Node 26.10.0 and npm 11.19.1 on 2026-09-29.
At `7b43e330c`, a clean publish build packed 1,679 files, 1,176,553
compressed bytes, and 4,798,907 unpacked bytes. Withholding the changelog and
the general documentation shelves removed 25 files and brought the artifact to
1,654 files, 951,677 compressed bytes, and 4,126,293 unpacked bytes.
Publishing the executable implementation as JavaScript only then removed the
80 declarations under `dist/bin/` and `dist/scripts/`, leaving 1,574 files,
933,202 compressed bytes, and 4,038,202 unpacked bytes. `npm pack --dry-run`
and the generated tarball report identical inventories.
The documentation-only inventory is from `878652ba`; the executable-declaration inventory is
from `1b24b3f0`. Direct tarball inspection independently confirmed every file
path and byte size, as well as the compressed archive size. Across both stages,
the only removed paths were the 25 documentation files and 80 executable
implementation declarations; no JavaScript or supported shell asset was removed.

For each of those three clean builds, a TypeScript program rooted at all five
public declaration entrypoints loaded the same 161 package declarations under
both NodeNext and Bundler resolution, with `skipLibCheck: false` and zero
diagnostics. None resolved under `dist/bin/` or `dist/scripts/`. The final
isolated packed-consumer smoke also passed with both resolution modes.

The second audit removed seven unused direct production dependencies and 581
additional private declarations (894,575 bytes). The clean build now prunes
`.d.ts` outputs against the compiler-verified closure of all five public type
entrypoints, retaining 161 declarations. Compiler errors abort pruning before
any file is removed. JavaScript and supported assets remain unchanged.
The resulting artifact contains 993 files, 716,164 compressed bytes, and
3,143,572 unpacked bytes.

| Ceiling          | Value     | Headroom over the measured artifact |
| ---------------- | --------- | ----------------------------------- |
| Compressed bytes | 760,000   | 43,836 bytes (6.1%)                 |
| Unpacked bytes   | 3,300,000 | 156,428 bytes (5.0%)                |
| Entries          | 1,050     | 57 entries (5.7%)                   |

## Allowlist

The package may contain only these path classes:

| Path class                                                                   | Publication reason                                                  |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `package.json`                                                               | npm metadata and the public export/bin maps                         |
| `README.md`, `LICENSE`, `NOTICE`                                             | User orientation and legal notices                                  |
| `dist/{index,advanced,diagnostics,charts,testing}.{js,d.ts}`                 | Supported JavaScript and declaration entrypoints                    |
| `dist/src/**`                                                                | Emitted runtime modules and the public declaration dependency closure |
| `dist/bin/**/*.js`, `bin/git-warp`                                           | Supported `git-warp` executable implementation and launcher         |
| `dist/scripts/v18-to-v19/*.js`, `dist/scripts/v18-to-v19/adapters/**/*.js`   | Supported `git-warp-v18-to-v19` migration executable               |
| `dist/scripts/upgrade-v16-to-v17.js`                                         | Supported legacy `npm run upgrade` operator command                 |
| `dist/scripts/migrations/v17.0.0/**/*.js`, `dist/scripts/formatFailure.js`   | Private implementation required by supported migration commands     |
| `scripts/hooks/post-merge.sh`                                                | Runtime asset required by CLI hook installation and diagnostics     |
| `scripts/{install-git-warp,uninstall-git-warp}.sh`                           | Existing explicit bootstrap and removal command surfaces            |
| `docs/migrations/v19/README.md`                                              | Safety-critical guide for the supported migration executable        |
| `docs/READINGS_AND_OPTICS.md`                                                | Runtime guidance named by public reading-basis errors               |

Repository policy, tests, fixtures, plans, maintainer utilities, performance
drivers, generators, audit scripts, and release machinery do not belong in the
npm artifact. Maintainers use those files from the reviewed source checkout.

## Withheld documentation

`CHANGELOG.md`, `docs/topics/**`, and `docs/operations/**` stay in the
repository but are not published to npm. They are release history and general
learning or operator shelves, not assets a supported command reads. The policy
rejects them explicitly, so they cannot return merely because other payload
shrank.

The retained packaged documents (`README.md`, `docs/migrations/v19/README.md`,
and `docs/READINGS_AND_OPTICS.md`) must not link package-relative into any
path the artifact does not contain. Links to withheld documentation use a
release-tagged or commit-pinned repository URL. A unit test checks the source
documents and the packed-artifact smoke checks the installed copies.

## JavaScript-only executable implementation

`dist/bin/` and `dist/scripts/` hold executable implementation. The five
public declaration entrypoints and everything they import live under
`dist/{index,advanced,diagnostics,charts,testing}.d.ts` and `dist/src/`; no
public declaration imports a declaration under `dist/bin/` or `dist/scripts/`.
The package therefore publishes only `.js` files from those two directories,
and the policy rejects any other file type there. A declaration that becomes
reachable from a public entrypoint must move under `dist/src/` or change this
contract in the same reviewed change; the packed-artifact type check fails
before release if it does not.

## Enforcement

The boundary has four independent witnesses:

1. `tsconfig.publish.json` compiles supported package entrypoints and their
   transitive implementation. The publish build then prunes declarations outside
   the five public type roots using `PrunePrivateDeclarations.ts`, then prunes
   unreachable emitted JavaScript using `@vercel/nft` through
   `PrunePrivateJavaScript.ts`. The packed
   inventory test rejects declarations outside that closure. `tsconfig.maintainer.json` extends that build
   graph for performance and operator programs without publishing them.
2. `package.json#files` names the only source and build path classes npm may
   consider.
3. The package-payload gate inventories both `npm pack --dry-run --json` and
   the tarball produced for the external smoke. It rejects every unrecognized
   path and enforces reviewed ceilings for compressed bytes, unpacked bytes,
   and entry count in both modes.
4. The packed-artifact smoke installs that policy-conforming tarball into a
   clean external consumer outside the checkout and exercises every supported
   export, package metadata, CLI executable, migration executable, and
   private-subpath firewall. It type-checks all five public type surfaces
   against the installed declarations with `skipLibCheck: false`, resolves
   every relative import in the shipped JavaScript inside the artifact,
   installs the post-merge hook from the shipped template, runs the migration
   commands' discovery against a disposable repository, and checks that
   shipped documents link package-relative only to shipped files.

npm 10 may prefix `--json` output with `prepare` output even when the nested
pack requests `--ignore-scripts`. The inventory adapter therefore accepts a
schema-valid JSON array only when it is the terminal stdout frame. Arbitrary
prefix text may describe that npm lifecycle defect; malformed JSON or any
non-whitespace suffix still fails closed.

The allowlist and ceilings are release law. A legitimate new public entrypoint,
runtime asset, migration, or documentation path must update this contract and
its executable policy in the same reviewed change. Raising a ceiling requires
an artifact inventory and rationale; it is not a routine version-bump edit.

## Runtime file tracing

The publish build retains `tsc` output byte-for-byte and uses `@vercel/nft`
only to select whole JavaScript files under `dist/`. Runtime roots come from
manifest export `import`/`default` conditions and published executables. The
`bin/git-warp` launcher maps explicitly to `dist/bin/git-warp.js`; its checkout
TypeScript fallback is not a published runtime. The supported legacy upgrade
command is an additional explicit root. Unrecognized export shapes or launcher
paths fail validation rather than silently disappearing from the root set.

NFT traces literal dynamic imports and filesystem references. Trace warnings,
missing roots, and computed dynamic imports block pruning before deletion.
The computed-import guard is shared with the advisory analyzer; the analyzer's
literal-reference traversal does not decide what gets deleted. Dependencies
under `node_modules` stay external. Declarations, retained documentation, and
shell assets have independent publication contracts and are never deleted by
the JavaScript pruner. A new loading mechanism or export condition requires
explicit review and packed-consumer evidence before this contract expands.

The adoption experiment for [#908](https://github.com/git-stunts/git-warp/issues/908)
matched the separately audited 77-file set exactly, without an exclusion list.
Every retained JavaScript file was byte-identical to the pre-pruning tarball.
Same-environment measurements (including the updated package metadata) were:

| Metric | Before | NFT-pruned artifact |
| --- | ---: | ---: |
| Compressed bytes | 716,164 | 703,771 |
| Unpacked bytes | 3,143,572 | 3,101,860 |
| Entries | 993 | 916 |

Compression can vary across npm/runtime environments. The isolated packed
consumer passed public imports, strict declarations, CLI and migration behavior,
private-subpath restrictions, and hook installation. Unit fixtures additionally
check both platform-dependent import branches, filesystem-loaded JavaScript,
lazy imports, refusal on uncertainty, and byte preservation. No bundling,
minification, source deletion, or public API removal is involved. Rollup remains
a separate potential experiment.

## Release Preflight bundle report

The PR workflow packs and extracts an actual npm tarball after the build. Its
bot comment and job summary show compressed bytes, unpacked bytes, file count,
the matching policy limits, percentage used, remaining capacity, payload
composition, and the ten largest files. Usage of at least 85% warns that a limit
is approaching; at least 95% is critical headroom. Exceeding a limit still fails
the existing payload gate.

Static traversal starts from public runtime/type exports, published JavaScript
executables, the compiled CLI, and the supported legacy upgrade command. It
reports possibly unnecessary JavaScript, unreachable declarations, missing or
dev-only imports, unused direct dependencies, and local/VCS/URL, wildcard, or
mutable-tag dependency requirements. Declared peer and optional dependencies
are recognized. Literal dynamic imports and declaration imports using `.ts`
or `.js` specifiers are traversed; computed imports are explicitly flagged.
These are advisory inspection findings, not proof that deleting a file is safe
or a replacement for the vulnerability audit and packed-consumer smoke.

One marked bot comment is updated on each same-repository PR run. It reports
actual gate outcomes and still runs after failures; unavailable analysis is
identified explicitly rather than reported as a pass. Fork runs retain the job
summary and evidence without requiring a write-capable pull-request token.
The `npm-bundle-analysis` workflow artifact retains the tarball, complete npm
inventory, Markdown report, and full finding list for 14 days. Comments cap
findings and file listings to stay readable; full evidence remains attached.

## Interpretation

The export map remains the JavaScript API authority. The payload allowlist is a
physical publication boundary. Neither grants support to private filesystem
subpaths.

Passing a source-tree import test is insufficient. Passing `npm pack --dry-run`
without inspecting its inventory is also insufficient. Release eligibility
requires a policy-conforming inventory and successful behavior from the exact
packed artifact.

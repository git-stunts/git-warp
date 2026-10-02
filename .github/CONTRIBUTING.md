# Contributing to @git-stunts/git-warp

## Planning sources of truth

- GitHub Issues are the live work tracker, triage surface, and release-gate
  input.
- GitHub Milestones own release targeting.
- `CHANGELOG.md` records externally meaningful changes.
- Current public docs live in `README.md`, `ARCHITECTURE.md`, `CHANGELOG.md`,
  `docs/topics/`, and `docs/operations/`.
- Release process instructions live in `.github/RELEASE.md`; repo-specific
  release facts live in `.continuum/release.yml`.

Historical design notes, retrospectives, archived backlog files, and deleted
planning packets remain available through Git history. Do not recreate archive,
design, or retro directories as live documentation.

## Issue triage

Labels are query indexes, not prose decoration. Keep issue metadata boring and
orthogonal.

Every open issue should carry one label from each axis:

| Axis | Values |
| --- | --- |
| Type | `type:bug`, `type:debt`, `type:feature`, `type:docs`, `type:release`, `type:goalpost`, `type:story`, `type:maintenance` |
| Priority | `priority:asap`, `priority:next`, `priority:later` |
| Status | `status:available`, `status:blocked`, `status:active` |
| Area | `area:api`, `area:runtime`, `area:storage`, `area:query`, `area:sync`, `area:docs`, `area:testing`, `area:tooling`, `area:release`, `area:architecture` |

Use GitHub Milestones for release targeting. Do not create release labels for
new work.

## Documentation changes

Use the topic shelf for current docs:

- `docs/topics/getting-started.md`
- `docs/topics/optic-reads.md`
- `docs/topics/observers.md`
- `docs/topics/querying.md`
- `docs/topics/strands.md`
- `docs/topics/git-substrate.md`
- `docs/topics/content-and-cas.md`
- `docs/topics/continuum-boundary.md`
- `docs/topics/sync.md`
- `docs/topics/cli.md`
- `docs/topics/troubleshooting.md`

Use `docs/operations/README.md` for operator workflows over a live
`git-warp` repository. Use `.github/RELEASE.md` and
`.continuum/release.yml` for maintainer release procedure and repo-specific
release mechanics. Do not put contributor runbooks in the topic shelf.

Exact API, CLI, schema, and error inventories should be generated or
coverage-checked instead of hand-maintained as prose.

## Getting started

```bash
git clone git@github.com:git-stunts/git-warp.git
cd git-warp
npm install
npm run test:local
```

## Test isolation

All tests and benchmarks run inside Docker. `npm test` and the test/benchmark
scripts build a COPY-based image and execute there, without mounting the host
checkout or its Git directory. Direct Vitest, BATS, and Deno runs fail on the
host before their test bodies execute. An exported environment flag or GitHub
Actions environment is not a substitute for container isolation.

For a targeted run:

```bash
bash scripts/run-in-docker.sh npx --no-install vitest run test/unit/domain/services/SyncSecret.test.ts
```

`npm run test:watch -- <filters>` runs Vitest watch in a copied service and
uses [Compose Watch](https://docs.docker.com/compose/how-tos/file-watch/) to
synchronize edits. Compose must support `develop.watch.initial_sync`. Host Git
metadata, dependencies and generated reports are excluded from synchronization.
Exiting the test client, interrupting it, or losing synchronization cleans up
the service. Before teardown, watch mode exports external snapshots under
`test/**/__snapshots__/` and inline updates in existing test modules. It applies
changes only when the host still matches the captured baseline. Conflicting
updates are retained under `.ratchet/docker-results/` and produce a nonzero exit;
other test fixtures and new or deleted test modules are never exported.

Coverage commands export `coverage/` before container cleanup. Only
`npm run test:coverage` may apply updated thresholds to `vitest.config.ts`, and
only after a successful run with the host configuration unchanged. A conflict
or failed run preserves the candidate under `.ratchet/docker-results/`.
`npm run ratchet:snapshot` exports its selected relative output root and uses
copied source refs to retain the original branch, commit and merge base;
WARP data refs and host Git configuration are excluded.

For other generated evidence, declare exports before the command with
`--export-directory <relative-path>` or `--export-file <relative-path>` and a
`--` separator. Export targets must be untracked and free of symlinks; tracked
source files and Git metadata are protected. Failed commands still export their
evidence and retain their exit status.

Manual `performance:*` measurements export their selected relative report paths
and retain the measured source Git identity. Nonsecret corpus/run settings are
forwarded into the container. Comparisons require two clean source checkouts;
both revisions and their Git identities are copied into one image, so a sibling
worktree is usable without a mount. Comparison reports and gate summaries are
exported on failures as well. Output targets must be untracked, inside the
invoking checkout, and free of symlinks.

## Useful checks

```bash
npm run lint
npm run typecheck
npm run test:local
```

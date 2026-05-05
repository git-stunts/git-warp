---
id: SPEC_v17-release-self-review-blockers
blocked_by: []
blocks: []
feature: tooling-release
release_home: v17.0.0
---

# SPEC_v17-release-self-review-blockers

## Problem

A strict self-review of `release/v17.0.0` at `5a1f8cc75b71` found
release-blocking contract drift. The review was run from a clean worktree,
after `git fetch origin`, against `origin/main`.

The branch diff was large enough to make normal review mechanics weaker:

- `git diff --stat --compact-summary origin/main...HEAD`
- `2698 files changed, 268935 insertions(+), 205087 deletions(-)`
- Git warned that exhaustive rename detection was skipped.

## Severity Snapshot

| Severity | Count |
|----------|------:|
| P0 Critical | 5 |
| P1 Major | 2 |
| P2 Process Risk | 2 |
| P3 Minor | 1 |

## Gate Evidence

| Gate | Result |
|------|--------|
| `git diff --check origin/main...HEAD` | Passed, with rename-detection warning only. |
| `npm run lint:semgrep` | Passed with `761` quarantined hits suppressed. |
| `npm run test:local` | Failed: `68` tests failed across `70` failed suites. |
| `npm run lint:quarantine-graduate` | Failed: `139` touched quarantined files. |

## Findings

### P0: Unit Suite Is Red

`npm run test:local` reported `6762` total tests, `6694` passed tests,
and `68` failed tests. The failures span materialization, checkpoints,
observers, controller seams, adapters, and release-hygiene scripts.

Representative evidence:

- `test/unit/domain/WarpGraph.autoCheckpoint.test.ts:214` expects
  `state.nodeAlive.entries.keys()`.
- `test/unit/domain/WarpGraph.lazyMaterialize.test.ts:169` expects the
  public `materialize()` spy to be called during auto-materialize.
- `test/unit/domain/services/CheckpointService.test.ts:409` rejects
  schema `5` while the test expects schema `5` to load.
- `test/unit/domain/services/Observer.test.ts` has `16` failed tests.

Recommended mitigation prompt:

> Run `npm run test:local -- --reporter=verbose`, group failures by root
> cause, fix production code or stale tests until the full unit suite is
> green. Do not mark pre-existing failures as acceptable for this release
> branch.

### P0: Public Materialization Contract Is Half Migrated

Production advertises immutable public snapshots:

- `src/domain/capabilities/MaterializeCapability.ts:43` returns
  `SnapshotWarpState` or `{ state: SnapshotWarpState, receipts }`.
- `src/domain/RuntimeHost.ts:382` implements snapshot-returning overloads.
- `src/domain/services/snapshot/SnapshotORSet.ts:94` exposes
  `entries()` as a method returning frozen entry objects.

Tests and docs still treat `materialize()` as returning mutable internal
`WarpState`:

- `test/unit/domain/WarpGraph.autoCheckpoint.test.ts:214`
- `test/unit/domain/WarpGraph.seek.test.ts:188`
- `docs/migrations/v17.0.0.md:181`
- `docs/API_REFERENCE.md:441`

Recommended mitigation prompt:

> Decide the public v17 contract: either restore a compatible `WarpState`-
> like public shape or fully migrate tests and docs to `SnapshotWarpState`.
> If snapshots are final, update all callers to use `nodeAlive.elements()`,
> `nodeAlive.entries()`, and snapshot-safe APIs, then add conformance coverage
> proving the old mutable Map shape is intentionally gone.

### P0: Internal Auto-Materialization Seam Drifted

Controllers now call private `_materializeGraph()` directly:

- `src/domain/services/controllers/PatchController.ts:153`
- `src/domain/services/controllers/PatchController.ts:372`
- `src/domain/services/controllers/CheckpointController.ts:163`
- `src/domain/services/controllers/SyncController.ts:335`
- `src/domain/services/controllers/SubscriptionController.ts:180`

Tests and fakes still spy on or implement the public `materialize()` shape:

- `test/unit/domain/services/controllers/PatchController.test.ts:257`
- `test/unit/domain/services/controllers/CheckpointController.test.ts:239`
- `test/unit/domain/services/controllers/SubscriptionController.test.ts:419`
- `test/unit/domain/WarpGraph.errorCodes.test.ts:304`

Recommended mitigation prompt:

> Introduce or normalize one explicit materialization host port for internal
> controllers, update all host fixtures to implement it, and stop tests from
> spying on the public snapshot-returning `materialize()` when they are
> asserting internal cache refresh. Preserve public `materialize()` only as the
> consumer API.

### P0: Checkpoint Schema Story Is Contradictory

Source currently creates schema `2` or `4`, not schema `5`:

- `src/domain/services/state/checkpointCreate.ts:205`
- `src/domain/services/state/checkpointCreate.ts:211`
- `src/domain/services/state/checkpointHelpers.ts:38`
- `src/domain/services/state/checkpointLoad.ts:82`

Tests demand incompatible things:

- `test/unit/domain/services/CheckpointService.test.ts:165` expects a
  schema `5` envelope tree.
- `test/unit/domain/services/CheckpointService.test.ts:204` expects
  `decoded.schema` to be `5`.
- `test/unit/domain/services/CheckpointService.test.ts:367` expects schema
  `5` envelope loading to work.
- `test/unit/domain/services/CheckpointService.edgeCases.test.ts:70`
  expects schema `2` to reject.

Recommended mitigation prompt:

> Define the v17 shipped checkpoint schema in one place. If schema `5`
> envelope is intended, implement create/load support and migrate constants,
> tests, and docs. If schema `2` or `4` is intended, remove schema `5` tests
> and docs. Add a single compatibility matrix test covering accepted and
> rejected schemas.

### P0: Quarantine Graduation Gate Is Red

`npm run lint:quarantine-graduate` failed with `139` touched quarantined
files. The policy is binding:

- `docs/ANTI_SLUDGE_POLICY.md:366` defines quarantine manifests.
- `docs/ANTI_SLUDGE_POLICY.md:381` says touched quarantined files must
  graduate or narrow.
- `package.json:75` wires the check.

Representative offenders:

- `policy/quarantines/0025A-casts.json:12` lists `src/domain/WarpGraph.ts`.
- `policy/quarantines/0025B-boundary.json:17` lists `src/domain/WarpGraph.ts`.
- `policy/quarantines/0025C-fake-models.json:14` lists
  `src/domain/services/JoinReducerSession.ts`.
- `policy/quarantines/0025D-import-law.json:13` lists
  `src/domain/services/codec/AnchorMessageCodec.ts`.

Recommended mitigation prompt:

> For each touched quarantined file, either graduate the rule-family violation
> and regenerate contamination manifests, or replace file-level quarantine with
> narrow inline suppressions referencing the owning cycle. Start with files
> touched by this release slice, not blanket manifest churn.

### P1: Release Docs Still Describe the Old Materialization API

The migration guide and API reference tell users to expect `WarpState` and
`Map` internals while type-level conformance expects `SnapshotWarpState`:

- `docs/migrations/v17.0.0.md:181`
- `docs/API_REFERENCE.md:443`
- `test/conformance/snapshotPublicApiSurface.test.ts:20`

Recommended mitigation prompt:

> Rewrite materialization docs to name `SnapshotWarpState`, show the new
> snapshot read APIs, and explicitly document the v16-to-v17 migration from
> mutable ORSet maps to immutable snapshot methods.

### P1: Source-Only Package Runtime Contract Needs a Published-Artifact Gate

The package intentionally ships TypeScript source directly, but the current
release gates do not prove that the published npm artifact and CLI work on the
minimum supported Node line:

- `package.json:16` declares `"node": ">=22.0.0"`.
- `package.json:20` points `main` at `./index.ts`.
- `package.json:21` points `types` at `./index.ts`.
- `package.json:23` points the `warp-graph` bin at `./bin/warp-graph.ts`.
- `package.json:70` and nearby scripts execute `.ts` files via plain `node`.
- `CHANGELOG.md:12` says the repo ships TypeScript source directly via JSR and
  `--experimental-strip-types`.
- `scripts/release-preflight.sh:102` only runs `npm pack --dry-run`; it does
  not install the packed tarball and execute package import or bin smoke tests.

Local `node bin/warp-graph.ts --help` passed on Node `v25.9.0`, so this is not
recorded as proof that binaries are dead. The release risk is narrower: the
source-only distribution contract is not validated against the declared Node
`>=22.0.0` floor or the actual packed npm artifact.

Recommended mitigation prompt:

> Add a published-artifact smoke gate: `npm pack`, install the tarball in a
> clean fixture, import `@git-stunts/git-warp`, and run both `warp-graph --help`
> and `git-warp --help` under the minimum supported Node 22 image. If the
> package is intentionally TypeScript-source-only, document the exact runtime
> and module-resolution requirements in README, getting started, and the v17
> migration guide.

### P2: Diff Size Defeats Normal Review Mechanics

`git diff --stat --compact-summary origin/main...HEAD` warned that exhaustive
rename detection was skipped and suggested raising `diff.renameLimit` to at
least `1624`. The branch changes `2698` paths.

Recommended mitigation prompt:

> Produce a reviewer map for this release branch: group changed paths by
> subsystem, list intentional large deletions and moves, and run targeted
> validation for each subsystem. If this is not already a release aggregation
> branch, split future PRs by migration slice.

### P2: Seek Tick Parser Accepts Junk-Suffixed Numbers

`bin/cli/commands/seek.ts:49` resolves absolute and relative ticks with
`parseInt(...)`. That accepts inputs such as `10junk` as `10` and `+2x` as
`2`, then passes the existing `Number.isInteger(...)` checks:

- `bin/cli/commands/seek.ts:51`
- `bin/cli/commands/seek.ts:63`

Recommended mitigation prompt:

> Replace `parseInt` in `resolveTickValue` with strict integer parsing. Accept
> only `^[0-9]+$` for absolute ticks and `^[+-][0-9]+$` for relative deltas;
> add CLI tests for `10abc`, `+2x`, `-1x`, empty strings, and valid absolute
> and relative values.

### P3: Changelog Claims the Wrong Remaining Config Extensions

`CHANGELOG.md:12` says no `.js` files remain except `eslint.config.js` and
`vitest.config.js`, but the repo contains `eslint.config.ts` and
`vitest.config.ts`.

Recommended mitigation prompt:

> Update the changelog to say the remaining config files are TypeScript, or
> remove the exception clause entirely if no `.js` config files remain.

## De-Dupe Notes

Gemini findings not copied as new findings:

- Missing v17 migration guide: false positive. `docs/migrations/v17.0.0.md`
  exists, though it has contract drift already covered above.
- Seek cache race: false positive. `bin/cli/shared.ts:224` defines
  `wireSeekCache(...)` as synchronous and it only calls `graph.setSeekCache`.
- Monorepo hybrid slop: already tracked by the package-extraction backlog,
  including `INFRA_multipackage-publish-pipeline` and the post-publish
  workspace extraction items.
- Direct TypeScript distribution and CLI shebangs: folded into the narrower
  source-only package runtime-contract finding above rather than repeated as
  unverified breakage.

## Acceptance Criteria

- `npm run test:local` is green.
- `npm run lint:quarantine-graduate` is green.
- Public materialization tests, docs, and type conformance all describe the
  same return contract.
- Internal controller auto-materialization tests assert the private host seam
  through an explicit port, not through public snapshot API spies.
- Checkpoint schema create/load tests share one compatibility matrix.
- Published-artifact smoke tests prove package imports and bins on the minimum
  supported Node line, or docs explicitly narrow the runtime contract.
- `seek --tick` rejects junk-suffixed numbers.
- The changelog no longer names stale `.js` config files.
- The release branch has a reviewer map or equivalent subsystem audit note.

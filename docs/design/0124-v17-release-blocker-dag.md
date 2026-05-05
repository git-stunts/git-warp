# 0124 V17 Release Blocker DAG

- Status: `inventory complete`
- Date: 2026-05-04
- Release lane: `v17.0.0`
- CSV matrix: [0124-v17-release-blocker-matrix.csv](0124-v17-release-blocker-matrix.csv)
- Status table: [0124-v17-release-blocker-status.csv](0124-v17-release-blocker-status.csv)
- Graphviz source: [0124-v17-release-blocker-dag.dot](0124-v17-release-blocker-dag.dot)
- SVG graph: [0124-v17-release-blocker-dag.svg](0124-v17-release-blocker-dag.svg)

## Hill

Name the remaining direct tasks that block an honest v17 release, record
their blocking relationships as a matrix, and render the same dependency
model as a Graphviz DAG.

This is a release-blocker map, not a dump of every historical
`docs/method/backlog/v17.0.0/` file. Items marked post-publish, v17.1,
v17.2, or later-major substrate work are excluded unless they currently
block the v17 package from being honest, secure, or releasable.

## Sources

- `docs/design/0122-v17-branch-safety-checkpoint.md`
- `docs/design/0123-v17-release-scope-and-bounded-query-blocker.md`
- `docs/design/0110-graph-query-bounded-read-model-provider.md`
- `docs/audit/2026-05-04_code-quality.md`
- `docs/audit/2026-05-04_documentation-quality.md`
- `docs/audit/2026-05-04_ship-readiness.md`
- `docs/method/release.md`
- `docs/method/backlog/bad-code/RELEASE_TRIAGE.md`
- Current checks run during this inventory:
  - `npm run typecheck:consumer`: FAIL at
    `test/type-check/consumer.ts(318,64)`.
  - `npm run lint:quarantine-graduate`: FAIL with `138`
    quarantined touched files.

## Matrix Semantics

The CSV matrix uses this orientation:

```text
row task is blocked by column task => X
```

The DOT and SVG use the opposite visual direction:

```text
blocker -> blocked task
```

The relationships are direct dependency edges, not the full transitive
closure. A blank cell means "not directly blocked by that task," not
"unrelated forever."

## Included Tasks

`SPEC_consumer-typecheck-materialize-residue`
: Closed in cycle 0125. This originally tracked
  `npm run typecheck:consumer` failing because the consumer type contract
  still expected removed public materialization.

`SPEC_docs-materialize-frontdoor-drift`
: Closed in cycle 0126. This originally tracked README, Getting
  Started, Guide, and API docs teaching `graph.materialize` as the public
  read path even though v17 removed that public frontdoor.

`SPEC_runtime-error-reading-basis-guidance`
: Closed in cycle 0127. This originally tracked `QueryStateMessages.ts`,
  `RuntimeHost.ts`, and `ProvenanceController.ts` telling users to
  "Call materialize" instead of linking to readings/optics guidance.

`BND_checkpoint-schema-contract-drift`
: Closed in cycle 0128. v17 runtime checkpoint support now has one
  version truth: schema `5` loads the envelope-tree shape, while legacy
  schemas `2`, `3`, and `4` reject with migration guidance.

`PORT_patch-controller-reading-basis`
: Closed in cycle 0130. Patch creation no longer uses hidden
  materialization when a parent exists without cached state, and patch
  freshness checks now require a clean cached reading basis.

`PORT_checkpoint-controller-reading-basis`
: Closed in cycle 0129. Checkpoint creation now uses an exact
  snapshot-cache reading or a clean cached state reading basis, fails
  closed with v17 readings guidance when no basis exists, and the
  controller host contract no longer names `_materializeGraph()`.

`PORT_subscription-controller-reading-basis`
: Closed in cycle 0132. `SubscriptionController` no longer calls
  `_materializeGraph()` from watch polling; poll-detected frontier
  changes report stale reading-basis guidance, and clean local patch
  diffs notify subscribers without another materialization call.

`PORT_sync-controller-reading-basis`
: Closed in cycle 0133. Default `syncWith()` no longer calls
  `_materializeGraph()` to create cached state before apply. No-cache
  default sync returns metadata only; callers must opt into
  `materialize: true` to create a reading basis and return state.

`SPEC_materialize-spy-test-clusters`
: Closed in cycle 0134. Former auto-materialize and materialize-spy
  tests now assert v17 reading-basis behavior instead of hidden replay,
  private materialization call counts, or private cache shape.

`SPEC_observer-coordinate-pinning`
: Closed in cycle 0135. Default `graph.observer()` now snapshots the
  caller's fresh reading basis, exposes a string state hash, and stays
  pinned after live truth advances.

`SPEC_checkpoint-materialize-test-drift`
: Closed in cycle 0136. The remaining checkpoint/materialize unit drift
  now either uses current schema `5` fixtures or asserts explicit
  retired-schema upgrade rejection. `npm run test:local` is green.

`SPEC_uniform-git-cas-upgrade-contract-drift`
: Closed in cycle 0131. The package upgrade command now builds and runs
  the migration entrypoint from `dist/`, retired checkpoint conversion has
  behavioral coverage, and the stale source-text witness was updated to the
  shipped command shape.

`HEX_sync-secret-plain-string`
: Closed in cycle 0137. Sync HMAC secrets now flow through an opaque
  `SyncSecret` value across public sync auth options, domain auth
  service keys, and HTTP sync transport. String, JSON, and inspect
  rendering redact the secret.

`HEX_sync-production-auth-defaults`
: The sync server can be configured without auth. Non-local bind hosts must
  require enforced auth, and local unauthenticated mode must be explicitly
  unsafe.

`HEX_sync-no-rate-limiting`
: Authenticated clients can flood sync. Rate limiting depends on stable
  production auth/key identity.

`HEX_sync-500-sanitization`
: HTTP 500 responses can expose internal exception messages. This depends
  on the production auth/defaults shape so the response layer is hardened
  once.

`REL_quarantine-graduate-clean`
: `npm run lint:quarantine-graduate` currently fails with 138 touched
  quarantined files. Run this near the end of source churn so graduation
  work does not chase moving files.

`REL_full-gate-matrix-green`
: Release cannot proceed until the gate matrix is green:
  lint, typecheck, consumer typecheck, test:local, markdown lint, markdown
  code samples, npm audit, quarantine graduation, and focused witnesses.

`REL_release-cut-version-changelog`
: After gates are green, cut the release section: version agreement,
  dated changelog entry, and release notes that preserve the honest 0123
  scope.

`REL_release-preflight-and-rc`
: Run `npm run release:preflight`, packed artifact smoke, generated surface
  checks, JSR dry-run, and the CI/runtime matrix expected by the release
  runbook.

`REL_push-pr-review-merge`
: Push the branch, open or update the release PR, get review and green CI,
  and merge only after explicit approval.

## Excluded From v17 Blockers

`SUB_live-tail-bounded-query-checksum-substrate`
: Excluded deliberately. 0110 and 0123 classify this as the post-v17
  blocker for live large-graph bounded `graph.query()` residency over stale
  checkpoint plus live tail. v17 must mention it honestly, not solve it.

Historical v17 backlog items that are explicitly `Target: v17.1.0`,
`Target: v17.2.0`, post-publish package extraction, or later-major
substrate convergence are also excluded from this release-blocker graph.

## Current Open Front

The tasks with no direct blockers are:

- `HEX_sync-production-auth-defaults`

`SPEC_consumer-typecheck-materialize-residue` closed in cycle 0125.
`SPEC_docs-materialize-frontdoor-drift` closed in cycle 0126 and unlocks
runtime error guidance. `SPEC_runtime-error-reading-basis-guidance`
closed in cycle 0127. `BND_checkpoint-schema-contract-drift` closed in
cycle 0128 and unlocked checkpoint-controller reading-basis work.
`PORT_checkpoint-controller-reading-basis` closed in cycle 0129. The
`PORT_patch-controller-reading-basis` closed in cycle 0130 and unlocked
subscription-controller reading-basis work.
`SPEC_uniform-git-cas-upgrade-contract-drift` closed in cycle 0131. The
`PORT_subscription-controller-reading-basis` closed in cycle 0132. The
`PORT_sync-controller-reading-basis` closed in cycle 0133 and opened
`SPEC_materialize-spy-test-clusters`. The materialize-spy cluster closed
in cycle 0134. `SPEC_observer-coordinate-pinning` closed in cycle 0135,
which exposed `SPEC_checkpoint-materialize-test-drift` as the remaining
non-security `test:local` blocker. That drift closed in cycle 0136, so
the open front narrowed to the sync secret hardening path. The secret
hardening node closed in cycle 0137, opening production sync auth
defaults.

## Regeneration

```sh
dot -Tsvg docs/design/0124-v17-release-blocker-dag.dot \
  -o docs/design/0124-v17-release-blocker-dag.svg
```

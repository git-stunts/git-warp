# 0124 V17 Release Blocker DAG

- Status: `inventory complete`
- Date: 2026-05-04
- Release lane: `v17.0.0`
- CSV matrix: [0124-v17-release-blocker-matrix.csv](0124-v17-release-blocker-matrix.csv)
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
: Current `npm run typecheck:consumer` fails because the consumer type
  contract still expects removed public materialization. This should be
  the first small release gate repair.

`SPEC_docs-materialize-frontdoor-drift`
: README, Getting Started, Guide, and API docs still teach
  `graph.materialize` as the public read path. v17 cannot ship with
  onboarding that contradicts the public type surface.

`SPEC_runtime-error-reading-basis-guidance`
: `QueryStateMessages.ts`, `RuntimeHost.ts`, `ProvenanceController.ts`,
  and API examples still tell users to "Call materialize". This is
  blocked by the docs task because errors should link to the new
  readings/optics guidance.

`BND_checkpoint-schema-contract-drift`
: `CheckpointService` tests and `checkpointLoad.ts` disagree about the
  supported schema matrix. The release needs one version truth.

`PORT_patch-controller-reading-basis`
: Patch controller paths still require or call `_materializeGraph()`.
  This is one internal read-basis seam.

`PORT_checkpoint-controller-reading-basis`
: Checkpoint controller read paths still name `_materializeGraph()`.
  This should follow the checkpoint schema matrix so tests do not chase
  two moving contracts at once.

`PORT_subscription-controller-reading-basis`
: Subscription/watch behavior still has materialize-spy failures and
  hidden refresh assumptions. This follows the patch seam because
  subscription freshness is patch-driven.

`PORT_sync-controller-reading-basis`
: Sync controller read-adjacent paths still materialize for cache/frontier
  reads. Security hardening should not be bundled into this seam.

`SPEC_materialize-spy-test-clusters`
: `WarpGraph.lazyMaterialize`, `WarpGraph.adjacencyCache`,
  `WarpGraph.watch`, controller tests, and related files still assert
  materialize calls or private cache behavior. Rewrite after the public
  contract and controller seams settle.

`SPEC_observer-coordinate-pinning`
: `WarpGraph.observerBoundary.test.ts` and `WarpGraph.strands.test.ts`
  still fail around observer state hash / pinned read coordinate behavior.

`SPEC_uniform-git-cas-upgrade-contract-drift`
: `uniform-git-cas-closeout.test.ts` expects stale package upgrade script
  text. It may be a brittle source-text assertion, but the package upgrade
  contract still needs a behavioral witness.

`HEX_sync-secret-plain-string`
: Sync HMAC secrets still pass through domain code as plain strings. This
  increases leakage risk and should precede production auth-default work.

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

- `SPEC_consumer-typecheck-materialize-residue`
- `SPEC_docs-materialize-frontdoor-drift`
- `BND_checkpoint-schema-contract-drift`
- `PORT_patch-controller-reading-basis`
- `PORT_sync-controller-reading-basis`
- `SPEC_observer-coordinate-pinning`
- `SPEC_uniform-git-cas-upgrade-contract-drift`
- `HEX_sync-secret-plain-string`

The smallest next pull remains
`SPEC_consumer-typecheck-materialize-residue`: it has a current RED gate,
small blast radius, and directly supports the public materialization
frontdoor deletion.

## Regeneration

```sh
dot -Tsvg docs/design/0124-v17-release-blocker-dag.dot \
  -o docs/design/0124-v17-release-blocker-dag.svg
```

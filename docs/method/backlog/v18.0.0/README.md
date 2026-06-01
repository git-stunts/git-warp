# v18.0.0 — Continuum-Compatible Graph Model Convergence

The hill: make `git-warp`'s graph model compatible with the concrete
shape Echo has already exercised while keeping both engines as equal
Continuum participants. They do not need to share the same public API,
admission model, or runtime shell.

Doctrine note: `PROTO_echo-shaped-*` task identities are historical
backlog shorthand for graph-model alignment pressure from Echo. They do
not mean Echo owns `git-warp`, and they do not make Continuum a runtime
hierarchy.

This release cuts the graph layer toward the shared two-plane model:

- skeleton-only node records
- skeleton-only edge records with stable edge identity
- explicit node and edge attachment slots
- typed attachment payloads instead of property folklore
- a graph-op algebra aligned with the substrate nouns
- a one-time migration that rewrites causal history into the new graph
  model and proves replay equivalence from genesis
- a Worldline-first public API whose Optics story is usable, not merely
  exposed

## In scope

- node and edge record identity cuts
- attachment-plane substrate introduction
- content migration out of `_content` property conventions
- property-bag reads reduced to projection helpers
- graph-model migration tooling
- replay-from-genesis verification
- public Optics closeout for the Worldline-first first-use API
- the v18 honesty gate for first-use Optics setup and bounded-claim wording

## Explicitly out of scope

- full worldline or scheduler parity with Echo
- observer-plan and reading-envelope parity
- witnessed suffix admission shell parity
- live holographic strand semantics
- replacing the `git-warp` causal envelope unless the migration proof
  forces it
- arbitrary graph size under bounded memory
- the full memory-pool, streaming-basis, cursorized-read/sync,
  fact-resolver-write, bounded-content-lookup, capability-reporting, and
  operator-doctor platform

Those doctrine and protocol surfaces live in
[`../v19.0.0/README.md`](../v19.0.0/README.md).

## Critical path

```text
LAYER 0 (shape cut):
  [x] PROTO_echo-shaped-node-records
  [x] PROTO_echo-shaped-edge-records
  [x] PROTO_attachment-plane-substrate

LAYER 1 (behavioral convergence):
  [x] PROTO_graph-op-algebra-convergence
  [~] PROTO_content-attachment-plane-cutover
  [x] PROTO_legacy-props-as-projection

LAYER 2 (migration and proof):
  [x] INFRA_graph-model-migration-tool
  [x] TRUST_genesis-replay-equivalence

LAYER 3 (public release):
  [!] API_no-full-materialization-first-use-optics
  [~] API_optics-public-api-closeout
  [!] RELEASE_v18-public-release-blockers
```

## Practical rule

`v18.0.0` is graph-model convergence, not "make git-warp become Echo."
Keep the `git-warp` causal envelope if it can faithfully carry the shared
graph model. Change the envelope only if replay honesty requires it.

## Status key

- `[ ]` not started
- `[~]` in progress
- `[x]` done
- `[!]` blocked

## Current Evidence

After PR #107 merged, the migration path has release-candidate evidence on
`main`:

- dry-run planning, source inventory, operation lowering, scratch writing,
  equivalence gating, and optional finalization are wired as command stages;
- a restored v17 golden fixture can be migrated through scratch history and
  opened through the production graph runtime during the wet run;
- canonical wet-run public-read equivalence now reaches zero mismatches with
  explicit patch-boundary evidence;
- CLI finalization is guarded behind a reviewed JSON confirmation artifact
  and blocks stale live refs, existing archive refs, failed equivalence, failed
  runtime replay, and mismatched confirmation evidence;
- generated Continuum/WARP Optic contract evidence is ingested from local
  generated artifacts and includes a `warp-ttd` generated-family smoke;
- the closeout audit enumerates remaining raw content/property compatibility
  boundaries and has a retired-boundary ratchet for the coordinate fact export
  cut;
- release-candidate evidence now names candidate scope, go/no-go gates,
  public-tag gates, and residual risks;
- `18.0.0` package, JSR, workspace, lockfile, changelog, release notes, and
  technical teardown updates are merged to `main`;
- PR #110 makes Worldlines the first-use public API and exposes foundation
  optics through `openWarpWorldline(...).optic()`.

The remaining public v18 work is not merely release operation anymore.
Coordinate Optics have branch-local implementation evidence:

- successful public node and property optic reads through
  `prepareOpticBasis()`, `coordinate()`, and `coordinate.optic()`;
- checkpoint-tail basis setup through the Worldline-first handle;
- recovery from `E_OPTIC_NO_BOUNDED_BASIS`;
- consumer type tests for the intended public optic chain.

That evidence is blocked for release honesty because the current
`prepareOpticBasis()` setup path calls `graph.materialize()` before
`graph.createCheckpoint()`. V18 must either remove that full-materialization
dependency from the documented first-use Optics path or narrow the release claim
so nobody can confuse v18 with bounded large-graph safety.

After this branch merges:

- rerun release preflight from `main` only after the Optics closeout and
  no-full-materialization honesty gate merge;
- then tag `v18.0.0` from the merged release commit;
- then publish npm and JSR artifacts from the release path;
- preserve the explicit non-claim that v18 does not provide arbitrary graph
  size, bounded-memory operation, or end-to-end graph streaming reads and
  writes.

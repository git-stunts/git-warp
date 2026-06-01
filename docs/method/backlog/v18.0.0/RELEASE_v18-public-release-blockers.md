---
id: RELEASE_v18-public-release-blockers
blocked_by:
  - API_no-full-materialization-first-use-optics
  - API_optics-public-api-closeout
  - INFRA_graph-model-migration-tool
  - TRUST_genesis-replay-equivalence
blocks: []
feature: graph-model-substrate
---

# v18 public release blockers

## Why

The v18 migration path now has enough operator surface area that the release
line needs explicit blockers. A public release must not imply stronger
migration safety or stronger Optics product readiness than the repository can
prove.

The current release line has two separate cut rules:

- v18 honesty gate: documented first-use application paths must not hide full
  graph materialization behind bounded-looking Optics, or the release must
  explicitly refuse the bounded large-graph claim.
- large-graph product gate: arbitrary graph size under bounded memory waits for
  memory budgets, streaming basis construction, cursorized reads and sync,
  fact-resolver writes, bounded content lookup, capability reporting, and
  conformance over graphs larger than the configured pool.

## Done looks like

- scratch output is opened through the production graph runtime, not only
  operation-history readback;
- live-ref finalization from the CLI has its own confirmation design,
  drift checks, archive evidence, and report output;
- the v17 golden graph fixture has a wet-run migration path that restores the
  fixture, writes scratch history, runs equivalence, and captures the operator
  report;
- Continuum/WARP Optic contract evidence is tied back to generated artifacts,
  not only handwritten compatibility prose;
- release notes clearly distinguish v18 graph-model convergence from later
  Continuum admission shells;
- Optics are public-facing enough to be usable: the Worldline-first public path
  has successful node and property optic reads, failure recovery guidance, and
  consumer type evidence;
- first-use Optics setup either avoids full graph materialization or the public
  v18 release text explicitly refuses any bounded large-graph claim;
- public release gates are run on the release branch before tagging.

## Completed Release-Candidate Evidence

| Evidence | Status |
|----------|--------|
| Production-runtime scratch replay | Complete for the canonical v17 wet-run path. |
| Live finalization CLI confirmation | Complete behind reviewed JSON confirmation. |
| Wet-run fixture harness | Complete for the canonical v17 fixture and zero-mismatch report. |
| Continuum contract tie-back | Complete for generated runtime-boundary fixtures and `warp-ttd` smoke. |
| Release-candidate evidence packet | Complete with public-tag gates and residual risks. |
| Residual raw content/property decision | Accepted as explicit v18 residual risk with an executable audit ratchet. |
| Operator release notes | Complete in `docs/releases/v18.0.0/README.md`. |
| Version metadata | Root package, private workspaces, lockfile, JSR metadata, and changelog now point at `18.0.0`. |
| Local release preflight | `npm run release:preflight` passes for `18.0.0` metadata on the release-prep branch. |
| PR review, GitHub CI, and merge | Complete in PR #107. |
| Worldline-first API pivot | Complete in PR #110, but Optics need the public closeout and first-use honesty gates below before release. |

## Current Public-Release Blockers

| Blocker | Why it still blocks public release | Required evidence |
|---------|------------------------------------|-------------------|
| No full materialization in first-use Optics | `openWarpWorldline(...).prepareOpticBasis()` currently calls `graph.materialize()` and then `graph.createCheckpoint()`. That makes the documented setup path full-residency even though the Optics story is bounded-basis first. | Merged `API_no-full-materialization-first-use-optics` evidence: implementation or narrowed claim, first-use tripwire tests, public API cost labels, and docs that keep first-use paths off diagnostic/offline/legacy APIs. |
| Optics public API closeout merge | Optics are part of the v18 public value proposition. The closeout branch carries coordinate implementation evidence, but public release still waits until that evidence is reviewed, updated for the honesty gate, and merged to `main`. | Merged `API_optics-public-api-closeout` with public `prepareOpticBasis()`, `coordinate()`, and `coordinate.optic()` success tests, checkpoint-tail evidence proof, consumer type coverage, docs for setup/recovery, and no bounded-large-graph overclaim. |
| Post-merge tag and publish work | Package metadata now points at `18.0.0` on merged `main`, but the tag and publish artifacts do not exist yet. This waits behind Optics closeout. | Signed or annotated tag, pushed tag, npm pack/publish evidence, and JSR publish evidence agree on `18.0.0`. |

## Public-Release Watch Items

| Watch item | Guard |
|------------|-------|
| Streaming overclaim guard | Public docs must keep stating that full graph streaming reads and writes are a v20 goal, not a v18 claim. |
| Bounded-memory overclaim guard | Public docs must not claim arbitrary graph size, bounded full-graph operation, or large-graph-safe content lookup until the large-graph product gate is actually implemented and tested. |
| Native Continuum witnesshood overclaim guard | Public docs must keep distinguishing translated v18 git-warp evidence from native Continuum witnesshood work planned for v19+. |

## Accepted Residual Risk

`v18.0.0` ships with named raw content/property compatibility boundaries still
present. This is accepted residual risk, not hidden completeness debt. The
release promise is graph-model convergence and migration proof, not total
storage-plane retirement.

The guard is executable:
`test/unit/scripts/v18-content-property-closeout-audit.test.ts` lists the
remaining raw compatibility files and fails on unreviewed boundary drift.
`CoordinateFactExport.ts` is retired and must stay retired.

## Next pull candidates

- Complete `API_no-full-materialization-first-use-optics`.
- Merge the updated `API_optics-public-api-closeout` evidence after the honesty
  gate is resolved.
- After Optics and the honesty gate are merged, rerun release preflight from
  aligned `main`, then cut and publish the public tag.

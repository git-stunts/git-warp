---
id: RELEASE_v18-public-release-blockers
blocked_by:
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
| Worldline-first API pivot | Complete in PR #110, but Optics need the public closeout gate below before release. |

## Current Public-Release Blockers

| Blocker | Why it still blocks public release | Required evidence |
|---------|------------------------------------|-------------------|
| Optics public API closeout | Optics are part of the v18 public value proposition. The current Worldline-first API exposes `events.optic()`, but release is not honest until the first-use path has successful public tests, basis setup docs, recovery docs, and package-surface evidence. | `API_optics-public-api-closeout` complete with public `openWarpWorldline(...).optic()` success tests, no-materialization proof, consumer type coverage, and docs for setup/recovery. |
| Post-merge tag and publish work | Package metadata now points at `18.0.0` on merged `main`, but the tag and publish artifacts do not exist yet. This waits behind Optics closeout. | Signed or annotated tag, pushed tag, npm pack/publish evidence, and JSR publish evidence agree on `18.0.0`. |

## Public-Release Watch Items

| Watch item | Guard |
|------------|-------|
| Streaming overclaim guard | Public docs must keep stating that full graph streaming reads and writes are a v20 goal, not a v18 claim. |
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

- Complete `API_optics-public-api-closeout`.
- After Optics are release-complete, rerun release preflight from aligned
  `main`, then cut and publish the public tag.

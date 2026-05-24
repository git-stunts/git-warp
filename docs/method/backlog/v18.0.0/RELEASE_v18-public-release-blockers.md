---
id: RELEASE_v18-public-release-blockers
blocked_by:
  - INFRA_graph-model-migration-tool
  - TRUST_genesis-replay-equivalence
blocks: []
feature: graph-model-substrate
---

# v18 public release blockers

## Why

The v18 migration path now has enough operator surface area that the release
line needs explicit blockers. A public release must not imply stronger
migration safety than the repository can prove.

## Done looks like

- scratch output is opened through the production graph runtime, not only
  operation-history readback
- live-ref finalization from the CLI has its own confirmation design,
  drift checks, archive evidence, and report output
- the v17 golden graph fixture has a wet-run migration path that restores the
  fixture, writes scratch history, runs equivalence, and captures the operator
  report
- Continuum/WARP Optic contract evidence is tied back to generated artifacts,
  not only handwritten compatibility prose
- release notes clearly distinguish v18 graph-model convergence from later
  Continuum admission shells

## Current blockers

| Blocker | Why it blocks public release | Evidence now |
|---------|------------------------------|--------------|
| Production-runtime scratch replay | Operation-history readback proves the scratch commits are parseable, but not that the normal graph runtime can open the migrated history. | `GraphModelMigrationScratchRuntimeConformanceProvider` is intentionally operation-derived. |
| Live finalization CLI design | The command can finalize through the API, but the shell wrapper correctly refuses live-ref finalization flags until operator confirmation semantics are designed. | `GraphModelMigrationCommandCli` rejects `--finalize` and related flags. |
| Wet-run fixture harness | The v17 fixture and scratch writer exist separately; the release gate needs one reproducible wet run that restores the fixture and executes the wrapper. | Fixture restore, source inventory, scratch writer, command wrapper, and report formatter exist. |
| Continuum contract tie-back | v18 is aimed at WARP Optic compatibility, so release claims need generated contract evidence from Wesley/Continuum artifacts. | Earlier slices recorded readiness and source facts, but graph-model migration work is still mostly git-warp-local. |
| Operator release notes | Users need plain release guidance on what v18 migrates, what it does not migrate, and why Echo and git-warp remain sibling participants. | BEARING has the doctrine; release notes are not yet cut. |

## Next pull candidates

- Design and implement production-runtime scratch replay conformance.
- Design live-ref finalization CLI confirmation and report behavior.
- Add a fixture wet-run command or documented harness around the current
  restore plus command CLI path.
- Attach generated Continuum/WARP Optic contract evidence to the v18 release
  gate.

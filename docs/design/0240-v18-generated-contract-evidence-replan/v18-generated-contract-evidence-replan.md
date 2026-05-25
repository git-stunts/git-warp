---
cycle: 0240
task_id: V18_generated_contract_evidence_replan
status: Complete
sponsors:
  human: James
  agent: Codex
started_at: 2026-05-24
completed_at: 2026-05-24
release_home: v18.0.0
bearing_task: 92
---

# V18 Generated Contract Evidence Replan

## Hill

Reset the v18 runway after generated Continuum contract evidence became
executable in git-warp.

## Evidence In Hand

Generated contract evidence is no longer only a prose inventory:

- the runtime-boundary-generated fixture is admitted through the Continuum
  artifact JSON adapter;
- graph-model contract conformance ties that descriptor to the canonical v17
  graph-model fixture;
- `warp-ttd` generated-family smoke facts expose passed conformance as
  `PRESENT` translated-substrate facts and failed conformance as
  `OBSTRUCTED` facts.

This is sufficient for v18 release notes to claim generated-contract tie-back
for the graph-model migration evidence. It is not sufficient to claim native
Continuum witnesshood. The smoke explicitly remains translated substrate.

## Remaining Release Blockers

The next blockers are narrower than the previous plan:

- shrink one raw content/property compatibility boundary;
- ratchet the closeout audit so the retired raw boundary cannot drift back;
- cut a release-candidate evidence packet with local gate, wet-run,
  generated-contract, operator-docs, and residual-risk sections.

The public-release posture should remain conservative. The v18 branch can
show migration safety, guarded finalization, generated contract tie-back, and
first `warp-ttd` smoke evidence. It should still name legacy content/property
compatibility as an explicit residual risk until the remaining raw boundaries
are retired.

## Acceptance Criteria

- BEARING marks slice 92 complete.
- BEARING evidence names the new generated-contract proof chain.
- The next work items stay scoped to raw-boundary paydown, audit tightening,
  and release-candidate evidence.

## Test Plan

Run Markdown lint against this document and BEARING.

---
cycle: 0239
task_id: V18_warp_ttd_generated_family_smoke
status: Complete
sponsors:
  human: James
  agent: Codex
started_at: 2026-05-24
completed_at: 2026-05-24
release_home: v18.0.0
bearing_task: 91
---

# V18 Warp TTD Generated-Family Smoke

## Hill

Expose the graph-model generated-contract proof as a `warp-ttd`-shaped
generated-family smoke fact.

## Design

`GitWarpWarpTtdGeneratedFamilySmoke` consumes
`GitWarpGraphModelContractConformanceResult`. It does not import `warp-ttd`
code or run another repository's tests. Instead, it mirrors the generated
family fact posture already present in the local `warp-ttd` ingress design:

- `PRESENT` when graph-model conformance passes and the descriptor targets
  `warp-ttd`;
- `OBSTRUCTED` when generated-contract conformance fails;
- `TRANSLATED_SUBSTRATE` origin so the fact does not overclaim native
  Continuum witnesshood;
- `SESSION` scope, `git-warp` source family, and `warp-ttd` target.

The smoke payload is the conformance evidence lines. That makes the consumer
shape deterministic while keeping git-warp independent from `warp-ttd` package
layout and release cadence.

## Acceptance Criteria

- Passed runtime-boundary conformance emits a `PRESENT` `warp-ttd` smoke fact.
- Failed conformance emits an `OBSTRUCTED` smoke fact with failed check names.
- The smoke fact carries conformance evidence lines as payload.
- The smoke preserves git-warp's translated-evidence posture.

## Test Plan

Run the `GitWarpWarpTtdGeneratedFamilySmoke` unit test. It evaluates both the
passing runtime-boundary fixture and the obstructed receipt-family descriptor.

---
cycle: 0158
task_id: V18_warp_ttd_receipt_smoke
status: Planned
sponsors:
  human: James
  agent: Codex
started_at: 2026-05-22
release_home: v18.0.0
bearing_task: 10
---

# V18 Warp-TTD Receipt Smoke

## Pull

`warp-ttd` needs git-warp facts as generated-family nouns, not handwritten
adapter-local receipt folklore. Once receipt-family projection exists, the next
test is a narrow consumer smoke.

## Hill

Add the first `warp-ttd` smoke over generated-family git-warp receipt facts.

## Playback Questions

- Can `warp-ttd` consume a git-warp receipt-family projection fixture?
- Does the smoke depend on generated-family facts rather than local hand-shaped
  DTOs?
- Does the consumed value preserve evidence posture?
- Is the smoke narrow enough to avoid pulling reading-envelope or
  runtime-boundary work forward?

## Design

Inspect `~/git/warp-ttd` for its minimum receipt input shape. Add a smoke path
that feeds it git-warp receipt-family projection output from slice 9.

The smoke can be one of:

- a fixture exported by git-warp and consumed by a warp-ttd command/test;
- a git-warp-side compatibility test that shells into a warp-ttd fixture
  reader;
- a documented fixture contract if direct cross-repo execution is not stable
  yet.

## Non-Goals

- Do not implement full `warp-ttd` integration.
- Do not add reading-envelope projection.
- Do not make `warp-ttd` a runtime dependency of core git-warp code.

## RED

- Smoke fails with handwritten/local receipt DTOs only.
- Smoke fails when evidence posture is missing.
- Smoke passes when generated-family projection output is used.

## Verification

- The narrow smoke command or fixture check.
- `npm run lint`
- `npm run typecheck`
- Any warp-ttd command used by the smoke, with exact path and command recorded.

## SSJS Scorecard

- Runtime-backed forms: green if slice 9 projection is reused.
- Boundary validation: planned; cross-repo fixture loading stays at test or
  adapter boundaries.
- Behavior ownership: green; warp-ttd consumes, git-warp provides.
- Message parsing: green.
- Ambient time or entropy: green.
- Fake shape trust or cast-cosplay: planned; smoke must use generated-family
  output.


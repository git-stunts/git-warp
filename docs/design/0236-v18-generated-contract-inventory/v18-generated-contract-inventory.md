---
cycle: 0236
task_id: V18_generated_contract_inventory
status: Complete
sponsors:
  human: James
  agent: Codex
started_at: 2026-05-24
completed_at: 2026-05-24
release_home: v18.0.0
bearing_task: 88
---

# V18 Generated Contract Inventory

## Hill

Record the current generated Continuum/Wesley/`warp-ttd` contract surface that
v18 release claims can cite.

## Evidence Snapshot

Local Continuum schemas are present for the four current families:

- `~/git/continuum/schemas/continuum-receipt-family.graphql`
- `~/git/continuum/schemas/continuum-settlement-family.graphql`
- `~/git/continuum/schemas/continuum-neighborhood-core-family.graphql`
- `~/git/continuum/schemas/continuum-runtime-boundary-family.graphql`

Local `warp-ttd` has generated-family intake code and a generated protocol
surface:

- `~/git/warp-ttd/src/app/generatedFamilyIngress.ts`
- `~/git/warp-ttd/src/generated/warp-ttd-protocol.wesley.generated.ts`
- `~/git/warp-ttd/test/generatedFamilyIngress.spec.ts`
- `~/git/warp-ttd/test/wesleyGeneratedProtocol.spec.ts`

Local Wesley contains Continuum contract compiler and runtime artifact design
work:

- `~/git/wesley/docs/design/0003-continuum-contract-compiler/continuum-contract-compiler.md`
- `~/git/wesley/docs/architecture/continuum-minimum-shared-contract-surface.md`
- `~/git/wesley/docs/design/wesley-contract-family-artifact-runtime-value.md`

## Current Readiness

The git-warp inventory already marks `receipt-family` and `settlement-family`
as profiled and fixture-witnessed. The graph-model v18 work now needs
`runtime-boundary-family` evidence because it is the family closest to reading
envelopes, witnessed suffixes, and admission outcomes.

## Acceptance Criteria

- The four Continuum family schemas are named in BEARING evidence.
- The local `warp-ttd` generated-family intake locations are named.
- The next implementation slice is clearly scoped to runtime-boundary fixture
  ingestion rather than a broad cross-repo rewrite.

## Test Plan

This is an evidence and planning slice. Run Markdown lint against this document
and BEARING.

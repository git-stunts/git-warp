---
cycle: 0146
task_id: V18_continuum_compatibility_charter
status: Complete
sponsors:
  human: James
  agent: Codex
started_at: 2026-05-21
completed_at: 2026-05-21
release_home: v18.0.0
---

# V18 Continuum Compatibility Charter

## Pull

v17 made the current engine shippable. v18 must make `git-warp` compatible
with the shared Continuum/WARP Optic stack as a complete sibling Continuum
participant without collapsing it into Echo, Wesley, or `warp-ttd`.

## Hill

`git-warp` becomes a Continuum-compatible sibling WARP runtime:

- it consumes Wesley-generated artifacts for Continuum-owned contract families;
- it maps append-only Git history into honest WARP Optic evidence;
- it exposes generated-family facts to `warp-ttd`;
- it separates translated git-warp evidence from native Continuum witnesshood.

## Source Artifacts

- `~/git/blog/aion-paper-07/dist/aion-paper-07.txt`
- `~/git/continuum/schemas/`
- `~/git/continuum/docs/contract-family-registry.md`
- `~/git/wesley/README.md`
- `~/git/echo/docs/BEARING.md`
- `~/git/warp-ttd/docs/BEARING.md`
- [VISION.md](../../VISION.md)
- [BEARING.md](../../BEARING.md)
- [backlog/WORKLOADS.md](../../method/backlog/WORKLOADS.md)
- [backlog/v18.0.0/README.md](../../method/backlog/v18.0.0/README.md)

## Compatibility Law

The target WARP Optic shape is:

```text
Psi = (Omega, chi, rho, Pi, Lambda)
Lower_Psi(F*, P) = (R, W, theta)
```

For v18, `git-warp` should interpret that shape as a compatibility boundary:

- `Omega`: observer/read discipline, basis, and emission posture;
- `chi`: bounded frontier-relative support slice;
- `rho`: append-only Git/CRDT lowering surface over patch chains;
- `Pi`: admission law producing derived, plural, conflict, or obstruction
  outcomes;
- `Lambda`: retained replay, audit, transport, revelation, and reliance
  obligations.

This charter does not require one generic optic engine. It requires each
published compatibility surface to say which part of the optic shape it
implements and which evidence supports that claim.

## Contract Families

The first v18 compatibility families are the Continuum-authored families:

- `receipt-family`
- `settlement-family`
- `neighborhood-core-family`
- `runtime-boundary-family`

Wesley is the compiler and artifact authority for these shared families.
`git-warp` must consume generated artifacts or documented generated fixtures.
Handwritten mirrors may exist only as temporary local adapters with explicit
non-authority status.

## Backlog Integration

The repo-visible v18 backlog already names
`WL-4A-v18-graph-substrate-convergence` as the first major workload. This
charter folds that work into the Continuum campaign rather than replacing it.

That workload contributes the graph-model track:

- node and edge record identity;
- attachment-plane substrate work;
- graph-op algebra convergence;
- content migration out of legacy property conventions;
- property-bag reads reduced to projections;
- graph-model migration tooling;
- replay equivalence from genesis.

The existing `PROTO_echo-shaped-*` task identities are retained as backlog
history. In this charter, `echo-shaped` means graph-model pressure already
exercised by Echo. It does not mean Echo owns `git-warp`'s Continuum role or
defines `git-warp`'s participant obligations.

## Evidence Posture

The default posture for existing git-warp facts mapped into Continuum-family
shapes is translated evidence. A value may be Continuum-shaped without being
Continuum-native.

`git-warp` may claim native Continuum witnesshood only after a runtime witness
proves the value was produced through the corresponding Continuum family
contract and not merely mapped from local git-warp facts.

## Non-Goals

- Do not make Echo the owner or authority for `git-warp`'s Continuum role.
- Do not make `git-warp` a semantic owner for Continuum contract families.
- Do not make `warp-ttd` hand-normalize git-warp facts into substitute shared
  contracts.
- Do not build a generic WARP Optic runtime before repeated concrete
  compatibility cuts justify it.
- Do not claim native Continuum witnesshood for translated git-warp evidence.

## Acceptance

The v18 opening campaign is on track when:

- [ ] `BEARING.md` tracks the running v18 task list.
- [x] A cross-repo contract matrix names each family, generated artifact, local
  source fact, consumer, and missing witness.
- [x] A WARP Optic realization map exists for `git-warp`.
- [x] The repo can ingest at least one generated Continuum family artifact or
  generated fixture.
- [x] A guard prevents generated-family local mirrors from becoming hidden
  authority.
- [ ] The first receipt-family projection reaches `warp-ttd` without adapter
  folklore.

## SSJS Scorecard

- Runtime-backed forms: green for this documentation slice; no runtime forms
  introduced.
- Boundary validation: green; the charter names generated artifacts as the
  boundary authority.
- Behavior ownership: green; Continuum owns shared semantics, Wesley compiles,
  `git-warp` emits git-warp-local facts, and `warp-ttd` observes.
- Message parsing: green; no behavior branches are introduced.
- Ambient time or entropy: green; no runtime code introduced.
- Fake shape trust or cast-cosplay: green; the charter explicitly rejects fake
  native witnesshood.

## Closeout

This charter closes BEARING task 2 and defines the standard later v18 slices
must satisfy before making stronger compatibility claims.

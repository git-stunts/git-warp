---
id: PROTO_continuum-contract-alignment-for-btr-and-receipts
blocked_by: []
blocks: []
feature: protocol-alignment
release_home: v18.0.0
---

# Align BTR shells with Continuum receipt families

**Effort:** M

0099 deliberately kept BTR as a git-warp-local tick-scale retained
shell. That was the right scope for the BTR/provenance boundary repair,
but future protocol work still needs to decide how BTR shell facts
relate to Continuum shared families.

This is a protocol-alignment idea, not a request to broaden BTR by hand.

## Purpose

Future protocol alignment between git-warp local BTR shells and
Continuum shared families such as `Receipt`, `Witness`, `SuffixShell`,
`ImportOutcome`, and `SettlementResult`.

## Acceptance

- Do not merge BTR into Continuum families by hand.
- Identify which BTR shell facts should later feed Continuum
  receipt/witness/suffix/settlement views.
- Prefer authored GraphQL/Wesley schemas and generated artifacts for
  shared contracts.
- Keep git-warp-local BTR shell separate unless a deliberate schema
  family says otherwise.

## Source

Created from 0099 drift/retro follow-up handling after the external
context checkpoint prevented BTR repair from becoming private Continuum
schema work.

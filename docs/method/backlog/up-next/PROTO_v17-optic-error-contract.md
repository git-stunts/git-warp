---
id: PROTO_v17-optic-error-contract
feature: v17-optics-checkpoint-tail
blocked_by:
  - 0117-v17-plumber-recovery-contract
blocks: []
---

# v17 Optic Error Contract

**Effort:** S

## Hill

Define the stable machine-readable error shape for v17 optic failures.

## Problem

The checkpoint-tail optic path currently fails closed with typed error codes,
but the contract is not explicit enough for future callers, Plumber recovery,
or cross-runtime protocol work.

The dangerous outcome is implementation drift where each new optic failure
adds a slightly different context shape or recovery hint.

## Must Define

- the complete v17 optic error-code set
- required context fields per code
- optional context fields per reason
- recovery hint field shape
- whether recovery hints are ordered
- stability rules for adding new context fields

## Required Starting Codes

```text
E_OPTIC_NO_BOUNDED_BASIS
E_OPTIC_TAIL_BUDGET_EXCEEDED
E_OPTIC_READ_IDENTITY
```

## Required Starting Shape

```text
{
  code: string,
  context: {
    graphName: string,
    reason?: string
  },
  recovery: string[]
}
```

The `recovery` entries must use operation identifiers from
`0117-v17-plumber-recovery-contract`.

## Acceptance

- Every v17 optic failure code has required context fields.
- Recovery hints are machine-readable operation identifiers, not prose.
- Existing `E_OPTIC_NO_BOUNDED_BASIS` reasons are classified.
- `E_OPTIC_TAIL_BUDGET_EXCEEDED` names budget fields required by the budget
  contract.
- The design does not implement runtime changes unless separately pulled into
  a GREEN slice.

## Non-Goals

- No implementation.
- No new Plumber behavior.
- No Continuum wire packet.
- No Echo interop.
- No parser broadening.
- No materialization fallback.

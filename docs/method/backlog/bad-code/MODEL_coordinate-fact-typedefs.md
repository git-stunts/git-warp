---
id: MODEL_coordinate-fact-typedefs
blocked_by: []
blocks: []
feature: materialization-query-index
---

# CoordinateFactExport has 11 typedef-only domain concepts

**Effort:** L

## What's wrong

`CoordinateFactExport.js` defines 11 `@typedef` shapes (`CoordinateComparisonV1`, `CoordinateComparisonFactV1`, `CoordinateTransferPlanV1`, etc.) with no runtime backing. Validation relies on ad-hoc `requireObject` / `requireNonEmptyString` helpers instead of constructor invariants. `serializeSingleTransferOp` uses tag dispatch on `op.op` string (P3 + P7 violation).

## Suggested fix

- Promote each typedef to a class with constructor validation (P1 + P2).
- Use `instanceof` dispatch for op serialization instead of string tag switching (P7).
- Group related types by responsibility (comparison, transfer, fact).

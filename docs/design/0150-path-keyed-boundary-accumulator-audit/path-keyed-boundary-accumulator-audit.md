---
cycle: 0150
task_id: BND_path_keyed_boundary_accumulator_audit
status: Planned
sponsors:
  human: James
  agent: Codex
started_at: 2026-05-22
release_home: v18.0.0
backlog:
  - docs/method/backlog/bad-code/BND_path-keyed-object-accumulators.md
---

# Path-Keyed Boundary Accumulator Audit

## Pull

PR #93 fixed one concrete instance of a path-keyed plain object
accumulator in recursive tree OID parsing. The finding is broader than
that file: repository paths, transport field names, and generated
artifact identifiers are untrusted data until a boundary has validated
them.

## Hill

Every touched path-keyed accumulator at Git or transport boundaries
uses a runtime-honest intermediate representation before exposing any
record-shaped API.

## Playback Questions

- Which adapters accept path-like or identifier-like strings from Git,
  transport, generated artifacts, or file input?
- Which of those adapters write untrusted keys into plain objects before
  validation?
- Does each corrected site prove prototype-like keys are preserved as
  data?
- Does the public API shape stay stable where callers already expect a
  record?

## Design

1. Inventory boundary files under `src/infrastructure/adapters/`,
   transport codecs, and generated-artifact ingestion seams.
2. Mark each path-keyed accumulator as safe, unsafe, or intentionally
   record-shaped after validation.
3. For unsafe sites, accumulate in `Map` or another typed runtime
   collection before final materialization.
4. Add focused tests for `__proto__`, `constructor`, and nested path
   examples at each repaired boundary.

## Non-Goals

- Do not replace stable public record APIs solely for aesthetic reasons.
- Do not create a generic helper before at least two real call sites
  justify one.
- Do not move parsing behavior into domain code.

## Verification

- Targeted tests for each repaired boundary.
- `npm run lint`
- `npm run typecheck`
- `npm run test:local`

## SSJS Scorecard

- Runtime-backed forms: planned; untrusted key collections use real
  runtime collections before record materialization.
- Boundary validation: planned; validation remains in adapters and
  parser seams.
- Behavior ownership: planned; each boundary owns its own input shape.
- Message parsing: green; no behavior depends on free-form messages.
- Ambient time or entropy: green; no time or entropy is involved.
- Fake shape trust or cast-cosplay: planned; no casts should be needed
  for accumulator safety.


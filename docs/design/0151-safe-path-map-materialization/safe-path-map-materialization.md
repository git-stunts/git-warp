---
cycle: 0151
task_id: PROTO_safe_path_map_materialization
status: Planned
sponsors:
  human: James
  agent: Codex
started_at: 2026-05-22
release_home: v18.0.0
backlog:
  - docs/method/backlog/cool-ideas/PROTO_safe-path-map-materialization.md
---

# Safe Path-Map Materialization

## Pull

The recursive tree OID parser now uses `Map<string, string>` before
returning a public record. That pattern should be deliberate rather
than rediscovered during each review.

## Hill

The repo has a documented pattern for path-keyed materialization that
preserves existing record-shaped APIs without trusting untrusted keys as
object structure.

## Playback Questions

- When is `Map` the right intermediate representation?
- When is a null-prototype object acceptable?
- Where should validation happen before materializing a public record?
- What test cases prove the materialization is not prototype-sensitive?

## Design

The default pattern is:

1. Parse or collect untrusted path-like inputs into `Map`.
2. Validate each key and value as boundary data.
3. Convert to a public record only at the adapter edge that already
   promises a record.
4. Test prototype-like keys and normal nested paths together.

If repeated call sites appear, introduce a named helper with a narrow
type signature and no `any`, `unknown`, or cast-cosplay. Until then,
prefer local code that keeps each boundary easy to read.

## Non-Goals

- Do not introduce a universal collection abstraction.
- Do not widen public APIs to `Map` without a separate compatibility
  decision.
- Do not normalize or reject valid Git path names merely because they
  are awkward object keys.

## Verification

- Markdown docs lint for the pattern doc.
- Focused unit tests if a helper is introduced.
- Typecheck if any helper lands.

## SSJS Scorecard

- Runtime-backed forms: planned; `Map` is the explicit runtime form.
- Boundary validation: planned; validation remains at the boundary.
- Behavior ownership: green; materialization belongs to adapter edges.
- Message parsing: green.
- Ambient time or entropy: green.
- Fake shape trust or cast-cosplay: planned; helper design must not
  require casts.


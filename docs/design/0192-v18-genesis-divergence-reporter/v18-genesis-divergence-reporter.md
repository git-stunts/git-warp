---
cycle: 0192
task_id: V18_genesis_divergence_reporter
status: Complete
sponsors:
  human: James
  agent: Codex
started_at: 2026-05-23
release_home: v18.0.0
bearing_task: 44
promotes_backlog:
  - docs/method/backlog/v18.0.0/TRUST_genesis-replay-equivalence.md
---

# V18 Genesis Divergence Reporter

## Sponsor Human

James.

## Sponsor Agent

Codex.

## Hill

Report the first divergent patch boundary and field path when legacy replay
and migrated replay are not equivalent.

## Playback Questions

- Does a proof failure identify the first divergent patch?
- Does it identify operation index when that evidence exists?
- Does it identify the graph fact field that differs?
- Does the report distinguish missing, extra, and changed facts?
- Can CLI or CI output use the report without parsing raw mismatch objects?

## Existing Shape

Structured mismatch nouns are useful to code, but operators need a focused
answer: where did replay first diverge, and what value was different? Without
that, migration proof failures become archaeology.

The reporter must be deterministic and concise, but it must not reduce proof
truth to a lossy string-only result.

## Chosen Boundary

Add a divergence reporter over equivalence proof failures. It should consume
structured mismatches and history boundary evidence, then produce a report
object with:

- first divergent patch id;
- writer id when known;
- operation index when known;
- graph fact identity;
- field path;
- legacy value summary;
- migrated value summary;
- mismatch kind.

Rendering to text belongs in a small adapter or CLI-facing formatter. The
domain report remains structured.

## Non-Goals

- Do not implement full CLI integration unless it is tiny and already
  supported by tests.
- Do not serialize reports as the only proof artifact.
- Do not collapse multiple mismatches into one string.
- Do not use stack traces as migration diagnostics.
- Do not introduce wall-clock timestamps.

## RED Plan

Add tests that fail until the reporter exists:

- first mismatch is selected deterministically;
- missing fact, extra fact, and changed field produce different kinds;
- patch and operation boundary evidence appears when available;
- rendered summaries do not affect comparison behavior.

## GREEN Plan

Implement the reporter as domain code over proof nouns. Add a separate
formatter only if CLI tests require it. Keep value summaries bounded and
deterministic.

If boundary evidence is absent, the report must say so explicitly rather than
guessing.

## Verification

```text
npx vitest run test/unit/domain/migrations/GenesisDivergenceReporter.test.ts --reporter=verbose
npx eslint src/domain/migrations test/unit/domain/migrations/GenesisDivergenceReporter.test.ts
npm run typecheck
npm run lint
npm run lint:sludge
git diff --check HEAD
```

## Playback

- `GenesisDivergenceReporter` consumes `GenesisEquivalenceProofFailure` and
  selects the first deterministic mismatch.
- `GenesisDivergenceReport` keeps mismatch kind, fact kind, fact key, field
  path, optional writer/patch/operation evidence, and bounded value summaries
  as structured fields.
- Missing boundary evidence remains explicit as `null` and renders as
  `(unknown)` for operator-facing text.
- Long value summaries are bounded for output without modifying the source
  mismatch evidence.

## Evidence

- `src/domain/migrations/GenesisDivergenceReport.ts`
- `src/domain/migrations/GenesisDivergenceReporter.ts`
- `test/unit/domain/migrations/GenesisDivergenceReporter.test.ts`

## Closeout Criteria

- Divergence reports are structured values.
- First divergent boundary is deterministic.
- CLI-facing text can be generated without losing structured proof data.
- The final slice can replan with concrete migration and equivalence evidence.

## SSJS Scorecard

- Runtime-backed forms: green when divergence reports are classes.
- Boundary validation: green when missing boundary evidence is explicit.
- Behavior ownership: green when reporter owns report selection and summary.
- Message parsing: green; report text is output, not behavior input.
- Ambient time or entropy: green; no timestamps or randomness.
- Fake shape trust or cast-cosplay: green when no assertions are introduced.

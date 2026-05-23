---
cycle: 0180
task_id: V18_property_write_intent_nouns
status: Planned
sponsors:
  human: James
  agent: Codex
started_at: 2026-05-23
release_home: v18.0.0
bearing_task: 32
promotes_backlog:
  - docs/method/backlog/v18.0.0/PROTO_legacy-props-as-projection.md
---

# V18 Property Write Intent Nouns

## Sponsor Human

James.

## Sponsor Agent

Codex.

## Hill

Introduce runtime-backed property write intent nouns so public property writes
no longer assemble legacy property operations directly at the call site.

## Playback Questions

- Is node property write intent a named runtime-backed value?
- Is edge property write intent a named runtime-backed value?
- Do write intents validate owner identity, key, and value before lowering?
- Are content write intents still separate from generic property write
  intents?
- Does the persistence shape remain compatible until migration exists?

## Existing Shape

Content writes now build typed content attachment intent before lowering to
legacy `_content*` properties. Generic property writes still build
`NodePropSet` and `EdgePropSet` operations directly.

That leaves a conceptual split: content writes are intent-backed, while normal
properties still depend on legacy property-bag semantics. The backlog asks for
graph writes that no longer depend on property bags as substrate truth.

## Chosen Boundary

Create property write intent classes for node and edge property writes. These
intents should bind:

- validated owner identity;
- validated legacy compatibility property key;
- validated value carrier matching existing inline value behavior;
- a lowering method or lowering collaborator that emits current patch ops.

Content attachment intent stays separate. Generic property intent should not
capture `_content*` as ordinary user data unless the current public API
explicitly requires that behavior; reserved-key handling must be documented in
tests.

## Non-Goals

- Do not change public `setProperty()` or `setEdgeProperty()` signatures.
- Do not replace `NodePropSet` or `EdgePropSet` yet.
- Do not migrate old histories.
- Do not hide content metadata keys without a compatibility decision.
- Do not add generic loose value carriers.

## RED Plan

Add tests that fail until the intent nouns exist:

- node write intent rejects malformed node ids and empty property keys;
- edge write intent rejects malformed edge coordinates and empty keys;
- values are frozen or safely owned;
- reserved content compatibility keys follow the documented policy.

## GREEN Plan

Implement the new intent nouns as frozen classes with explicit constructors.
Keep lowering out of public callers where possible, either as a method on the
intent or as a focused lowering service. Avoid a boolean target flag; use
separate node and edge concepts or a small `instanceof` dispatch point.

## Verification

```text
npx vitest run test/unit/domain/graph/PropertyWriteIntent.test.ts --reporter=verbose
npx eslint src/domain/graph test/unit/domain/graph/PropertyWriteIntent.test.ts
npm run typecheck
npm run lint:sludge
git diff --check HEAD
```

## Closeout Criteria

- Property write intent nouns exist and are exported intentionally.
- Constructor guard paths are covered.
- Content write intent remains separate.
- The next slice can route `PatchBuilder` through the new intent nouns.

## SSJS Scorecard

- Runtime-backed forms: green when write intents are frozen classes.
- Boundary validation: green when constructor validation gates owner, key,
  and value.
- Behavior ownership: green when intent lowering is named and isolated.
- Message parsing: green; no diagnostic parsing controls behavior.
- Ambient time or entropy: green; no clocks or randomness.
- Fake shape trust or cast-cosplay: green when no assertions are added.

---
cycle: 0191
task_id: V18_genesis_equivalence_fixtures
status: Complete
sponsors:
  human: James
  agent: Codex
started_at: 2026-05-23
release_home: v18.0.0
bearing_task: 43
promotes_backlog:
  - docs/method/backlog/v18.0.0/TRUST_genesis-replay-equivalence.md
---

# V18 Genesis Equivalence Fixtures

## Sponsor Human

James.

## Sponsor Agent

Codex.

## Hill

Build the first deterministic fixture histories for genesis replay
equivalence across nodes, edges, properties, content, and removals.

## Playback Questions

- Do fixtures cover node create, property write, and node removal?
- Do fixtures cover edge create, edge property write, and edge removal?
- Do fixtures cover content attachment metadata and payload identity?
- Do fixtures include at least one multi-writer ordering case?
- Can the equivalence proof consume fixture readings without a real migration
  write?

## Existing Shape

The repo already has critical multi-writer regression coverage for visible
state. Migration equivalence needs smaller, purpose-built fixture histories
that can be replayed both as legacy history and as planned migrated graph-op
facts.

The first fixture set should be compact. Broad fixture ambition is a common
way to delay proof of the core seam.

## Chosen Boundary

Add fixture builders for equivalence tests. Fixtures should produce:

- legacy history input;
- expected legacy reading;
- planned migrated reading or planner input;
- expected proof result.

Start with a small suite:

- node lifecycle with property;
- edge lifecycle with property;
- content attachment with metadata;
- removed node or edge hiding later properties;
- multi-writer non-coordinated patch order.

## Non-Goals

- Do not run full migration over arbitrary repositories.
- Do not write Git refs.
- Do not depend on wall-clock order.
- Do not create massive golden files.
- Do not claim production equivalence coverage.

## RED Plan

Add fixture tests that fail until builders and proof harness exist:

- fixture histories produce stable legacy readings;
- expected migrated readings compare equal for the simple cases;
- an intentionally divergent fixture produces a structured mismatch.

## GREEN Plan

Implement small fixture builders in test support or a migration test package.
Prefer explicit fixture operations over opaque JSON blobs. If fixture data must
be serialized, keep parser boundaries outside domain code.

Use the equivalence proof nouns from slice 42 to compare fixture results.

## Verification

```text
npx vitest run test/unit/domain/migrations/GenesisEquivalenceFixtures.test.ts --reporter=verbose
npx eslint test/unit/domain/migrations
npm run typecheck
npm run lint
git diff --check HEAD
```

## Playback

- Fixture cases cover node lifecycle with property, edge lifecycle with
  property, content attachment metadata, removed-node visibility, and
  multi-writer non-coordinated order.
- `GenesisEquivalenceFixtureCase` carries legacy and migrated readings plus
  the expected result kind.
- The divergent fixture intentionally changes one property value and proves
  the proof layer returns a structured mismatch.
- Fixture readings are constructed from explicit runtime-backed equivalence
  nouns, not opaque JSON blobs.

## Evidence

- `test/unit/domain/migrations/GenesisEquivalenceFixtureCase.ts`
- `test/unit/domain/migrations/GenesisEquivalenceFixtures.ts`
- `test/unit/domain/migrations/GenesisEquivalenceFixtures.test.ts`

## Closeout Criteria

- First equivalence fixtures exist.
- Equal and divergent fixture cases are covered.
- Fixture output is deterministic.
- The divergence reporter can be built against real mismatch examples.

## SSJS Scorecard

- Runtime-backed forms: green when fixtures construct domain nouns.
- Boundary validation: green when fixture builders reject malformed facts.
- Behavior ownership: green when fixtures set up and proof code compares.
- Message parsing: green; no test behavior parses diagnostics.
- Ambient time or entropy: green; no random or wall-clock fixture values.
- Fake shape trust or cast-cosplay: green when no loose fixture casts appear.

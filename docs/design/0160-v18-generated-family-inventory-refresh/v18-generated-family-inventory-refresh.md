---
cycle: 0160
task_id: V18_generated_family_inventory_refresh
status: Complete
sponsors:
  human: James
  agent: Codex
started_at: 2026-05-22
completed_at: 2026-05-22
release_home: v18.0.0
bearing_task: 12
---

# V18 Generated Family Inventory Refresh

## Sponsor Human

James.

## Sponsor Agent

Codex.

## Hill

Add a runtime-backed inventory of current Continuum/Wesley family readiness so
later v18 projections can ask whether a family is projection-ready before they
emit generated-family-shaped facts.

## Playback Questions

- Can the runtime name every current Continuum family in one inventory without
  relying on an external chat transcript?
- Can code distinguish profiled fixture-witnessed families from authored-only
  families before projecting more source facts?
- Does the inventory reject missing, duplicate, or unknown family entries?
- Does the public export surface include the inventory nouns needed by later
  slices without making git-warp the semantic owner of Continuum families?

## Accessibility / Assistive Reading Posture

The inventory remains code-level data with tests and a design table. It has no
visual-only affordances. Human reviewers can read one ordered table in this doc
and one ordered test fixture in the unit test.

## Localization / Directionality Posture

No UI text is introduced. The status labels are stable ASCII protocol labels,
not localized prose.

## Agent Inspectability / Explainability Posture

The inventory objects answer the questions later agents need before adding
projections:

- which family exists;
- which authored schema path anchors it;
- whether Wesley has profiled and fixture-witnessed it;
- what source facts git-warp can currently provide;
- what compatibility cut remains open.

## Evidence Snapshot

The slice reflects the same inspected cross-repo evidence used by slice 11:

| Family | Authored home | Wesley status | Current v18 posture |
| --- | --- | --- | --- |
| `receipt-family` | `schemas/continuum-receipt-family.graphql` | `profiled`, `fixture-witnessed` | projection-ready |
| `settlement-family` | `schemas/continuum-settlement-family.graphql` | `profiled`, `fixture-witnessed` | projection-ready |
| `neighborhood-core-family` | `schemas/continuum-neighborhood-core-family.graphql` | `authored` | authored-only |
| `runtime-boundary-family` | `schemas/continuum-runtime-boundary-family.graphql` | `authored` | authored-only |

## Design

Add these domain concepts:

- `ContinuumGeneratedFamilyStatus` for the readiness label;
- `ContinuumGeneratedFamilyInventoryEntry` for one family row;
- `ContinuumGeneratedFamilyInventory` for complete inventory validation;
- `createCurrentContinuumGeneratedFamilyInventory()` for the current v18
  source-fact inventory.

`profiled-fixture-witnessed` means the family is safe for translated
git-warp source-fact projection when the projection also uses generated
descriptor authority. `authored-only` means the family exists but must not be
treated as projection-ready yet.

## Non-Goals

- Do not parse Continuum Markdown in domain code.
- Do not make git-warp the authority for Continuum family semantics.
- Do not infer native Continuum witnesshood from inventory readiness.
- Do not load sibling repos at runtime.

## RED

Observed first failure:

```text
npx vitest run test/unit/domain/continuum/ContinuumGeneratedFamilyInventory.test.ts --reporter=verbose
Error: Cannot find module '../../../../src/domain/continuum/ContinuumGeneratedFamilyInventory.ts'
```

The test failed because the inventory nouns did not exist yet.

## GREEN

Implemented the runtime-backed inventory classes, exported them from the
package entry point, and updated BEARING task 12.

## Verification

```text
npx vitest run test/unit/domain/continuum/ContinuumGeneratedFamilyInventory.test.ts \
  test/unit/domain/index.exports.test.ts --reporter=verbose
npm run typecheck
npx eslint src/domain/continuum/ContinuumGeneratedFamilyStatus.ts \
  src/domain/continuum/ContinuumGeneratedFamilyInventoryEntry.ts \
  src/domain/continuum/ContinuumGeneratedFamilyInventory.ts \
  src/domain/continuum/createCurrentContinuumGeneratedFamilyInventory.ts \
  test/unit/domain/continuum/ContinuumGeneratedFamilyInventory.test.ts \
  test/unit/domain/index.exports.test.ts
npx markdownlint-cli2 docs/BEARING.md \
  docs/design/0160-v18-generated-family-inventory-refresh/v18-generated-family-inventory-refresh.md
```

The first lint pass rejected the inventory factory for exceeding the
max-lines-per-function limit. The GREEN implementation splits each family row
into a focused entry function.

## Closeout

Slice 12 gives later projections one complete, validated readiness inventory.
Receipt and settlement are projection-ready; neighborhood core and runtime
boundary are authored-only until Wesley profiles and fixtures exist.

## SSJS Scorecard

- Runtime-backed forms: expected green; inventory concepts are classes.
- Boundary validation: expected green; no raw sibling-repo parsing enters the
  domain.
- Behavior ownership: expected green; Continuum and Wesley authority stays
  descriptive, while git-warp only records projection readiness.
- Message parsing: expected green.
- Ambient time or entropy: expected green.
- Fake shape trust or cast-cosplay: expected green; readiness does not imply
  native witnesshood.

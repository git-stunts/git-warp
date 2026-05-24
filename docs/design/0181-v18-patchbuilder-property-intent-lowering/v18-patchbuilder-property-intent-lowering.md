---
cycle: 0181
task_id: V18_patchbuilder_property_intent_lowering
status: Complete
sponsors:
  human: James
  agent: Codex
started_at: 2026-05-23
release_home: v18.0.0
bearing_task: 33
promotes_backlog:
  - docs/method/backlog/v18.0.0/PROTO_legacy-props-as-projection.md
---

# V18 PatchBuilder Property Intent Lowering

## Sponsor Human

James.

## Sponsor Agent

Codex.

## Hill

Route `PatchBuilder` node and edge property writes through typed property
write intents before lowering to current compatibility patch operations.

## Playback Questions

- Does `PatchBuilder.setProperty()` construct a node property write intent?
- Does `PatchBuilder.setEdgeProperty()` construct an edge property write
  intent?
- Are invalid property keys rejected before patch operations are appended?
- Does lowering still emit current `NodePropSet` and `EdgePropSet` ops?
- Do existing public patch tests continue to pass?

## Existing Shape

`PatchBuilder` is the public write assembly surface. It already performs a
content-write intent step for content attachments, but ordinary property
writes still append compatibility property operations directly.

That direct path makes it harder to later move graph writes away from
property-bag semantics because there is no named intent boundary to preserve.

## Chosen Boundary

Keep public `PatchBuilder` methods stable. Internally, each generic property
write should:

- validate the target and key by constructing a write intent;
- validate or own the value according to current inline value rules;
- lower the intent into the existing patch operation class;
- append the lowered operation through the existing patch assembly flow.

This is a cutover of ownership, not persistence. The patch stream remains
legacy-compatible.

## Non-Goals

- Do not add new patch op wire shapes.
- Do not change public method return values.
- Do not change auto-materialization or reading-basis behavior.
- Do not route content writes through generic property intent.
- Do not change migration tooling.

## RED Plan

Add regression tests around `PatchBuilder`:

- malformed node property keys fail before an op is appended;
- malformed edge property targets fail before an op is appended;
- valid node property writes emit the same current patch op;
- valid edge property writes emit the same current patch op;
- content writes continue to use content attachment intent.

## GREEN Plan

Refactor the two property write methods to construct intent values. Keep the
lowering code small and named. If both methods need shared lowering code, use
a concept-named lowerer rather than a generic helper file.

Ensure the patch builder does not mutate an intent after construction.

## Verification

```text
npx vitest run test/unit/domain/services/PatchBuilderPropertyIntent.test.ts --reporter=verbose
npx eslint src/domain/services/PatchBuilder.ts test/unit/domain/services/PatchBuilderPropertyIntent.test.ts
npm run typecheck
npm run lint
npm run lint:sludge
git diff --check HEAD
```

## Closeout Criteria

- Generic property writes are intent-backed.
- Current patch operation output is unchanged for valid writes.
- Invalid inputs fail before patch append.
- The next slice can align graph-op projection with property projections.

## SSJS Scorecard

- Runtime-backed forms: green when writes pass through intent classes.
- Boundary validation: green when invalid inputs fail before op append.
- Behavior ownership: green when `PatchBuilder` assembles and intents
  validate/lower.
- Message parsing: green; no error-message parsing.
- Ambient time or entropy: green; no new ambient sources.
- Fake shape trust or cast-cosplay: green when no assertions are added.

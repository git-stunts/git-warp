---
cycle: 0184
task_id: V18_graph_model_migration_manifest
status: Complete
sponsors:
  human: James
  agent: Codex
started_at: 2026-05-23
release_home: v18.0.0
bearing_task: 36
promotes_backlog:
  - docs/method/backlog/v18.0.0/INFRA_graph-model-migration-tool.md
---

# V18 Graph Model Migration Manifest

## Sponsor Human

James.

## Sponsor Agent

Codex.

## Hill

Define runtime-backed migration manifest nouns before any migration script
tries to replay or rewrite graph-model history.

## Playback Questions

- Does the manifest have a versioned runtime-backed root object?
- Does it record source basis and target basis explicitly?
- Does it record node, edge, property, content, and attachment mappings?
- Does it separate warnings from hard migration errors?
- Can a dry-run planner emit the manifest without writing graph history?

## Existing Shape

The v18 backlog names a migration tool that replays legacy history, emits
migrated history, archives old lineage, and fails closed on replay
equivalence failure. There is no v18 migration directory yet. Starting with a
script would put the repo at risk of an under-specified migration record.

## Chosen Boundary

Create a design and later runtime nouns for the migration manifest:

- manifest version;
- source graph identity and reading basis;
- target graph identity and planned basis;
- legacy-to-v18 node mapping entries;
- legacy-to-v18 edge mapping entries;
- legacy property compatibility mapping entries;
- content attachment mapping entries;
- warnings;
- fatal planning failures.

The manifest root should be a domain concept. Serialization belongs in a later
adapter/script slice.

## Non-Goals

- Do not write migration output.
- Do not parse JSON in domain code.
- Do not shell out to Git from domain code.
- Do not implement genesis equivalence yet.
- Do not promise a manifest schema before tests cover invariants.

## RED Plan

Add tests that fail until manifest nouns exist:

- manifest construction requires source and target basis;
- duplicate legacy node mappings fail;
- duplicate legacy edge mappings fail;
- warnings and fatal errors are distinct;
- entries are immutable after construction.

## GREEN Plan

Implement manifest concepts as focused classes. Use named entry collections
instead of plain loose arrays if uniqueness rules matter. Keep source and
target basis as explicit runtime concepts or validated existing IDs.

Export only the stable manifest surface needed by the dry-run planner.

## Verification

```text
npx vitest run test/unit/domain/migrations/GraphModelMigrationManifest.test.ts --reporter=verbose
npx eslint src/domain/migrations test/unit/domain/migrations/GraphModelMigrationManifest.test.ts
npm run typecheck
npm run lint:sludge
git diff --check HEAD
```

## Evidence

The slice adds runtime-backed migration manifest nouns under
`src/domain/migrations/`:

- `GraphModelMigrationManifestVersion`;
- `GraphModelMigrationBasis`;
- node, edge, property, and content mapping entries;
- `GraphModelMigrationNotice`;
- `GraphModelMigrationManifest`.

The manifest constructor validates the source and target basis, freezes each
mapping section, rejects duplicate legacy node, edge, property, and content
mapping keys, and keeps warnings separate from fatal planning failures.
Expected migration planning failures are represented as notice values rather
than script side effects.

No serializer, Git adapter, filesystem access, wall-clock access, or graph
history write path was added in this slice.

## Closeout Criteria

- Migration manifest nouns exist and are covered by constructor tests.
- No serialization or filesystem code enters the domain.
- Dry-run planning can target a manifest root in the next slices.

## Closeout Outcome

The manifest root is ready for migration source inventory and dry-run planner
work. It is intentionally not yet a public API and intentionally not yet a
transport schema; slice 40 owns the adapter-boundary serialization surface.

## SSJS Scorecard

- Runtime-backed forms: green when the manifest and entries are frozen
  classes.
- Boundary validation: green when constructor checks enforce uniqueness and
  basis presence.
- Behavior ownership: green when manifest invariants live on manifest types.
- Message parsing: green; no behavior from text messages.
- Ambient time or entropy: green; no clocks or randomness.
- Fake shape trust or cast-cosplay: green when no assertions are added.

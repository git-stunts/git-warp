---
cycle: 0188
task_id: V18_migration_manifest_serialization
status: Complete
sponsors:
  human: James
  agent: Codex
started_at: 2026-05-23
release_home: v18.0.0
bearing_task: 40
promotes_backlog:
  - docs/method/backlog/v18.0.0/INFRA_graph-model-migration-tool.md
---

# V18 Migration Manifest Serialization

## Sponsor Human

James.

## Sponsor Agent

Codex.

## Hill

Add an adapter-boundary serializer for the migration manifest without letting
JSON parsing or loose transport shapes leak into domain code.

## Playback Questions

- Does manifest serialization live outside `src/domain/`?
- Does parsing validate the transport DTO before constructing domain nouns?
- Does the serializer preserve deterministic key ordering for fixtures?
- Are parse failures explicit and actionable?
- Can a dry-run CLI emit and reload a manifest safely?

## Existing Shape

The migration manifest will be a domain object. Scripts and operators need a
transport representation. The anti-sludge policy bans domain `JSON.parse` and
`JSON.stringify`, and the repo requires honest parser boundaries.

## Chosen Boundary

Place serialization under a scripts or infrastructure adapter path, not under
domain migration nouns. The adapter should define transport DTO classes or
parser functions with narrow validation, then construct domain manifest
objects.

The serialization format should be deterministic and fixture-friendly. If JSON
is used, only the adapter may parse or stringify it. Domain code should see
validated manifest objects.

## Non-Goals

- Do not write graph history.
- Do not add a public package API for migration manifests yet.
- Do not parse manifest JSON in domain code.
- Do not use `any`, `as any`, or loose `unknown` outside an allowed adapter
  parser boundary.
- Do not introduce version bumping.

## RED Plan

Add adapter tests that fail until serialization exists:

- a valid manifest round-trips through the adapter;
- malformed version fails closed;
- duplicate mapping entries fail during domain construction;
- serialized output is deterministic for a fixture manifest;
- adapter parse errors identify the failing field.

## GREEN Plan

Implement a narrow manifest serializer and parser. Keep transport DTO naming
explicit, such as `GraphModelMigrationManifestJson`, only in adapter code.
Avoid mirror types in domain code.

If parser validation is complex, split by manifest section rather than adding
a large generic manifest helper.

## Verification

```text
npx vitest run test/unit/infrastructure/adapters/GraphModelMigrationManifestJsonAdapter.test.ts --reporter=verbose
npx eslint src/infrastructure/adapters/GraphModelMigrationManifestJsonAdapter.ts test/unit/infrastructure/adapters/GraphModelMigrationManifestJsonAdapter.test.ts
npm run typecheck
npm run lint
npm run lint:sludge
git diff --check HEAD
```

## Evidence

The slice adds `GraphModelMigrationManifestJsonAdapter` under
`src/infrastructure/adapters/` plus focused adapter tests. The adapter:

- serializes a `GraphModelMigrationManifest` into deterministic JSON text;
- parses valid JSON into runtime-backed domain manifest nouns;
- keeps `JSON.parse` and `JSON.stringify` outside `src/domain/`;
- reports malformed transport fields with field-specific errors;
- lets domain construction enforce manifest invariants such as duplicate
  mapping rejection.

No public package API, CLI, graph-history write path, version bump, or domain
JSON parser was added.

## Closeout Criteria

- Manifest serializer exists outside domain code.
- Round-trip and malformed input tests pass.
- Deterministic fixture output is covered.
- The dry-run CLI can emit a manifest in the next slice.

## Closeout Outcome

The dry-run manifest has a transport boundary ready for the future CLI. The
next batch can focus on operator command wiring and equivalence evidence
without moving JSON concerns into the migration domain model.

## SSJS Scorecard

- Runtime-backed forms: green when parsed DTOs construct domain manifest
  classes.
- Boundary validation: green when untrusted JSON is validated at adapter
  entry.
- Behavior ownership: green when serialization stays outside domain.
- Message parsing: green; diagnostics are not behavior inputs.
- Ambient time or entropy: green; serialization is deterministic.
- Fake shape trust or cast-cosplay: green when adapter parsing avoids loose
  casts and domain receives honest values.

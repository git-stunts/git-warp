---
cycle: 0207
task_id: V18_scratch_runtime_conformance_provider
status: Complete
sponsors:
  human: James
  agent: Codex
started_at: 2026-05-24
completed_at: 2026-05-24
release_home: v18.0.0
bearing_task: 59
promotes_backlog:
  - docs/method/backlog/v18.0.0/INFRA_graph-model-migration-tool.md
---

# V18 Scratch Runtime Conformance Provider

## Hill

Replace test-supplied runtime conformance evidence with an adapter-level
provider that reads scratch migration history back from Git before
finalization can trust it.

## Closeout

Slice 59 added `GraphModelMigrationScratchRuntimeConformanceProvider`. The
provider verifies that the scratch ref still points at the expected scratch
head, then builds scratch genesis-equivalence evidence from the actual
operation commits.

This is intentionally an operation-history readback provider. It does not yet
claim full production runtime replay through the normal graph-opening path.

## Verification

```text
npx vitest run test/unit/scripts/v18-scratch-runtime-conformance-provider.test.ts --reporter=verbose
npx vitest run test/unit/scripts/v18-migration-command.test.ts --reporter=verbose
```

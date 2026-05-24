---
cycle: 0209
task_id: V18_provider_divergence_coverage
status: Completed
sponsors:
  human: James
  agent: Codex
started_at: 2026-05-24
completed_at: 2026-05-24
release_home: v18.0.0
bearing_task: 61
promotes_backlog:
  - docs/method/backlog/v18.0.0/TRUST_genesis-replay-equivalence.md
---

# V18 Provider Divergence Coverage

## Hill

Prove that provider-built scratch readings still block finalization when they
diverge from the legacy reading.

## Closeout

Slice 61 added command coverage where scratch history is written, read back
from Git through the scratch reading provider, and proven readable by the
runtime conformance provider, but finalization still refuses promotion because
the legacy reading disagrees with the scratch reading.

## Verification

```text
npx vitest run test/unit/scripts/v18-migration-command.test.ts --reporter=verbose
```

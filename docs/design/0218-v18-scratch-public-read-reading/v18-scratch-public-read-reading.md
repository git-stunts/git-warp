---
cycle: 0218
task_id: V18_scratch_public_read_reading
status: Complete
sponsors:
  human: James
  agent: Codex
started_at: 2026-05-24
completed_at: 2026-05-24
release_home: v18.0.0
bearing_task: 70
---

# V18 Scratch Public-Read Reading

## Hill

Construct the migrated side of genesis equivalence from materialized
production-runtime state after scratch replay, rather than from the scratch
operation log alone.

## Design

The scratch public-read builder verifies the scratch ref head, replays scratch
operation commits through the shared production-runtime replay core, materializes
an immutable runtime snapshot, and projects visible nodes, edges, scalar node
properties, and node content attachments into `GenesisEquivalenceReading` facts.

The replay core is factored into a shared script module so finalization
conformance and scratch public-read construction exercise the same parser,
operation ordering, patch commit path, and materialization path.

## Acceptance Criteria

- Node and edge facts come from materialized runtime visibility.
- Property facts come from decoded public snapshot property keys and scalar
  values.
- Content attachment facts come from materialized `_content` registers while
  `_content.mime` and `_content.size` remain metadata, not equivalence facts.
- Scratch-head drift blocks readback before replay.

## Test Plan

Unit tests write scratch history, replay it through the public-read builder,
assert deterministic node, edge, and property facts, assert content attachment
projection from materialized runtime state, and assert closed failure on
scratch-head drift.

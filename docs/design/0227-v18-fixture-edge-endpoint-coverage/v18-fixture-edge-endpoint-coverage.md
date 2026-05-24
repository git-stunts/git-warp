---
cycle: 0227
task_id: V18_fixture_edge_endpoint_coverage
status: Complete
sponsors:
  human: James
  agent: Codex
started_at: 2026-05-24
completed_at: 2026-05-24
release_home: v18.0.0
bearing_task: 79
---

# V18 Fixture Edge Endpoint Coverage

## Hill

Make the canonical v17 fixture edge public-readable by declaring both endpoint
nodes as visible fixture facts.

## Design

The fixture manifest now includes `node:beta`, the target endpoint for
`node:alpha->node:beta:relates`. The wet-run harness already derives node
mappings from visible node facts, so scratch replay now creates both endpoints
before adding the edge. The scratch public-read builder can then project the
edge from materialized runtime state.

This treats endpoint visibility as part of the fixture contract instead of
teaching the public-read builder to surface dangling edges.

## Acceptance Criteria

- The canonical fixture manifest declares the edge target endpoint.
- Wet-run scratch history includes the additional endpoint node operation.
- Runtime replay operation count increases from four to five.
- The edge visibility mismatch is removed.
- The wet-run mismatch count drops from three to two.

## Test Plan

Unit tests assert the additional visible node fact in legacy readings, assert
wet-run scratch/replay operation counts of five, and assert the report no
longer contains the edge mismatch.

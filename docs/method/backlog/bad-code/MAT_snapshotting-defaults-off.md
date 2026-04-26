---
id: MAT_snapshotting-defaults-off
blocked_by: []
blocks: []
feature: materialization-snapshotting
release_home: v17.0.0
---

# Materialization snapshotting is off by default

**Effort:** M

## What's Wrong

By default, git-warp is not creating materialization snapshots. Seeking
also does not create materialization snapshots by default.

That default is backwards for the expected runtime posture. A graph
database should preserve useful materialization anchors unless the user
explicitly disables them. Repeated seeks/materializations should not
silently throw away durable resume points and force future work to start
from cold history.

## Why This Matters

The v17 direction assumes streaming, resumable, bounded-memory graph
operations. Snapshotting is part of that architecture, not an optional
optimization. Without default-on snapshots, callers pay unnecessary
replay cost and long-running agents have fewer stable witnesses to
resume from.

## Suggested Fix

Define an explicit snapshot policy:

- Snapshotting is enabled by default for materialization.
- Seeking creates materialization snapshots by default when it crosses
  the configured policy threshold.
- Users can opt out explicitly with a named option, not by relying on
  the absence of configuration.
- Snapshot creation must remain streaming-aware and must not assume the
  full graph fits in memory beyond the materialized state already being
  produced.
- Retention/compaction should be explicit so default-on snapshotting
  does not become unbounded repository growth.

## Acceptance

- Default graph open/materialize behavior has snapshotting enabled.
- Default seek behavior creates snapshots according to the policy.
- Tests prove the default path writes snapshots.
- Tests prove explicit opt-out suppresses snapshot writes.
- Docs state the default snapshot policy and retention implications.

---
cycle: 0212
task_id: V18_public_release_blockers
status: Completed
sponsors:
  human: James
  agent: Codex
started_at: 2026-05-24
completed_at: 2026-05-24
release_home: v18.0.0
bearing_task: 64
promotes_backlog:
  - docs/method/backlog/v18.0.0/RELEASE_v18-public-release-blockers.md
---

# V18 Public Release Blockers

## Hill

Make the remaining public-release blockers explicit before the migration
command looks more complete than its evidence.

## Closeout

Slice 64 added a v18 release-blocker backlog note. The blockers call out
production-runtime scratch replay, live finalization CLI design, wet-run
fixture harnessing, generated Continuum contract tie-back, and release notes
that preserve the sibling-participant doctrine.

## Verification

```text
npm run lint:md
```

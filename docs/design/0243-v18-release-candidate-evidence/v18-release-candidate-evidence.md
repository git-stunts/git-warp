---
cycle: 0243
task_id: V18_release_candidate_evidence
status: Complete
sponsors:
  human: James
  agent: Codex
started_at: 2026-05-24
completed_at: 2026-05-24
release_home: v18.0.0
bearing_task: 95
---

# V18 Release Candidate Evidence

## Hill

Cut the v18 release-candidate evidence packet without pretending this branch
is already a release tag.

## Design

The release candidate packet lives at
`docs/releases/v18.0.0-rc/README.md`. It names:

- candidate scope;
- inspectable evidence points;
- go/no-go gates for a release-candidate PR;
- stricter gates required before a public v18 tag;
- residual risks around legacy content/property compatibility and translated
  Continuum evidence.

`CHANGELOG.md` receives an Unreleased entry summarizing the v18 release
candidate evidence. BEARING marks the slice complete and points at this design
record.

## Acceptance Criteria

- A release-candidate evidence packet exists.
- The packet distinguishes PR readiness from public tag readiness.
- The packet names generated-contract evidence and residual translated
  witnesshood risk.
- The changelog summarizes the candidate evidence.
- BEARING marks slice 95 complete.

## Test Plan

Run Markdown lint against BEARING, CHANGELOG, this design document, and the
release-candidate packet. Run the unit suite, typecheck, and `git diff --check`
as final local checks for this branch batch.

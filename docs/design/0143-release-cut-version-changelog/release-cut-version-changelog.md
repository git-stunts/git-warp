---
cycle: 0143
task_id: REL_release-cut-version-changelog
status: Final
sponsors:
  human: James
  agent: Codex
started_at: 2026-05-05
release_home: v17.0.0
---

# Release Cut Version Changelog

## Pull

`REL_release-cut-version-changelog` opened after
`0142-full-gate-matrix-green`. Its job is release packaging only: prove version
agreement, move the current release notes out of `[Unreleased]`, and keep the
v17 claim aligned with the 0123 bounded-query decision.

## Hill

The v17 release cut has matching package versions, one dated `17.0.0`
changelog section for the actual release date, and release notes that say what
v17 does and does not claim.

## Playback Questions

1. Do `package.json` and `jsr.json` both say `17.0.0`?
2. Does `CHANGELOG.md` contain a dated `17.0.0` entry for the May 5 release
   cut?
3. Do the release notes preserve the 0123 decision that live large-graph
   bounded `graph.query()` residency remains post-v17?
4. Does the next open DAG node become `REL_release-preflight-and-rc`?

## User Stories

- As a release operator, I can run the release preflight without a false
  changelog-date blocker.
- As a consumer, I can read the v17 release notes and understand that the
  public materialization frontdoor is gone.
- As a maintainer, I can see that live-tail bounded query residency is still a
  documented post-v17 substrate task, not a silent release promise.

## Requirements

- Do not change production code.
- Do not bump versions; the package is already at `17.0.0`.
- Keep a clean dated changelog entry for `17.0.0`.
- Preserve the honest scope from
  `docs/design/0123-v17-release-scope-and-bounded-query-blocker.md`.
- Mark this node complete in the DAG status and SVG.

## Acceptance Criteria

- `package.json` and `jsr.json` agree on `17.0.0`.
- `CHANGELOG.md` has `## [17.0.0] — 2026-05-05`.
- `docs/releases/v17.0.0/README.md` explicitly says v17 does not claim live
  large-graph bounded `graph.query()` residency over stale checkpoint plus live
  tail.
- `REL_release-cut-version-changelog` is complete in the DAG.
- `REL_release-preflight-and-rc` is the only open node.

## Test Plan

### RED

- `rg -n "^## \[17\.0\.0\] — 2026-05-05$" CHANGELOG.md` failed before the
  edit.
- `rg -n "does not claim live large-graph bounded"
  docs/releases/v17.0.0/README.md` failed before the edit.
- `rg -n "stale checkpoint plus live tail"
  docs/releases/v17.0.0/README.md` failed before the edit.

### Goldens

- Version agreement remains `package.json == jsr.json == 17.0.0`.
- The changelog has the May 5 `17.0.0` heading.
- The release note names the post-v17 live-tail bounded query/checksum blocker.

### Known Fails

- Full release preflight is deliberately left to the next DAG node because this
  cycle edits release files and therefore cannot satisfy the clean-tree
  preflight guard until committed.

### Stress / Jitter

- Not applicable to product runtime behavior. The jitter risk here is release
  metadata drift, so the validation focuses on deterministic text and doc gates.

## Playback

1. Do `package.json` and `jsr.json` both say `17.0.0`?
   Yes.
2. Does `CHANGELOG.md` contain a dated `17.0.0` entry for May 5?
   Yes.
3. Do the release notes preserve the 0123 bounded-query decision?
   Yes.
4. Does the next open DAG node become `REL_release-preflight-and-rc`?
   Yes.

## Closeout

`REL_release-cut-version-changelog` is complete. The next open node is
`REL_release-preflight-and-rc`.

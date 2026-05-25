---
cycle: 0246
task_id: V18_release_gate_baseline
status: Complete
sponsors:
  human: James
  agent: Codex
started_at: 2026-05-25
completed_at: 2026-05-25
release_home: v18.0.0
bearing_task: 98
---

# V18 Release Gate Baseline

## Hill

Run the release-prep gate set before changing package metadata so the branch
starts from known-good evidence.

## Evidence

The following gates passed on branch `v18-release-prep-slices-97-102`:

| Gate | Result |
|------|--------|
| `npm run lint` | Pass |
| tracked Markdown lint via `git ls-files '*.md' \| xargs npx markdownlint` | Pass |
| `npm run typecheck:src` | Pass |
| `npm run typecheck:test` | Pass |
| `npm run test:local` | Pass, 521 files and 7126 tests |
| `npm run release:preflight` | Pass for current `17.0.1` metadata |

`release:preflight` produced the expected branch warning because release-prep
work runs before merge to `main`. It also reported one moderate npm audit item
and no high or critical runtime vulnerabilities.

## Local Workspace Note

`npm run lint:md` failed locally only because the untracked side-project file
`TECHNICAL_TEARDOWN.md` contains unlabeled fenced code blocks. That file is not
tracked and is not part of the release branch. Tracked Markdown passed.

## Interpretation

The branch has a clean pre-version baseline. The public v18 release still
requires a second preflight after `package.json`, `jsr.json`,
`package-lock.json`, and `CHANGELOG.md` move to `18.0.0`.

## Test Plan

- Preserve this evidence in `BEARING`.
- Re-run release preflight after slice 101 version metadata changes.

# V18 Final Release-Prep Replan

## Hill

Close the release-prep slice series with evidence in hand and narrow the
remaining `v18.0.0` work to PR review, CI, merge, tag, and publish.

## Evidence

The branch now carries `18.0.0` release metadata and has passed the local
release preflight:

```text
npm run release:preflight
```

Hard-gate result:

- package and JSR versions agree at `18.0.0`;
- tracked working tree was clean for preflight;
- changelog has a dated `18.0.0` entry;
- ESLint passed;
- source typecheck passed;
- type policy passed;
- consumer type surface passed;
- declaration surface passed;
- unit tests with coverage passed: 521 files, 7126 tests;
- npm pack dry-run passed;
- packed artifact smoke passed;
- JSR publish dry-run passed;
- npm audit reported no high or critical vulnerabilities.

Expected non-blocking notes:

- preflight warned that this branch is not `main`;
- npm audit reported one moderate advisory under
  `glob/node_modules/brace-expansion`.

## Discovery During Preflight

The first preflight run found a stale release-policy test that still expected
`17.0.1` after the metadata moved to `18.0.0`. That was fixed in commit
`70675784`, and the focused release-policy test passed before the full
preflight was rerun.

## Remaining Public-Release Gate

The branch is locally ready for PR review, but not yet a public release.
Remaining gates are:

- open or update the release-prep PR to `main`;
- resolve all PR feedback;
- wait for GitHub CI to pass on the final branch tip;
- merge to `main`;
- tag `v18.0.0` from merged `main`;
- publish npm and JSR artifacts from the tagged release path.

## Replan

Do not expand v18 scope now. The public release promise is graph-model
convergence and guarded migration proof, with residual raw content/property
compatibility risk stated explicitly.

The next engineering goalpost after `v18.0.0` is a post-release planning slice
that decides whether to continue storage-plane retirement first or start the
v19 native Continuum witnesshood runway. End-to-end graph streaming reads and
writes stay out of v18 and belong in the later v20 graph-execution goalpost.

## Acceptance Criteria

- `docs/BEARING.md` marks slice 102 complete.
- The v18 public-release blocker ledger treats local release preflight as
  complete and leaves PR review, CI, tag, and publish as the live blockers.
- No tag is cut from the feature branch.
- The unrelated untracked `TECHNICAL_TEARDOWN.md` file remains unstaged.

## Test Plan

- `npm exec vitest run test/unit/scripts/release-policy-shape.test.ts`
- `npm run release:preflight`
- `npx markdownlint` on edited release-prep docs.
- `git diff --check`

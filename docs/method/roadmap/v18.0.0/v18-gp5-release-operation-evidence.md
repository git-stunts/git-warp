# V18-GP5 Release Operation Evidence

## Identity

| Field | Value |
| --- | --- |
| Goalpost id | `v18.0.0-gp5-release-operation-evidence` |
| Release home | `v18.0.0` |
| Umbrella issue | `https://github.com/git-stunts/git-warp/issues/552` |
| Goalpost doc | `docs/method/roadmap/v18.0.0/v18-gp5-release-operation-evidence.md` |
| Design cycle | `docs/design/0252-v18-tag-publish-gate/v18-tag-publish-gate.md` |
| Slice budget | `6` |
| Status | `active` |
| Sponsor human | `James` |
| Sponsor agent | `Codex` |

## Outcome

The public v18 release is tagged and published only after the release policy
gates pass, evidence is deterministic and placeholder-free, and registry
results are recorded.

## Current Truth

Issue [#552](https://github.com/git-stunts/git-warp/issues/552) is open in
`lane:v18.0.0` and records that package metadata exists but no public
`v18.0.0` tag, npm publish evidence, JSR publish evidence, or final release
evidence exists yet.

## Scope

- Release evidence packet completion.
- `npm run release:prep` before release-prep PR merge.
- `npm run release:preflight` from aligned `main`.
- Tag and publish evidence.
- Changelog, docs, roadmap, and bearing review.
- Registry result and GitHub Release evidence.

## Out Of Scope

- Fixing runtime blockers from GP1 through GP4.
- Publishing before issue and test gates are green.
- Rewriting release history or amending commits.

## Proof Stories

| Story issue | Actor | Need | Reason | Slice budget |
| --- | --- | --- | --- | ---: |
| [#552](https://github.com/git-stunts/git-warp/issues/552) | release operator | deterministic release packet and passing policy gates | public tags and registry versions must be reproducible and auditable | 6 |

## Slice Budget

| Slice | Status | Description | Expected proof |
| ---: | --- | --- | --- |
| 1 | open | Complete release evidence packet and remove placeholders. | docUpdate |
| 2 | open | Run branch-local release prep on release-prep branch. | witness |
| 3 | open | Merge release-prep PR and align local `main`. | issueUpdate |
| 4 | open | Run final local release preflight from aligned `main`. | witness |
| 5 | open | Create and push public release tag. | witness |
| 6 | open | Record npm, JSR, and GitHub Release evidence and close #552. | docUpdate |

## Acceptance Criteria

- [ ] Zero open `priority:asap` issues.
- [ ] Zero open issues in the GitHub `v18.0.0` milestone.
- [ ] Zero open issues in prior-release GitHub milestones.
- [ ] Every open issue carries exactly one `type:*`, `priority:*`,
      `status:*`, and `area:*` label.
- [ ] Zero failing tests.
- [ ] Release evidence packet has no `TBD`, `0/N`, or angle-bracket
      placeholders.
- [ ] npm, JSR, and GitHub Release evidence agree on the tag version.

## Deterministic Evidence

| Claim | Canonical fixture or input | Witness | Replay command | Expected deterministic result |
| --- | --- | --- | --- | --- |
| Branch-local release prep is green. | Release-prep branch commit. | `npm run release:prep` output. | `npm run release:prep` | Branch-local release gates pass. |
| Final release preflight is green. | Aligned `main` tag commit. | `npm run release:preflight` output. | `npm run release:preflight` | Final tag-time gates pass. |
| Registries published the intended version. | Public tag and registry records. | npm, JSR, and GitHub Release URLs. | Registry inspection commands from release evidence packet. | Registry versions and dist-tags match release intent. |

## Observer Geometry

| Reading claim | Basis | Aperture | Law/projection | Support obligations | Witness posture |
| --- | --- | --- | --- | --- | --- |
| Release evidence posture. | Tag commit and release evidence packet. | Release policy gate set. | Release guard stage law. | GitHub issue state, tests, docs, changelog, registry state, and residual-risk records. | Release guard, preflight, CI, and registry witnesses. |

## Validation Plan

```bash
npm run release:prep
npm run release:preflight
```

## Release Gate Impact

This is the final public-release goalpost. It cannot land until GP1 through GP4
are landed or explicitly superseded, because tag-time policy requires zero open
target-lane issues and complete release evidence.

## Residual Risks

| Risk | Rationale | Owner | Follow-up issue |
| --- | --- | --- | --- |
| Registry rerun may be needed after tag creation. | The staged release guard allows `rerun-workflow` only for existing-tag registry recovery. | `@git-stunts` | [#552](https://github.com/git-stunts/git-warp/issues/552) |

## Closeout

- [ ] Slices complete or honestly dispositioned.
- [ ] Proof matrix replayed.
- [ ] Goalpost issue updated.
- [ ] Release evidence updated.
- [ ] Registry evidence recorded.

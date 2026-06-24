# Release Evidence Template

Copy this template to `docs/releases/vX.Y.Z/README.md` during release prep and
fill it before tagging. A release tag must not be created from an incomplete
evidence packet. The completed packet must not contain template placeholders
such as `TBD`, `0/N`, or angle-bracket placeholder fields.

## Release Identity

| Field | Value |
| --- | --- |
| Target tag | `vX.Y.Z` |
| Previous public tag | `vX.Y.Z` |
| Tag commit SHA | `TBD` |
| Release PR | `TBD` |
| Release operator | `TBD` |
| Reviewers | `TBD` |
| Canonical fixture root | `docs/releases/vX.Y.Z/fixtures/` or `not applicable` |
| Witness root | `docs/releases/vX.Y.Z/README.md` or `TBD` |

## Issue gates

Paste or summarize the `npm run release:guard -- --tag vX.Y.Z` output.

| Gate | Result | Evidence |
| --- | --- | --- |
| `REL-TOOL-NODE` | `TBD` | Node.js available for metadata checks and tag inference. |
| `REL-TOOL-GIT` | `TBD` | Git available for worktree and ancestry checks. |
| `REL-TOOL-GH` | `TBD` | GitHub CLI available when live issue gates are required, or not required for this stage. |
| `REL-TAG-FORMAT` | `TBD` | Tag uses leading-`v` SemVer. |
| `REL-GH-ACCESS` | `TBD` | GitHub repository readable when live issue gates are required. |
| `REL-GH-PRIORITY-ASAP-LABEL` | `TBD` | Required `priority:asap` label exists. |
| `REL-GH-ASAP-ZERO` | `TBD` | No open `priority:asap` issues. |
| `REL-GH-TARGET-MILESTONE-EXISTS` | `TBD` | Target GitHub Milestone exists. |
| `REL-GH-TARGET-MILESTONE-ZERO` | `TBD` | No open issues in the target GitHub Milestone. |
| `REL-GH-PRIOR-RELEASE-MILESTONES` | `TBD` | All release GitHub Milestones use release SemVer. |
| `REL-GH-PRIOR-RELEASE-ZERO` | `TBD` | No open issues in prior release GitHub Milestones. |
| `REL-GH-STAGE` | `TBD` | Stage-specific issue gate posture recorded. |
| `REL-META-VERSION-LOCKSTEP` | `TBD` | Package, JSR, lockfile, and workspace versions match. |
| `REL-GIT-CLEAN` | `TBD` | Worktree clean at tag time. |
| `REL-GIT-STAGE` | `TBD` | Branch-prep posture recorded, if applicable. |
| `REL-GIT-ORIGIN-MAIN` | `TBD` | Tag commit equals `origin/main`. |
| `REL-DOC-CHANGELOG-DATED` | `TBD` | Dated changelog entry exists. |
| `REL-DOC-EVIDENCE` | `TBD` | This evidence packet is complete. |

## Deterministic reproducibility

Evidence must be replayable from the tag commit, this release packet, and named
immutable inputs. A witness records the observed output or proof. A canonical
fixture records the input required to reproduce that witness.

Use `not applicable` only when the command depends solely on repository state at
the tag commit and live policy state already captured by the witness. Otherwise,
commit the fixture under `docs/releases/vX.Y.Z/fixtures/` or cite an existing
committed fixture.

| Claim or gate | Replay command | Canonical fixture or input | Witness | Expected deterministic result |
| --- | --- | --- | --- | --- |
| Release guard | `npm run release:guard -- --tag vX.Y.Z` | tag commit, GitHub issue labels captured in witness | `TBD` | All gates pass. |
| Changelog diff review | `git diff --stat vPREV..vX.Y.Z` | previous public tag and target tag | `TBD` | Changelog summarizes externally meaningful changes. |
| Package publishability | `npm pack --dry-run` | tag commit | `TBD` | File list and package metadata match release intent. |
| JSR publishability | `npx -y jsr publish --dry-run` | tag commit | `TBD` | Dry-run succeeds for the tag version. |
| Public behavior claim | `TBD` | `docs/releases/vX.Y.Z/fixtures/...` or existing fixture path | `TBD` | `TBD` |

## Goalpost evidence

Every landed goalpost that contributes to this release must be named here. If a
goalpost was superseded or moved out of scope for this version, record the issue
disposition and follow-up issue.

| Goalpost | Issue | Doc | Landed PRs | Slices complete | Proof matrix | Fixtures or inputs | Witnesses | Replay commands | Residual risk |
| --- | --- | --- | --- | ---: | --- | --- | --- | --- | --- |
| `TBD` | `TBD` | `TBD` | `TBD` | `0/N` | `TBD` | `TBD` | `TBD` | `TBD` | `TBD` |
| `single-issue exception` | `TBD` | `not goalpost-shaped` | `TBD` | `not applicable` | `TBD` | `TBD` | `TBD` | `TBD` | `Reason and follow-up issue required.` |

## Canonical fixtures and witnesses

Supply canonical fixtures with witnesses whenever evidence depends on runtime
data, generated output, graph shape, storage contents, migration input, package
artifact contents, replayed bugs, CLI transcript input, large-graph topology, or
performance/size proof.

| Fixture or input | Witness | Replay command | Stable digest or normalized output | Notes |
| --- | --- | --- | --- | --- |
| `not applicable` | `TBD` | `TBD` | `TBD` | Replace this row when fixtures are required. |

## Validation

Record the exact commands and outcomes used for release proof.

| Command | Result | Notes |
| --- | --- | --- |
| `npm run release:guard -- --tag vX.Y.Z` | `TBD` | |
| `npm run lint` | `TBD` | |
| `npm run lint:md` | `TBD` | |
| `npm run lint:md:code` | `TBD` | |
| `npm run lint:links` | `TBD` | |
| `npm run typecheck` | `TBD` | |
| `npm run typecheck:policy` | `TBD` | |
| `npm run typecheck:consumer` | `TBD` | |
| `npm run typecheck:surface` | `TBD` | |
| `npm run test:coverage:ci` | `TBD` | |
| `npm pack --dry-run` | `TBD` | |
| `bash scripts/smoke-packed-artifact.sh` | `TBD` | |
| `npx -y jsr publish --dry-run` | `TBD` | |
| `npm audit --omit=dev --audit-level=high` | `TBD` | |

## Documentation review

Every row must either name the commit that updated the document or say
`reviewed, no change` with a reason. Claims about behavior should cite a test,
source file, design, or release evidence row.

| Document | Disposition | Evidence |
| --- | --- | --- |
| `CHANGELOG.md` | `TBD` | Diff since previous public tag is accurately summarized. |
| `README.md` | `TBD` | Front-door release status, install, examples, and docs links reviewed. |
| `ARCHITECTURE.md` | `TBD` | Architecture, ports, adapters, storage model, and public/core boundary reviewed. |
| `docs/topics/index.md` | `TBD` | Topic router and public docs map reviewed. |
| `docs/topics/getting-started.md` | `TBD` | First-use workflow reviewed. |
| `docs/topics/optics.md` | `TBD` | Optic setup, read basis, and noun status reviewed. |
| `docs/topics/observers.md` | `TBD` | Aperture and redaction posture reviewed. |
| `docs/topics/bounded-reads.md` | `TBD` | Cost labels match provider truth. |
| `docs/topics/querying.md` | `TBD` | Builder workflows reviewed. |
| `docs/topics/api-reference.md` | `TBD` | Public API surface, examples, errors, and appendices reviewed. |
| `docs/topics/git-substrate.md` | `TBD` | Substrate, trust, replay, and performance claims reviewed. |
| `docs/topics/cli.md` | `TBD` | Operator workflows and command claims reviewed. |
| `docs/migrations/vX.Y.Z.md` | `TBD` | Migration guidance reviewed, if applicable. |
| `docs/releases/vX.Y.Z/README.md` | `TBD` | Release evidence packet complete. |

## Changelog Diff Review

Summarize the diff from the previous public tag to the tag commit. The
changelog must reflect externally meaningful changes and must not claim
unproven behavior.

| Area | Included in changelog? | Evidence |
| --- | --- | --- |
| Public API | `TBD` | |
| CLI/operator behavior | `TBD` | |
| Storage/substrate behavior | `TBD` | |
| Migration/release behavior | `TBD` | |
| Documentation-only changes | `TBD` | |
| Breaking or deprecating changes | `TBD` | |

## Accepted residual risks

Hidden accepted failures are not allowed. If there are no accepted risks, say
`None`.

| Risk | Rationale | Owner | Follow-up issue |
| --- | --- | --- | --- |
| `TBD` | `TBD` | `TBD` | `TBD` |

## Registry evidence

Fill after publish.

| Registry | Result | Evidence |
| --- | --- | --- |
| npm | `TBD` | Package/version, dist-tag, provenance evidence. |
| JSR | `TBD` | Package/version evidence. |
| GitHub Release | `TBD` | Release URL and generated notes status. |

# Release Evidence Template

Copy this template to `docs/releases/vX.Y.Z/README.md` during release prep and
fill it before tagging. A release tag must not be created from an incomplete
evidence packet.

## Release Identity

| Field | Value |
| --- | --- |
| Target tag | `vX.Y.Z` |
| Previous public tag | `vX.Y.Z` |
| Tag commit SHA | `TBD` |
| Release PR | `TBD` |
| Release operator | `TBD` |
| Reviewers | `TBD` |

## Issue gates

Paste or summarize the `npm run release:guard -- --tag vX.Y.Z` output.

| Gate | Result | Evidence |
| --- | --- | --- |
| `REL-GH-ASAP-ZERO` | `TBD` | No open `lane:asap` issues. |
| `REL-GH-TARGET-LANE-ZERO` | `TBD` | No open target-version lane issues. |
| `REL-GH-PRIOR-RELEASE-ZERO` | `TBD` | No open prior-release-home issues. |
| `REL-META-VERSION-LOCKSTEP` | `TBD` | Package, JSR, lockfile, and workspace versions match. |
| `REL-GIT-CLEAN` | `TBD` | Worktree clean at tag time. |
| `REL-GIT-ORIGIN-MAIN` | `TBD` | Tag commit equals `origin/main`. |
| `REL-DOC-CHANGELOG-DATED` | `TBD` | Dated changelog entry exists. |
| `REL-DOC-EVIDENCE` | `TBD` | This evidence packet is complete. |

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
| `TECHNICAL_TEARDOWN.md` | `TBD` | Technical overview and public API posture reviewed. |
| `docs/ARCHITECTURE.md` | `TBD` | Architecture, ports, adapters, storage model, and public/core boundary reviewed. |
| `docs/GETTING_STARTED.md` | `TBD` | First-use workflow reviewed. |
| `docs/READINGS_AND_OPTICS.md` | `TBD` | Readings, observers, optics, and boundedness claims reviewed. |
| `docs/GUIDE.md` | `TBD` | Builder workflows reviewed. |
| `docs/API_REFERENCE.md` | `TBD` | Public API surface, examples, errors, and appendices reviewed. |
| `docs/PUBLIC_API_COSTS.md` | `TBD` | Cost labels match provider truth. |
| `docs/ADVANCED_GUIDE.md` | `TBD` | Advanced substrate, trust, and performance claims reviewed. |
| `docs/CLI_GUIDE.md` | `TBD` | Operator workflows and command claims reviewed. |
| `docs/CONCEPTUAL_OVERVIEW.md` | `TBD` | Conceptual claims reviewed. |
| `docs/migrations/vX.Y.Z.md` | `TBD` | Migration guidance reviewed, if applicable. |
| `docs/ROADMAP.md` | `TBD` | Public release, next release, and issue counts reviewed. |
| `docs/BEARING.md` | `TBD` | Release posture and current direction reviewed. |
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

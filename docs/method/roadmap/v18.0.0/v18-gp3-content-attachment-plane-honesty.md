# V18-GP3 Content Attachment Plane Honesty

## Identity

| Field | Value |
| --- | --- |
| Goalpost id | `v18.0.0-gp3-content-attachment-plane-honesty` |
| Release home | `v18.0.0` |
| Umbrella issue | `https://github.com/git-stunts/git-warp/issues/550` |
| Goalpost doc | `docs/method/roadmap/v18.0.0/v18-gp3-content-attachment-plane-honesty.md` |
| Design cycle | `docs/specs/CONTENT_ATTACHMENT.md` |
| Slice budget | `4` |
| Status | `landed` |
| Sponsor human | `James` |
| Sponsor agent | `Codex` |

## Outcome

The v18 release tells the truth about content attachment-plane progress:
runtime content attachment evidence is named, legacy `_content*` storage
compatibility is explicitly bounded as residual risk, and public docs do not
claim total storage-plane retirement.

## Current Truth

Issue [#550](https://github.com/git-stunts/git-warp/issues/550) is closed as a
v18 honesty gate, not as total storage-plane retirement. Its evidence records
completed content payload and projection progress, names the remaining legacy
`_content*` compatibility boundaries, and carries full storage-plane retirement
forward to [#646](https://github.com/git-stunts/git-warp/issues/646).

## Scope

- Content attachment-plane claim review.
- Residual legacy storage-boundary evidence.
- Public docs and release evidence wording.
- Follow-up issue routing for storage-plane retirement beyond v18.

## Out Of Scope

- Total retirement of every legacy content storage boundary in v18.
- Native Continuum attachment semantics.
- Broad content streaming work covered by V18-GP2.

## Proof Stories

| Story issue | Actor | Need | Reason | Slice budget |
| --- | --- | --- | --- | ---: |
| [#550](https://github.com/git-stunts/git-warp/issues/550) | maintainer | honest attachment-plane release claim and residual-risk record | v18 must not overclaim storage-plane completeness | 4 |

## Slice Budget

| Slice | Status | Description | Expected proof |
| ---: | --- | --- | --- |
| 1 | complete | Re-audit content attachment progress against current source and specs. | docUpdate |
| 2 | complete | Replay or add content attachment equivalence evidence. | test |
| 3 | complete | Update release docs to name accepted legacy boundaries precisely. | docUpdate |
| 4 | complete | Close or carry forward #550 with storage-plane follow-up issue. | issueUpdate |

## Acceptance Criteria

- [x] Content attachment docs cite current runtime evidence.
- [x] Legacy `_content*` compatibility boundaries are named.
- [x] Public release notes do not claim total storage-plane retirement.
- [x] Follow-up ownership exists for any post-v18 storage cutover.

## Deterministic Evidence

| Claim | Canonical fixture or input | Witness | Replay command | Expected deterministic result |
| --- | --- | --- | --- | --- |
| Attachment-plane evidence still matches runtime behavior. | `test/unit/domain/services/ContentAttachmentProjection.test.ts` and v18 fixture witnesses. | Focused content attachment test output. | `npx vitest run test/unit/domain/services/ContentAttachmentProjection.test.ts test/unit/scripts/v18-v17-public-read-legacy-reading-builder.test.ts test/unit/scripts/v18-scratch-public-read-builder.test.ts` | Content attachment evidence matches runtime ids and projection behavior. |
| Residual legacy boundaries are explicit. | `docs/releases/v18.0.0/README.md` and `test/unit/scripts/v18-content-property-closeout-audit.test.ts`. | Release evidence doc row and raw-boundary audit output. | `npx vitest run test/unit/scripts/v18-content-property-closeout-audit.test.ts test/unit/scripts/v18-release-story-shape.test.ts test/unit/scripts/v18-worldline-api-doc-guard.test.ts` | Release evidence names accepted residual risk instead of hiding it, and public docs do not overclaim retirement. |
| Post-v18 storage cutover has an owner. | GitHub issue [#646](https://github.com/git-stunts/git-warp/issues/646). | Issue tracker. | `gh issue view 646 --repo git-stunts/git-warp` | Full legacy `_content*` storage-plane retirement is carried outside `lane:v18.0.0`. |

## Observer Geometry

| Reading claim | Basis | Aperture | Law/projection | Support obligations | Witness posture |
| --- | --- | --- | --- | --- | --- |
| Content attachment reading. | Runtime content object id and attachment projection basis. | Node or edge content aperture. | Content attachment projection. | Typed payload evidence, legacy compatibility boundary, and residual-risk posture. | Content attachment fixture witness. |

## Validation Plan

```bash
npm run test:local
npm run release:prep
```

## Release Gate Impact

This landed goalpost prevents v18 release notes from claiming more than the
content attachment evidence proves. The remaining full storage-plane retirement
work is now tracked outside `lane:v18.0.0` by #646.

## Residual Risks

| Risk | Rationale | Owner | Follow-up issue |
| --- | --- | --- | --- |
| Legacy content storage boundaries remain after v18. | This is named residual risk, not hidden completeness debt; #646 owns later full retirement. | `@git-stunts` | [#646](https://github.com/git-stunts/git-warp/issues/646) |

## Closeout

- [x] Slices complete or honestly dispositioned.
- [x] Proof matrix replayed.
- [x] Goalpost issue updated.
- [x] Release evidence updated.

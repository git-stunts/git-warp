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
| Status | `active` |
| Sponsor human | `James` |
| Sponsor agent | `Codex` |

## Outcome

The v18 release tells the truth about content attachment-plane progress:
runtime content attachment evidence is named, legacy `_content*` storage
compatibility is explicitly bounded as residual risk, and public docs do not
claim total storage-plane retirement.

## Current Truth

Issue [#550](https://github.com/git-stunts/git-warp/issues/550) is open in
`lane:v18.0.0`. Its issue body records completed content payload and projection
progress, then states that content persistence still has named legacy
`_content*` compatibility boundaries.

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
| 1 | open | Re-audit content attachment progress against current source and specs. | docUpdate |
| 2 | open | Replay or add content attachment equivalence evidence. | test |
| 3 | open | Update release docs to name accepted legacy boundaries precisely. | docUpdate |
| 4 | open | Close or carry forward #550 with storage-plane follow-up issue. | issueUpdate |

## Acceptance Criteria

- [ ] Content attachment docs cite current runtime evidence.
- [ ] Legacy `_content*` compatibility boundaries are named.
- [ ] Public release notes do not claim total storage-plane retirement.
- [ ] Follow-up ownership exists for any post-v18 storage cutover.

## Deterministic Evidence

| Claim | Canonical fixture or input | Witness | Replay command | Expected deterministic result |
| --- | --- | --- | --- | --- |
| Attachment-plane evidence still matches runtime behavior. | Existing content attachment fixtures or v18 release fixture. | Focused content attachment test output. | `npm test -- --run <content-attachment-test>` | Content attachment evidence matches runtime ids and projection behavior. |
| Residual legacy boundaries are explicit. | Tag commit source tree. | Release evidence doc row. | `npm run release:prep` | Release evidence names accepted residual risk instead of hiding it. |

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

This goalpost prevents v18 release notes from claiming more than the content
attachment evidence proves. It can land by either completing the remaining v18
content attachment work or by recording a precise accepted residual risk with a
post-v18 follow-up.

## Residual Risks

| Risk | Rationale | Owner | Follow-up issue |
| --- | --- | --- | --- |
| Legacy content storage boundaries may remain after v18. | Issue #550 already records this as named residual risk, not hidden completeness debt. | `@git-stunts` | [#550](https://github.com/git-stunts/git-warp/issues/550) |

## Closeout

- [ ] Slices complete or honestly dispositioned.
- [ ] Proof matrix replayed.
- [ ] Goalpost issue updated.
- [ ] Release evidence updated.

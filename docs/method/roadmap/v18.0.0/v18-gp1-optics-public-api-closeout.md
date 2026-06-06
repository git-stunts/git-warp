# V18-GP1 Optics Public API Closeout

## Identity

| Field | Value |
| --- | --- |
| Goalpost id | `v18.0.0-gp1-optics-public-api-closeout` |
| Release home | `v18.0.0` |
| Umbrella issue | `https://github.com/git-stunts/git-warp/issues/547` |
| Goalpost doc | `docs/method/roadmap/v18.0.0/v18-gp1-optics-public-api-closeout.md` |
| Design cycle | `docs/design/0265-v18-optics-public-api-closeout/v18-optics-public-api-closeout.md` |
| Slice budget | `20` |
| Status | `active` |
| Sponsor human | `James` |
| Sponsor agent | `Codex` |

## Outcome

First-use Optics become a release-honest public path: a user can create or
verify a bounded basis, capture a coordinate, and read node and property facts
without falling back to whole-graph materialization.

## Current Truth

Issue [#547](https://github.com/git-stunts/git-warp/issues/547) is open in
`lane:v18.0.0` and blocks the public v18 tag. Its issue body records the
existing 20-slice PRD shape and states that branch-local public API evidence is
not enough while first-use setup still depends on full materialization.

## Scope

- Worldline-first basis setup.
- Coordinate capture.
- Public node and property Optics success paths.
- Failure and recovery guidance for missing bounded basis.
- Consumer type evidence for the public chain.
- Tests proving public Optics do not hide full materialization.

## Out Of Scope

- Neighborhood and traversal Optics, which belong to V18-GP4.
- Total storage-plane content retirement, which belongs to V18-GP3 or later
  release lines.
- Native Continuum witnesshood.

## Proof Stories

| Story issue | Actor | Need | Reason | Slice budget |
| --- | --- | --- | --- | ---: |
| [#547](https://github.com/git-stunts/git-warp/issues/547) | application user | Worldline-first Optics setup, coordinate capture, and node/property reads | v18 public docs can teach Optics without sending users through graph-wide APIs | 20 |

## Slice Budget

| Slice | Status | Description | Expected proof |
| ---: | --- | --- | --- |
| 1 | open | Reconcile public Optics PRD against current runtime and release blockers. | docUpdate |
| 2 | open | Define first-use basis setup success fixture. | fixture |
| 3 | open | Add materialization trap for first-use Optics setup. | test |
| 4 | open | Implement or verify Worldline-first basis setup path. | runtimeBehavior |
| 5 | open | Implement or verify coordinate capture path. | runtimeBehavior |
| 6 | open | Prove node read success from the public chain. | test |
| 7 | open | Prove property read success from the public chain. | test |
| 8 | open | Prove coordinate coherence while the live worldline advances. | test |
| 9 | open | Prove missing bounded basis reports typed recovery guidance. | test |
| 10 | open | Prove tail-budget failure reports bounded-budget error. | test |
| 11 | open | Decide exported versus opaque public Optics result nouns. | docUpdate |
| 12 | open | Add consumer type proof for the intended public chain. | test |
| 13 | open | Update public docs for setup and recovery. | docUpdate |
| 14 | open | Update public API cost labels for Optics paths. | docUpdate |
| 15 | open | Add package-surface evidence for public Optics nouns. | test |
| 16 | open | Add deterministic witness for successful first-use Optics playback. | witness |
| 17 | open | Add deterministic witness for failure recovery. | witness |
| 18 | open | Remove or classify stale materializing Optics docs. | docUpdate |
| 19 | open | Update release evidence with Optics proof rows. | docUpdate |
| 20 | open | Close or disposition #547 with landed proof. | issueUpdate |

## Acceptance Criteria

- [ ] Public first-use Optics path succeeds without hidden full materialization.
- [ ] Node and property read fixtures prove the public chain.
- [ ] Missing basis and tail-budget failures have typed recovery guidance.
- [ ] Consumer type checks cover the public chain.
- [ ] Public docs and release evidence match the proven behavior.

## Deterministic Evidence

| Claim | Canonical fixture or input | Witness | Replay command | Expected deterministic result |
| --- | --- | --- | --- | --- |
| Public Optics setup avoids full materialization. | First-use Optics fixture committed with the implementation slice. | Focused materialization trap test output. | `npm test -- --run <first-use-optics-test>` | Test fails if setup calls materializing APIs. |
| Public node and property Optics read through a bounded basis. | Public-path coordinate fixture committed with the implementation slice. | Focused node/property Optics test output. | `npm test -- --run <coordinate-optics-test>` | Node and property reads succeed through the public chain. |
| Consumer type surface is honest. | Tag commit source tree. | Consumer typecheck output. | `npm run typecheck:consumer` | Public chain typechecks without internal imports. |

## Observer Geometry

| Reading claim | Basis | Aperture | Law/projection | Support obligations | Witness posture |
| --- | --- | --- | --- | --- | --- |
| Public node/property Optics read. | Pinned worldline coordinate and checkpoint-tail basis. | Target node id and property key. | Node/property optic law. | Basis roots, frontier, bounded tail, budget, and missing-basis recovery. | Focused fixture witness plus release evidence row. |

## Validation Plan

```bash
npm run typecheck:consumer
npm run test:local
npm run release:prep
```

## Release Gate Impact

This goalpost removes the v18 public Optics overclaim risk. Until it lands,
`v18.0.0` must not be tagged because public docs would imply a bounded first-use
Optics path that the repo has not proved.

## Residual Risks

| Risk | Rationale | Owner | Follow-up issue |
| --- | --- | --- | --- |
| Neighborhood and traversal reads remain future work until V18-GP4. | GP1 proves node/property first-use Optics only. | `@git-stunts` | [#632](https://github.com/git-stunts/git-warp/issues/632)-[#635](https://github.com/git-stunts/git-warp/issues/635) |

## Closeout

- [ ] Slices complete or honestly dispositioned.
- [ ] Proof matrix replayed.
- [ ] Goalpost issue updated.
- [ ] Release evidence updated.

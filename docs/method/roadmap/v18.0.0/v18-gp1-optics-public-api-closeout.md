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
| Status | `landed` |
| Sponsor human | `James` |
| Sponsor agent | `Codex` |

## Outcome

First-use Optics become a release-honest public path: a user can create or
verify a bounded basis, capture a coordinate, and read node and property facts
without falling back to whole-graph materialization.

## Current Truth

Issue [#547](https://github.com/git-stunts/git-warp/issues/547) is closed as
the public Optics closeout goalpost. The landed evidence proves
`openWarpWorldline(...).prepareOpticBasis()`, `coordinate()`, and
`coordinate.optic()` for public node/property reads without hidden full
materialization. The broader memory-budget product gate is closed in
[#549](https://github.com/git-stunts/git-warp/issues/549), and release/tag
evidence remains under [#552](https://github.com/git-stunts/git-warp/issues/552).

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
| 1 | complete | Reconcile public Optics PRD against current runtime and release blockers. | docUpdate |
| 2 | complete | Define first-use basis setup success fixture. | fixture |
| 3 | complete | Add materialization trap for first-use Optics setup. | test |
| 4 | complete | Implement or verify Worldline-first basis setup path. | runtimeBehavior |
| 5 | complete | Implement or verify coordinate capture path. | runtimeBehavior |
| 6 | complete | Prove node read success from the public chain. | test |
| 7 | complete | Prove property read success from the public chain. | test |
| 8 | complete | Prove coordinate coherence while the live worldline advances. | test |
| 9 | complete | Prove missing bounded basis reports typed recovery guidance. | test |
| 10 | complete | Prove tail-budget failure reports bounded-budget error. | test |
| 11 | complete | Decide exported versus opaque public Optics result nouns. | docUpdate |
| 12 | complete | Add consumer type proof for the intended public chain. | test |
| 13 | complete | Update public docs for setup and recovery. | docUpdate |
| 14 | complete | Update public API cost labels for Optics paths. | docUpdate |
| 15 | complete | Add package-surface evidence for public Optics nouns. | test |
| 16 | complete | Add deterministic witness for successful first-use Optics playback. | witness |
| 17 | complete | Add deterministic witness for failure recovery. | witness |
| 18 | complete | Remove or classify stale materializing Optics docs. | docUpdate |
| 19 | complete | Update release evidence with Optics proof rows. | docUpdate |
| 20 | complete | Close or disposition #547 with landed proof. | issueUpdate |

## Acceptance Criteria

- [x] Public first-use Optics path succeeds without hidden full materialization.
- [x] Node and property read fixtures prove the public chain.
- [x] Missing basis and tail-budget failures have typed recovery guidance.
- [x] Consumer type checks cover the public chain.
- [x] Public docs and release evidence match the proven behavior.

## Deterministic Evidence

| Claim | Canonical fixture or input | Witness | Replay command | Expected deterministic result |
| --- | --- | --- | --- | --- |
| Public Optics setup avoids full materialization. | `test/conformance/v18FirstUseOpticsHonesty.test.ts`. | Focused materialization trap test output. | `npx vitest run test/conformance/v18FirstUseOpticsHonesty.test.ts` | Test fails if setup calls materializing APIs or full tree-map reads. |
| Public node and property Optics read through a bounded basis. | `test/conformance/v18CoordinateOpticPublicPath.test.ts`. | Focused node/property Optics test output. | `npx vitest run test/conformance/v18CoordinateOpticPublicPath.test.ts` | Node and property reads succeed through the public chain with read identity evidence. |
| Failure recovery remains typed. | Coordinate and checkpoint-tail failure fixtures. | Focused recovery test output. | `npx vitest run test/conformance/v18CoordinateOpticPublicPath.test.ts test/conformance/v17CheckpointTailOpticReadBasis.test.ts` | Missing basis, tail-budget, missing shard, and invalid shard failures fail closed without materialization. |
| Public docs and cost labels are honest. | `docs/READINGS_AND_OPTICS.md`, `docs/public-api-cost-inventory.tsv`, and v18 release docs. | Documentation guard tests. | `npx vitest run test/unit/scripts/public-api-cost-inventory.test.ts test/unit/scripts/v18-worldline-api-doc-guard.test.ts test/unit/scripts/v18-package-surface-audit.test.ts` | Docs teach the coordinate chain, classify cost honestly, and keep materializing docs out of the first-use path. |
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

This landed goalpost removes the v18 public Optics overclaim risk. `v18.0.0`
still waits on V18-GP2 bounded-memory product evidence and V18-GP5 release
operation evidence before tagging.

## Residual Risks

| Risk | Rationale | Owner | Follow-up issue |
| --- | --- | --- | --- |
| Release evidence and tag-time proof remain intentionally skipped. | GP1 proves the public Optics chain and first-use honesty, while V18-GP5 owns explicit tag approval and publish evidence. | `@git-stunts` | [#552](https://github.com/git-stunts/git-warp/issues/552) |

## Closeout

- [x] Slices complete or honestly dispositioned.
- [x] Proof matrix replayed.
- [x] Goalpost issue updated.
- [x] Release evidence updated.

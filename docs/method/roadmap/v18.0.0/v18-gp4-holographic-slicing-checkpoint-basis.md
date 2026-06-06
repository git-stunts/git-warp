# V18-GP4 Holographic Slicing And Checkpoint Basis

## Identity

| Field | Value |
| --- | --- |
| Goalpost id | `v18.0.0-gp4-holographic-slicing-checkpoint-basis` |
| Release home | `v18.0.0` |
| Umbrella issue | `https://github.com/git-stunts/git-warp/issues/626` |
| Goalpost doc | `docs/method/roadmap/v18.0.0/v18-gp4-holographic-slicing-checkpoint-basis.md` |
| Design cycle | `docs/design/0271-v18-holographic-slicing-checkpoint-basis/v18-holographic-slicing-checkpoint-basis.md` |
| Slice budget | `8` |
| Status | `landed` |
| Sponsor human | `James` |
| Sponsor agent | `Codex` |

## Outcome

Normal public graph-shaped reads move toward bounded, witnessed holographic
slices over a declared checkpoint-tail or streamed checkpoint basis.

## Current Truth

Design issue [#626](https://github.com/git-stunts/git-warp/issues/626) and
implementation proof stories [#628](https://github.com/git-stunts/git-warp/issues/628)
through [#635](https://github.com/git-stunts/git-warp/issues/635) are closed.
PR [#643](https://github.com/git-stunts/git-warp/pull/643) landed the runtime
and witness proof surface, then the remaining tracker drift was closed with
deterministic evidence comments on 2026-06-06.

## Scope

- Materialization boundary guard.
- Checkpoint basis manifest contract.
- Streaming checkpoint basis builder.
- Patch-to-fact stream.
- Node and property optics on streamed basis.
- Neighborhood and traversal optics.
- CLI/operator holographic witness playback.

## Out Of Scope

- Treating a materialized graph as substrate truth.
- Rewriting every global graph algorithm.
- Native Continuum witnesshood.

## Proof Stories

| Story issue | Actor | Need | Reason | Slice budget |
| --- | --- | --- | --- | ---: |
| [#628](https://github.com/git-stunts/git-warp/issues/628) | maintainer | materialization boundary guard | public paths must not regain hidden full materialization | 1 |
| [#629](https://github.com/git-stunts/git-warp/issues/629) | maintainer | checkpoint basis manifest contract | slice reads need explicit basis identity and shard geometry | 1 |
| [#630](https://github.com/git-stunts/git-warp/issues/630) | maintainer | streaming checkpoint basis builder | checkpoint basis must not require full `WarpState` input | 1 |
| [#631](https://github.com/git-stunts/git-warp/issues/631) | maintainer | checkpoint patch-to-fact stream | tail facts must be streamable from patch history | 1 |
| [#632](https://github.com/git-stunts/git-warp/issues/632) | application user | node and property optics on streamed basis | public reads need bounded shard evidence | 1 |
| [#633](https://github.com/git-stunts/git-warp/issues/633) | application user | one-hop neighborhood slices | adjacency reads need limits, cursor, evidence, and completeness | 1 |
| [#634](https://github.com/git-stunts/git-warp/issues/634) | application user | cursorized traversal optic | traversal must report progress and boundary without implying global absence | 1 |
| [#635](https://github.com/git-stunts/git-warp/issues/635) | operator | CLI/operator witness playback | release evidence needs machine-readable lower-mode playback | 1 |

## Slice Budget

| Slice | Status | Description | Expected proof |
| ---: | --- | --- | --- |
| 1 | complete | Materialization boundary guard. | test |
| 2 | complete | Checkpoint basis manifest contract. | schema |
| 3 | complete | Streaming checkpoint basis builder. | test |
| 4 | complete | Patch-to-fact stream. | test |
| 5 | complete | Node and property optics on streamed basis. | test |
| 6 | complete | NeighborhoodOptic adjacency slices. | test |
| 7 | complete | TraversalOptic cursorized traversal. | test |
| 8 | complete | Holographic CLI/operator witness playback. | witness |

## Acceptance Criteria

- [x] App-facing reads do not hide full materialization.
- [x] Checkpoint manifests and slice outputs separate byte identity, retained
      payload identity, commitment/proof identity, basis identity, and semantic
      reading identity.
- [x] Streaming checkpoint basis construction produces CAS-backed shard roots
      under memory budget.
- [x] Node, property, neighborhood, and traversal optics read through bounded
      basis facts plus bounded tail.
- [x] Missing support obligations are surfaced as obstruction, residual,
      redaction, plurality, or rehydration posture.
- [x] CLI/operator witness output is machine-readable.

## Deterministic Evidence

| Claim | Canonical fixture or input | Witness | Replay command | Expected deterministic result |
| --- | --- | --- | --- | --- |
| Materialization boundary is guarded. | PR #643 merge commit `d52cbea16f6ac1236dbdfd0579fe6da0b9e6a809`. | Focused guard and conformance tests. | `npx vitest run test/conformance/v17CheckpointTailOpticReadBasis.test.ts` | Public paths fail if they call materializing APIs. |
| Checkpoint basis identity is explicit. | `test/unit/domain/services/optic/CheckpointBasisManifest.test.ts`. | Manifest validation output. | `npx vitest run test/unit/domain/services/optic/CheckpointBasisManifest.test.ts` | Manifest validates basis identity, reading identity, roots, frontier, and obstruction posture. |
| Streamed basis slices are replayable. | `test/unit/domain/services/optic/StreamingCheckpointBasisBuilder.test.ts` and `test/unit/domain/services/optic/CheckpointPatchFactStream.test.ts`. | Builder and patch-to-fact test output. | `npx vitest run test/unit/domain/services/optic/StreamingCheckpointBasisBuilder.test.ts test/unit/domain/services/optic/CheckpointPatchFactStream.test.ts` | Replay produces stable shard roots, stable fact order, or typed obstruction. |
| Optics read through bounded basis. | `test/unit/domain/services/optic/CheckpointShardFactReader.manifest.test.ts`. | Manifest-backed shard read output. | `npx vitest run test/unit/domain/services/optic/CheckpointShardFactReader.manifest.test.ts` | Node, property, neighborhood, and traversal reads use targeted basis shards plus bounded tail. |
| Operator playback is machine-readable. | PR #643 holographic CLI witness implementation. | CLI/operator witness tests. | `npm run test:local` | Holographic witness playback remains part of the full local suite. |

## Observer Geometry

| Reading claim | Basis | Aperture | Law/projection | Support obligations | Witness posture |
| --- | --- | --- | --- | --- | --- |
| Holographic slice. | Checkpoint basis manifest plus bounded tail. | Node, property, neighborhood, or traversal aperture. | Declared optic law. | Basis roots, tail range, budget, rights, witness refs, residual posture. | Slice result and CLI witness. |

## Validation Plan

```bash
npm run test:local
npm run typecheck
npm run release:prep
```

## Release Gate Impact

This landed goalpost is the graph-substrate honesty bridge between v18 Optics
and the bounded-memory product gate. The release can now cite bounded slice
substrate evidence while the broader bounded-memory product gate remains open.

## Residual Risks

| Risk | Rationale | Owner | Follow-up issue |
| --- | --- | --- | --- |
| Broader bounded-memory release gate remains open. | GP4 proves bounded holographic slice substrate, not the full public-path memory-budget platform required by V18-GP2. | `@git-stunts` | [#549](https://github.com/git-stunts/git-warp/issues/549) |

## Closeout

- [x] Slices complete or honestly dispositioned.
- [x] Proof matrix replayed.
- [x] Goalpost issue updated.
- [x] Child proof-story issues closed, superseded, or carried forward.
- [x] Release evidence updated.

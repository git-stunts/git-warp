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
| Status | `active` |
| Sponsor human | `James` |
| Sponsor agent | `Codex` |

## Outcome

Normal public graph-shaped reads move toward bounded, witnessed holographic
slices over a declared checkpoint-tail or streamed checkpoint basis.

## Current Truth

Design issue [#626](https://github.com/git-stunts/git-warp/issues/626) is closed
because the design landed. That does not prove the implementation goalpost
landed. The runtime proof stories are child issues
[#628](https://github.com/git-stunts/git-warp/issues/628) through
[#635](https://github.com/git-stunts/git-warp/issues/635), and they remain the
release-relevant proof surface for this goalpost.

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
| 1 | open | Materialization boundary guard. | test |
| 2 | open | Checkpoint basis manifest contract. | schema |
| 3 | open | Streaming checkpoint basis builder. | test |
| 4 | open | Patch-to-fact stream. | test |
| 5 | open | Node and property optics on streamed basis. | test |
| 6 | open | NeighborhoodOptic adjacency slices. | test |
| 7 | open | TraversalOptic cursorized traversal. | test |
| 8 | open | Holographic CLI/operator witness playback. | witness |

## Acceptance Criteria

- [ ] App-facing reads do not hide full materialization.
- [ ] Checkpoint manifests and slice outputs separate byte identity, retained
      payload identity, commitment/proof identity, basis identity, and semantic
      reading identity.
- [ ] Streaming checkpoint basis construction produces CAS-backed shard roots
      under memory budget.
- [ ] Node, property, neighborhood, and traversal optics read through bounded
      basis facts plus bounded tail.
- [ ] Missing support obligations are surfaced as obstruction, residual,
      redaction, plurality, or rehydration posture.
- [ ] CLI/operator witness output is machine-readable.

## Deterministic Evidence

| Claim | Canonical fixture or input | Witness | Replay command | Expected deterministic result |
| --- | --- | --- | --- | --- |
| Materialization boundary is guarded. | Tag commit source tree. | Focused guard test output. | `npm test -- --run <materialization-boundary-test>` | Public paths fail if they call materializing APIs. |
| Checkpoint basis identity is explicit. | Checkpoint basis manifest fixture. | Manifest validation output. | `npm test -- --run <checkpoint-basis-manifest-test>` | Manifest validates basis identity, reading identity, roots, frontier, and obstruction posture. |
| Slices are replayable. | Canonical graph or patch-stream fixture. | CLI/operator witness. | `npm test -- --run <holographic-slice-test>` | Replay reproduces stable slice output or typed obstruction. |

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

This goalpost is the graph-substrate honesty bridge between v18 Optics and the
bounded-memory product gate. Without it, the release can describe design intent
but cannot prove the bounded slice substrate needed for the next implementation
work.

## Residual Risks

| Risk | Rationale | Owner | Follow-up issue |
| --- | --- | --- | --- |
| #626 is closed while implementation proof stories remain open. | The design landed separately from implementation; ROADMAP treats #628-#635 as the release proof surface. | `@git-stunts` | [#628](https://github.com/git-stunts/git-warp/issues/628)-[#635](https://github.com/git-stunts/git-warp/issues/635) |

## Closeout

- [ ] Slices complete or honestly dispositioned.
- [ ] Proof matrix replayed.
- [ ] Goalpost issue updated.
- [ ] Child proof-story issues closed, superseded, or carried forward.
- [ ] Release evidence updated.

# 0046 Retrospective — Trie Geometry And Memory Profile

## Conclusion

Hill met, with an explicit large-scale caveat.

Cycle `0046` replaced the shadow-trie geometry folklore with a real, repeatable
profile harness and a measured default-matrix recommendation.

What landed:

- [trieGeometryProfile.fixture.ts](../../../../test/benchmark/trieGeometryProfile.fixture.ts)
  as the benchmark fixture for build, reopen, scan, cache, and trie-shape
  metrics
- [TrieGeometryProfile.profile.test.ts](../../../../test/unit/benchmark/TrieGeometryProfile.profile.test.ts)
  as the runnable profile harness
- [trieGeometryProfile.fixture.test.ts](../../../../test/unit/benchmark/trieGeometryProfile.fixture.test.ts)
  as the matrix/report ratchet
- a measured recommendation based on the checked-in matrix instead of ad hoc
  defaults

## What changed in repo truth

- `PERF_trie-geometry-and-memory-profile` is now done for `v17`
- `INFRA_extract-warp-kernel-package` and
  `INFRA_extract-warp-adapters-package` are no longer blocked on geometry
  folklore
- the executable geometry set is now called out more honestly: the cycle
  discovered that 64-way geometry is still claimed by `TrieGeometry`, but not
  actually executable through the cursor path

## What worked

- measuring through `StateSession` and reopen/full-scan paths was the right
  seam; it exercised the runtime line the package extraction tasks actually care
  about
- switching the recommendation logic from “lowest absolute scenario” to
  “best average per-scale posture” stopped the smallest matrix row from
  deciding the default by accident
- keeping the report as markdown in repo truth makes reruns and future retuning
  much cheaper

## What failed or stayed sharp

- the optional 1M-entry stress pass exposed a real scan-count regression:
  `f16-l64-c128@1000000` returned `500005` nodes instead of `500000`
- page-cache hit ratios stayed at `0.00` in the harness because the second pass
  reuses the cursor working set rather than forcing page-cache reuse; that
  metric still matters, but it needs to be interpreted carefully
- the old `fanout = 64` contract is still a repo lie outside this cycle’s
  measured matrix

## Next

The next honest moves are `INFRA_extract-warp-kernel-package` and then
`INFRA_extract-warp-adapters-package`.

We got ourselves into a geometry-folklore mess, got ourselves out of it with a
real measurement harness, and found two fresh gremlins hiding under the rug:
fake 64-way support and a 1M-entry scan duplicate. The package seams can move
now, but the gremlins are still hissing from the vents.

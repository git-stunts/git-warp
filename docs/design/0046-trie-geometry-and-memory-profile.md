---
title: "Trie geometry and residency defaults are benchmarked, not declared"
cycle: "0046-trie-geometry-and-memory-profile"
---

# Trie Geometry And Memory Profile

## Why this exists

The shadow-trie line is now feature-complete enough to profile honestly:

- semilattice proof is in place
- state sessions exist
- materialization and builder iteration are session-backed

What is still hand-wavy is the default geometry and cache posture:

- `fanout = 16`
- `leafCapacity = 64`
- `leafFloor = 16`
- `PageCache.maxResident` values chosen ad hoc in tests and runtime wiring

This cycle exists to replace those vibes with a reproducible benchmark harness
and a recommendation table.

## Hill

A contributor can now answer:

- what benchmark harness exercises the shadow-trie line at multiple scales
- how geometry and cache parameters affect wall-clock, write volume, trie depth,
  leaf occupancy, and cache behavior
- what recommendation the current repo truth makes for default geometry/cache
  values
- what extraction work is still blocked on this performance evidence

## Design goals

1. Add a benchmark harness for shadow-trie state build + reopen + scan.
2. Capture page-cache hits, misses, and eviction behavior under multiple
   `maxResident` values.
3. Capture trie depth, leaf occupancy, and write counts under multiple geometry
   settings.
4. Compare wall-clock and memory posture against the in-memory ORSet baseline.
5. Record an explicit recommendation table in the cycle docs.

## Non-goals

- No auto-tuning or runtime-adaptive geometry.
- No attempt to benchmark every future storage adapter.
- No extraction work in this cycle.
- No CI performance gate in this cycle.

## Core diagnosis

The current defaults are documented as “initial guesses” in
[TrieGeometry.ts](/Users/james/git/git-stunts/git-warp/src/domain/orset/trie/TrieGeometry.ts)
and the page-cache cycle explicitly deferred real tuning.

That is fine as long as the repo does not pretend the values are settled.
But package extraction is downstream of this work, so the repo now needs a
benchmark harness and a recommendation surface instead of more folklore.

## Design

### 1. Benchmark the truthful seam

Benchmark the shadow-trie line through `StateSession` and reopened scans, not
through internal cursor micro-operations only.

The harness should cover:

- build/load time for nodes and edges
- close/reopen time
- full scan/read time after reopen
- comparison to an in-memory ORSet baseline over the same fixture

### 2. Vary geometry and cache size explicitly

The first pass should include at least:

- `fanout = 16` and `fanout = 256`
- a smaller and larger `leafCapacity`
- multiple `PageCache.maxResident` values

Keep the matrix small enough to run locally without becoming a day-long soak
test.

The original `fanout = 64` target turned out to be a repo-truth lie: the
geometry constructor still advertises 64-way support, but
`TrieCursor` rejects 6-bit nibble geometries. This cycle treats that as a
separate contract gap and measures only the variants the live cursor path can
actually execute.

### 3. Capture runtime and structure metrics separately

The report should separate:

- runtime cost
- memory/RSS posture
- cache hit/miss/eviction posture
- trie structure shape (depth, leaf occupancy, write counts)

That keeps “fast but sloppy” and “beautiful but huge” from collapsing into one
number.

### 4. Make the recommendation explicit

This cycle must finish with a written recommendation table:

- chosen default geometry
- chosen default cache posture
- what tradeoffs justified that choice
- what larger-scale unknowns remain

## Playback questions

### Agent

- Can I point to the exact benchmark harness and the metrics it collects?
- Can I explain why the chosen recommendation follows from measured data rather
  than taste?
- Can I explain what this cycle still does not prove?

### Human

- Does the repo now have a repeatable way to re-run the geometry decision?
- Is the recommendation legible without reading benchmark code?
- Is it clear why package extraction was waiting on this evidence?

## Test plan

### Golden path

- benchmark harness runs locally for the supported matrix
- harness emits per-scenario metrics for runtime, cache, and trie shape
- docs capture a recommendation table derived from an actual benchmark run

### Edge cases

- empty/small fixtures do not crash the harness
- reopened scans still work under tiny cache settings
- larger scenarios still produce a structured report rather than partial logs

### Known failure modes

- benchmark only measures one happy-path geometry and leaves the choice
  unexamined
- cache metrics are missing, making `maxResident` recommendations baseless
- docs claim a recommendation without citing the measured scenarios

## Recommendation

Measured with:

- `GIT_WARP_PROFILE=1 npx vitest run test/unit/benchmark/TrieGeometryProfile.profile.test.ts --reporter=verbose`

Measured matrix:

| Variant | Entries | Build ms | Read ms | Heap Δ MB | RSS Δ MB | Evictions | Writes | Max depth |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| `f16-l64-c128` | `1,000` | `23.82` | `4.12` | `1.24` | `18.52` | `0` | `34` | `1` |
| `f16-l32-c64` | `1,000` | `14.89` | `4.35` | `12.13` | `14.95` | `185` | `249` | `2` |
| `f256-l64-c128` | `1,000` | `30.97` | `3.47` | `-9.76` | `5.08` | `308` | `436` | `1` |
| `f16-l64-c128` | `10,000` | `100.49` | `21.73` | `26.48` | `53.81` | `418` | `546` | `2` |
| `f16-l32-c64` | `10,000` | `95.49` | `26.27` | `1.20` | `63.53` | `523` | `587` | `3` |
| `f256-l64-c128` | `10,000` | `391.46` | `14.54` | `39.11` | `12.70` | `386` | `514` | `1` |
| `f16-l64-c128` | `100,000` | `1069.26` | `267.77` | `132.16` | `186.38` | `8610` | `8738` | `3` |
| `f16-l32-c64` | `100,000` | `1081.45` | `273.71` | `-95.67` | `217.56` | `8674` | `8738` | `3` |
| `f256-l64-c128` | `100,000` | `3339.68` | `492.01` | `323.54` | `76.11` | `70151` | `70279` | `2` |

Recommended default posture from the measured matrix:

| Setting | Recommendation | Why |
|---|---|---|
| `fanout` | `16` | The 256-way variant reduced depth, but paid a severe build-time and write-amplification cost. |
| `leafCapacity` | `32` | Best average per-scale score across the measured matrix. |
| `leafFloor` | `8` | Keeps the 1:4 rebalance ratio while matching the measured leaf-capacity winner. |
| `PageCache.maxResident` | `64` | Matches the winning variant and keeps the cache posture explicit instead of inheriting folklore. |

Important caveats:

- the page-cache hit ratio stayed at `0.00` in this harness because the second
  pass reuses the cursor's in-memory working set; the cache metrics therefore
  reflect reopen misses and eviction pressure, not same-session scan reuse
- `GIT_WARP_PROFILE_STRESS=1` exposed a real large-scale regression instead of a
  report row: `f16-l64-c128@1000000` scanned `500005` nodes instead of the
  expected `500000`
- this cycle therefore establishes a repeatable default-matrix recommendation,
  but does **not** claim the current scan line is proven at 1M-entry scale

## Playback

### Witness

The geometry/profile cycle is backed by:

- [trieGeometryProfile.fixture.ts](/Users/james/git/git-stunts/git-warp/test/benchmark/trieGeometryProfile.fixture.ts)
- [trieGeometryProfile.fixture.test.ts](/Users/james/git/git-stunts/git-warp/test/unit/benchmark/trieGeometryProfile.fixture.test.ts)
- [TrieGeometryProfile.profile.test.ts](/Users/james/git/git-stunts/git-warp/test/unit/benchmark/TrieGeometryProfile.profile.test.ts)
- `npm exec vitest run test/unit/benchmark/trieGeometryProfile.fixture.test.ts test/unit/benchmark/TrieGeometryProfile.profile.test.ts`
- `GIT_WARP_PROFILE=1 npx vitest run test/unit/benchmark/TrieGeometryProfile.profile.test.ts --reporter=verbose`
- `npm run typecheck`
- `git diff --check`

### Agent

1. *Can I point to the exact benchmark harness and the metrics it collects?*
   Yes. The fixture drives build, close/reopen, and full-scan reads through
   `StateSession`, and captures runtime, memory, page-cache, write-count, and
   trie-shape metrics.

2. *Can I explain why the chosen recommendation follows from measured data rather than taste?*
   Yes. The recommendation is now derived from a per-scale aggregate over the
   measured matrix instead of picking the smallest absolute scenario.

3. *Can I explain what this cycle still does not prove?*
   Yes. It does not prove 64-way geometry support, and it does not prove scan
   correctness at the 1M-entry stress scale.

### Human

1. *Does the repo now have a repeatable way to re-run the geometry decision?*
   Yes. The profile harness is checked in, scripted, and produces a markdown
   report from the measured matrix.

2. *Is the recommendation legible without reading benchmark code?*
   Yes. The cycle doc now carries the measured matrix, the recommended posture,
   and the caveats that shaped it.

3. *Is it clear why package extraction was waiting on this evidence?*
   Yes. The repo now has a reproducible geometry/cache recommendation instead of
   continuing to freeze package seams around folklore values.

Verdict: pass, with explicit large-scale caveat.

## Drift check

No negative drift.

Positive drift only:

- the original plan said “16 and 64” fanout, but the live runtime exposed that
  64-way geometry is not actually executable through `TrieCursor`; the measured
  matrix now uses the truthful executable set
- the optional 1M stress path exposed a real scan-count regression, so the
  cycle closes with a default-matrix recommendation plus an explicit large-scale
  caveat rather than pretending the stress path already passes

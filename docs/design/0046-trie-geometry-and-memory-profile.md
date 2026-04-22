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

- `fanout = 16` and `fanout = 64`
- a smaller and larger `leafCapacity`
- multiple `PageCache.maxResident` values

Keep the matrix small enough to run locally without becoming a day-long soak
test.

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

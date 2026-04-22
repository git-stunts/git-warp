---
id: PERF_trie-geometry-and-memory-profile
blocked_by:
  - PROTO_index-builder-trie-iteration
  - TRUST_shadow-trie-semilattice-pbt
blocks:
  - INFRA_extract-warp-kernel-package
  - INFRA_extract-warp-adapters-package
feature: trie-state-storage
---

# Benchmark fanout, leaf size, cache size, heap/RSS, and wall-clock on real graphs

## Problem

Geometry parameters (branching factor, leaf capacity, LRU cache size)
were chosen as initial guesses. Before locking them as defaults, they
must be validated against real graph workloads at multiple scales.

## Fix

Build a benchmark harness that materializes graphs of 1K, 10K, 100K,
and 1M nodes+edges through the Shadow-Trie ORSet. Measure:

- Page fault rate and LRU hit ratio
- Trie depth and leaf occupancy distribution
- Flush I/O count (blobs + trees written)
- Total wall time vs in-memory ORSet baseline
- Heap and RSS at steady state

Vary: branching factor (4-bit vs 8-bit nibbles), leaf capacity
thresholds, LRU size. Output a recommendation table. Results drive
the default constants.

## Scope

**In:** Benchmark harness. Multi-scale workloads. Heap/RSS profiling.
Recommendation table with data.

**Out:** Production tuning knobs or auto-detection.

## Existing v17 links

- PERF_out-of-core-materialization — related performance concern about
  graphs that exceed memory. This benchmark validates that the
  Shadow-Trie approach actually delivers bounded residency.

## Notes

- Heap and RSS profiling are mandatory. No asymptotic victory speeches.
- Geometry is benchmarked, not declared.

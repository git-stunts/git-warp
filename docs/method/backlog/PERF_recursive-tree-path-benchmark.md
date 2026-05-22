---
id: PERF_recursive-tree-path-benchmark
feature: trie-state-storage
blocked_by: []
blocks: []
---

# Recursive tree path edge-case benchmark

**Effort:** M

## Design

[0153 recursive tree path benchmark](../../design/0153-recursive-tree-path-benchmark/recursive-tree-path-benchmark.md)

## Problem

The v17.0.1 fix reduced recursive tree OID reads to one `git ls-tree
-rz` call and added correctness coverage for prototype-like path
names. The remaining benchmark evidence focuses on fanout and Think
latency, not a repeatable fixture that combines deep trees, wide trees,
and unusual but valid Git path names.

## Suggested Fix

Add a benchmark or regression fixture that exercises recursive tree OID
reads across:

- deep nested paths;
- wide sibling sets;
- prototype-like path names;
- enough entries to expose accidental process fanout.

The benchmark should verify both runtime shape and path/OID integrity.

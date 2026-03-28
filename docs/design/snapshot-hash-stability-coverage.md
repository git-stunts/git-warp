# RFC: Snapshot Hash Stability Coverage

**Status:** IMPLEMENTED
**Date:** 2026-03-27
**Legend:** Observer Geometry
**Backlog:** `OG-007`
**Scope:** Expand executable coverage for hash stability across public snapshot
flavors

---

## Problem

The current read-side slices established three important properties:

- detached public snapshots
- immutable observer/worldline read handles
- hardened public snapshot immutability

But the hash-stability contract is still under-specified across the public read
surface.

We have strong unit coverage for `computeStateHashV5(...)` itself, but weaker
coverage for these public-facing questions:

- does `materialize({ receipts: true }).state` hash identically to
  `materialize()` for the same slice?
- do coordinate snapshots hash identically across direct runtime and worldline
  entry points?
- do strand snapshots hash identically across repeated reads and receipt
  modes?
- does `getStateSnapshot()` preserve the same hash as the current materialized
  snapshot?

---

## Goal

Prove that the public read API preserves a stable materialized state hash across
all lawful snapshot flavors for the same underlying history slice.

In other words, if two public APIs expose the same visible state, then:

\[
\operatorname{hash}(S_1) = \operatorname{hash}(S_2)
\]

even if those snapshots came from different read entry points.

---

## Invariants

After this slice lands, the test suite should prove:

1. repeated `materialize()` calls over unchanged history yield the same state
   hash
2. `materialize()` and `materialize({ receipts: true }).state` hash identically
   for the same history slice
3. `materializeCoordinate(...)` and `worldline({source: coordinate}).materialize()`
   hash identically for the same coordinate
4. `materializeStrand(...)` and
   `materializeStrand(..., { receipts: true }).state` hash identically for
   the same strand slice
5. `getStateSnapshot()` hashes identically to the currently materialized public
   snapshot for the same runtime state
6. observer `stateHash` remains aligned with the hash of the pinned snapshot it
   was constructed from

---

## Non-Goals

This slice does not:

- introduce a new public hash API
- change the state hashing algorithm
- promise hash equality across different visible states that happen to share
  causal ancestry
- benchmark hashing performance

---

## Red Spec

The red spec should stay entirely at the public API layer:

- build a small deterministic multi-slice graph
- compute hashes from returned public snapshots using `computeStateHashV5(...)`
- compare the hashes across live, coordinate, strand, receipt-enabled, and
  worldline entry points

If the current behavior already satisfies the contract, this slice may close as
tests-plus-docs without additional runtime changes.

That is what happened here. The runtime already satisfied the contract once the
detached read boundary, immutable snapshot hardening, and `Worldline` surface
had landed. This slice therefore closes as executable coverage plus process
documentation rather than a runtime rewrite.

---
id: SUB_trie-geometry-profile-contract-and-scale-gaps
blocked_by: []
blocks: []
feature: trie-state-storage
release_home: v17.0.0
---

# Trie geometry profile exposed contract drift and a 1M scan-count regression

**Effort:** M

## Problem

The `0046` geometry/profile cycle surfaced two repo-truth gaps in the
shadow-trie line:

1. `TrieGeometry` and historical docs still claim 64-way geometry support, but
   `TrieCursor` rejects 6-bit nibble geometries (`nibbleBits must be 1, 2, 4,
   or 8`).
2. The optional 1M-entry stress path in the new profile harness does not yet
   preserve scan-count truth. The `f16-l64-c128@1000000` scenario returns
   `500005` nodes instead of the expected `500000`.

So the cycle now has a repeatable default-matrix recommendation, but the repo
still overstates one geometry contract and one large-scale correctness posture.

## Why it matters

- The profile matrix cannot honestly include 64-way geometry while the cursor
  line rejects it.
- Large-scale scan truth is part of the same substrate story as bounded
  residency; duplicated elements at 1M make the stress line untrustworthy.
- Leaving both issues undocumented would make package extraction look cleaner
  than the actual substrate is.

## Suggested direction

- Either remove 64-way geometry from the public `TrieGeometry` contract or make
  the cursor path support 6-bit nibble geometries truthfully.
- Reproduce and fix the 1M-entry duplicate scan regression before treating the
  stress path as proven.
- Keep the profile harness as the reproduction surface so future fixes stay
  measurable.

## Evidence

- `src/domain/orset/trie/TrieGeometry.ts`
- `src/domain/orset/trie/trieCursorHelpers.ts`
- `test/benchmark/trieGeometryProfile.fixture.ts`
- `test/unit/benchmark/TrieGeometryProfile.profile.test.ts`

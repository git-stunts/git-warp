---
title: "Extract ORSetLike contract from concrete ORSet and retype consumers"
legend: "PROTO"
cycle: "0023-orsetlike-contract"
source_backlog: "docs/method/backlog/v17.0.0/PROTO_orsetlike-contract.md"
---

# Extract ORSetLike contract from concrete ORSet and retype consumers

Source backlog item: `docs/method/backlog/v17.0.0/PROTO_orsetlike-contract.md`
Legend: PROTO

## Sponsors

- Human: Backlog operator
- Agent: Implementation agent

## Hill

`ORSetLike` abstract class lives at `src/domain/orset/ORSetLike.ts`.
`ORSet` extends it. Every consumer that today types against the
concrete `ORSet` class is retyped to `ORSetLike`. Direct access to
`orset.entries` and `orset.tombstones` from source files outside
`src/domain/crdt/ORSet.ts` is eliminated — those leaks are replaced
by contract methods. All existing tests pass unchanged.

## Playback Questions

### Human

- [ ] Does the `ORSetLike` surface include every method a consumer
      currently reaches for? (expected: yes, including replacements
      for the direct-field leaks)
- [ ] Do tests that inspect `.entries` and `.tombstones` still work?
      (expected: yes — concrete `ORSet` keeps those public fields)
- [ ] Is the class/abstract-class discipline honored over interface?
      (expected: yes — per AGENTS.md, `interface` is for ports only)

### Agent

- [ ] Every `import ... from '.../crdt/ORSet.ts'` consumer in `src/`
      either constructs ORSet directly (legit factory call) or is
      retyped to `ORSetLike` (not `ORSet`).
- [ ] No source file outside `src/domain/crdt/ORSet.ts` reads
      `.entries` or `.tombstones` on an ORSet.
- [ ] `npm run lint`, `npm run typecheck`, `npm run test:local` all
      pass with no new failures.

## Accessibility and Assistive Reading

- Linear truth / reduced-complexity posture: the contract is a
  flat abstract-class surface with one section per concern
  (mutators / queries / transformations / serialization).
- Non-visual or alternate-reading expectations: N/A (no UX).

## Localization and Directionality

- Locale / wording / formatting assumptions: N/A (no UX).
- Logical direction / layout assumptions: N/A (no UX).

## Agent Inspectability and Explainability

- What must be explicit and deterministic for agents: method
  signatures must be precise. `hasDot`, `isTombstoned`, and
  `entriesIter` must return the exact types their use sites need,
  without coercion at the boundary.
- What must be attributable, evidenced, or governed: every change
  to a consumer call site must keep identical runtime behavior,
  verified by the pre-existing test suite.

## Non-goals

- [ ] No async changes. No `StateSession` scaffolding.
- [ ] No `ShadowTrieORSet`. `ShadowTrieORSet` does NOT implement
      `ORSetLike` — it lives behind `StateSession` (a different
      seam, future cycle).
- [ ] No move into `packages/warp-orset/`. Code stays in root per
      cycle 0021's seam plan.

## Backlog Context

## Problem

Every consumer of ORSet (Ops, JoinReducer, GCMetrics,
CheckpointSerializer, WarpStateIndexBuilder, DiffCalculator,
ReceiptBuilder) is typed against the concrete `ORSet` class. There
is no seam to swap in a trie-backed implementation.

`CheckpointSerializer`, `DiffCalculator`, `ReceiptBuilder`, and
`VisibleStateScope` additionally reach into private-ish internals
(`orset.entries`, `orset.tombstones`), which further ossifies the
in-memory Map/Set representation.

## Fix

1. Define `ORSetLike` as an abstract class in
   `src/domain/orset/ORSetLike.ts`. It captures the synchronous,
   in-memory contract.
2. Make `ORSet` extend `ORSetLike`.
3. Add contract methods that replace every direct-field leak:
   - `hasDot(element, encodedDot): boolean`
   - `isTombstoned(encodedDot): boolean`
   - `entriesIter(): IterableIterator<[string, ReadonlySet<string>]>`
   - `entryDotsIter(): IterableIterator<string>`
   - `scopedClone(includeElement): ORSetLike`
4. Retype every consumer to accept `ORSetLike` instead of concrete
   `ORSet`.
5. Rewrite each direct-field leak to use the contract method.

## Scope

**In:**
- Abstract class `ORSetLike` at `src/domain/orset/ORSetLike.ts`.
- `ORSet extends ORSetLike`.
- New contract methods on ORSet to replace field leaks.
- Consumer retyping: WarpState, DiffCalculator, ReceiptBuilder,
  CheckpointSerializer, CborCheckpointStoreAdapter, VisibleStateScope,
  checkpointLoad, IncrementalIndexUpdater, traversalHelpers.
- `instanceof ORSet` boundary checks may switch to
  `instanceof ORSetLike` where the intent is "any valid in-memory
  OR-Set".

**Out:**
- Async surface. `StateSession`. `ShadowTrieORSet`.
- Moving code into `packages/warp-orset/`.
- Removing `ORSet`'s public `entries`/`tombstones` fields (tests
  rely on them; concrete class keeps them).

## Contract surface (design-locked)

```ts
export default abstract class ORSetLike {
  // Mutators
  abstract add(element: string, dot: Dot): void;
  abstract remove(observedDots: ReadonlySet<string>): void;
  abstract compact(includedVV: VersionVector): void;

  // Queries
  abstract contains(element: string): boolean;
  abstract elements(): string[];
  abstract getDots(element: string): Set<string>;
  abstract hasDot(element: string, encodedDot: string): boolean;
  abstract isTombstoned(encodedDot: string): boolean;
  abstract countEntries(): number;
  abstract countLiveDots(): number;
  abstract countTombstones(): number;
  abstract entriesIter(): IterableIterator<[string, ReadonlySet<string>]>;
  abstract entryDotsIter(): IterableIterator<string>;

  // Transformations
  abstract clone(): ORSetLike;
  abstract join(other: ORSetLike): ORSetLike;
  abstract scopedClone(includeElement: (element: string) => boolean): ORSetLike;

  // Serialization
  abstract serialize(): SerializedORSetLike;
}
```

Factories (`ORSet.empty`, `ORSet.deserialize`) remain on the concrete
class — they produce a concrete type that satisfies the contract.

## Notes

- Tests that introspect `orset.entries` / `orset.tombstones` continue
  to work: those fields stay on the concrete `ORSet` class and are
  preserved by the existing ImmutableSnapshot cloner. The contract is
  for source consumers, not for test-level introspection.
- `scopedClone(predicate)` preserves ALL tombstones (not just ones
  matching the predicate). This matches the existing
  `VisibleStateScope.cloneScopedOrSet` behavior exactly.
- Per AGENTS.md: `interface` is for ports only. `ORSetLike` is a
  domain concept, so it is an abstract class.

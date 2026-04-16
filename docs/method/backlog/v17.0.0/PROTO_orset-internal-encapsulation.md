---
id: PROTO_orset-internal-encapsulation
blocked_by: []
blocks:
  - PROTO_state-session-async
---

# Encapsulate ORSet internals behind contract methods on the concrete class

## Problem

Source files outside `src/domain/crdt/ORSet.ts` read `orset.entries`
and `orset.tombstones` directly. These are public fields on the
concrete class, which means the in-memory representation is ossified
across four consumer sites:

- `DiffCalculator.buildDotToElement` — iterates `orset.entries`
- `ReceiptBuilder.hasEffectiveRemoval` — reads `orset.tombstones.has(...)`
- `ReceiptBuilder.nodeAddOutcome` / `edgeAddOutcome` — read
  `orset.entries.get(x)?.has(y)`
- `CheckpointSerializer.computeAppliedVV` — iterates
  `orset.entries.values()`
- `VisibleStateScope.cloneScopedOrSet` — mutates `entries` and
  `tombstones` on a fresh ORSet

The leak means every consumer pins the concrete Map/Set shape.
Changing the representation — even for performance wins like
entry compression — would touch all these sites.

## Fix

Add encapsulated query and transformation methods on the concrete
`ORSet` class:

- `hasDot(element, encodedDot): boolean`
- `isTombstoned(encodedDot): boolean`
- `entriesIter(): IterableIterator<[string, ReadonlySet<string>]>`
- `entryDotsIter(): IterableIterator<string>`
- `scopedClone(includeElement): ORSet`

Retype consumers to use these methods. The consumer types stay
concrete `ORSet` — there is NO abstract parent class.

## Non-goals (explicit)

- **No `ORSetLike` abstract class or interface.** Cycle 0023
  attempted this and closed not-met: the only sync in-memory impl is
  `ORSet`, and `ShadowTrieORSet` is async behind `StateSession`. A
  sync parent with one impl is fake abstraction. See
  `docs/method/retro/0023-orsetlike-contract/orsetlike-contract.md`.
- No async changes. No `StateSession`. No trie code.
- No move into `packages/warp-orset/`.

## Scope

**In:**
- New methods on `src/domain/crdt/ORSet.ts`.
- Retype of every consumer call site that reads `.entries` or
  `.tombstones` on an ORSet. Consumers keep typing against `ORSet`.
- Replace `IncrementalIndexUpdater`'s `WarpStateLike` duck type
  (`{ nodeAlive: { contains(key: string): boolean }; edgeAlive: ORSet }`)
  with the real `WarpState` type where possible. If a narrower
  shape is genuinely needed, it must be a runtime-backed domain
  type, not an anonymous object literal.

**Out:**
- The broader `Record<string, unknown>` sludge in
  `IncrementalIndexUpdater` (filed as separate bad-code item).
- Shadow-Trie design doc revisions (file as separate doc task).

## Exit criteria

- Zero reads of `orset.entries` or `orset.tombstones` in `src/**`
  outside `src/domain/crdt/ORSet.ts`.
- All 6321 unit tests pass.
- `npm run typecheck` green.
- No new `any`, `unknown`, or `as` assertions introduced.

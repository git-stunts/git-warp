---
title: "Encapsulate ORSet internals behind contract methods on the concrete class"
legend: "PROTO"
cycle: "0024-orset-internal-encapsulation"
source_backlog: "docs/method/backlog/v17.0.0/PROTO_orset-internal-encapsulation.md"
---

# Encapsulate ORSet internals behind contract methods on the concrete class

Source backlog item: `docs/method/backlog/v17.0.0/PROTO_orset-internal-encapsulation.md`
Legend: PROTO
Successor to: cycle 0023 (NOT MET — `ORSetLike` abstract parent was sludge)

## Sponsors

- Human: Backlog operator
- Agent: Implementation agent

## Hill

Zero reads of `orset.entries` or `orset.tombstones` in any source
file outside `src/domain/crdt/ORSet.ts`. The concrete `ORSet` class
exposes `hasDot`, `isTombstoned`, `entriesIter`, `entryDotsIter`,
and `scopedClone` methods; consumers type against the concrete
`ORSet` class (no abstract parent). All pre-existing tests pass
unchanged.

## Playback Questions

### Human

- [ ] Does the diff touch only ORSet.ts and its 4 direct consumers
      (DiffCalculator, ReceiptBuilder, VisibleStateScope,
      CheckpointSerializer)?
- [ ] Are there any new `any`, `unknown`, `as` assertions, or
      `*Like` types introduced? (expected: no)
- [ ] Does the commit introduce an `ORSetLike`-equivalent
      abstraction by another name? (expected: no — lessons from
      cycle 0023 applied)

### Agent

- [ ] `rg "orset\.entries\|orset\.tombstones" src/` outside
      `src/domain/crdt/ORSet.ts` returns zero matches.
- [ ] Consumer types stay concrete `ORSet` — no fake parent class.
- [ ] New methods are members of the concrete class, named after
      the operation they perform, not after a shape.

## Accessibility and Assistive Reading

- Linear truth / reduced-complexity posture: new methods are
  one-liners or two-liners, each with a precise docstring. No
  generic helper corridors.
- Non-visual or alternate-reading expectations: N/A.

## Localization and Directionality

N/A (code-only).

## Agent Inspectability and Explainability

- What must be explicit and deterministic for agents: each method
  has a precise return type (e.g. `IterableIterator<[string,
  ReadonlySet<string>]>` not `any`); `ReadonlySet` on the yielded
  dots prevents external mutation.
- What must be attributable: all changes preserve existing test
  behavior; no test body was modified.

## Non-goals

- [ ] No `ORSetLike` abstract class — cycle 0023's lesson.
- [ ] No async surface. No `StateSession`. No trie code.
- [ ] No move into `packages/warp-orset/`.
- [ ] `IncrementalIndexUpdater`'s broader `Record<string, unknown>`
      sludge is filed as a separate bad-code item, not in scope.

## Scope

**In:**
- New methods on `src/domain/crdt/ORSet.ts`: `hasDot`,
  `isTombstoned`, `entriesIter`, `entryDotsIter`, `scopedClone`.
- Retype of the four consumer sites to use the new methods.

**Out:**
- `WarpStateLike` duck type in `IncrementalIndexUpdater` — filed
  under cycle 0025C (fake-model purge).
- Any async-surface work.

## Backlog Context

## Problem

Source files outside `src/domain/crdt/ORSet.ts` read `orset.entries`
and `orset.tombstones` directly. The leak means every consumer
pins the concrete Map/Set shape. Changing the representation —
even for performance wins — would touch all these sites.

## Fix

Add encapsulated query and transformation methods on the concrete
`ORSet` class. Retype consumers to use them. No abstract parent.

## Relationship to cycle 0023

Cycle 0023 tried `ORSetLike` as an abstract parent. That was
sludge: the only synchronous in-memory impl is `ORSet` itself, and
`ShadowTrieORSet` is async behind `StateSession` (different seam).
A parent class that parents a single concrete type forever is not
an abstraction, it's a ceremony. This cycle keeps the good work
from that session — the methods and the leak elimination — but
omits the abstract parent.

---
title: "Trie compaction"
cycle: "0039-trie-compaction"
---

# Trie Compaction

## Why this exists

Cycle `0038` made `ShadowTrieORSet` real as the async storage-backed engine.

That engine still lacks the GC-side operation that makes bounded residency
honest over time: compaction of stable tombstones and structural cleanup of
undersized leaves.

The in-memory `ORSet` already has the semantic law in
[ORSet.ts](../src/domain/crdt/ORSet.ts):

- remove tombstoned dots that are at or below the stable frontier
- drop dead entries whose live-dot set becomes empty

The trie-backed form must now do the same thing over persisted leaf/branch
structure.

## Hill

A contributor can now answer:

- what `compact(includedVV)` means on a trie-backed ORSet
- how leaf rewrite and branch collapse should work
- what helper owns compaction so `ShadowTrieORSet` does not become a god
- how to test tombstone GC and structural merge honestly

## Design goals

1. Preserve the in-memory ORSet compaction law exactly.
2. Keep compaction separate from `StateSession` lifecycle and GC scheduling.
3. Keep `ShadowTrieORSet` thin by introducing a dedicated trie compaction
   helper.
4. Make structural merge/collapse deterministic and geometry-driven.
5. Bound the first cut to compaction over one engine instance; no cross-session
   orchestration.

## Non-goals

- No GC policy or scheduling in this cycle.
- No semilattice proof work in this cycle.
- No `StateSession` integration in this cycle.
- No attempt to compact legacy checkpoint blobs or old substrate forms.

## Core law

`compact(includedVV)` means:

1. visit every leaf in the trie
2. identify dots that are both:
   - tombstoned in the leaf entry
   - causally included in `includedVV`
3. remove those dots from the entry
4. if an entry now has no live dots and no retained tombstoned dots, remove the
   entry itself
5. if a leaf drops below the geometry merge floor, collapse structure upward
   where lawful

The critical safety rule is unchanged from the in-memory ORSet:

- only compact dots that all replicas have already observed

## Shape

### Public engine surface

`ShadowTrieORSet` should grow one new method:

```ts
compact(includedVV: VersionVector): Promise<void>
```

It remains owner-facing and internal to the trie-backed line. `StateSession`
will call it later; this cycle only makes it exist and work.

### Internal helper

To keep the engine thin, compaction should live in a dedicated helper:

```ts
class TrieCompactor {
  constructor(init: {
    cursor: TrieCursor;
    geometry: TrieGeometry;
  }) { ... }

  compact(includedVV: VersionVector): Promise<void>;
}
```

`ShadowTrieORSet.compact()` should delegate to that helper.

This keeps three concerns separate:

- engine API shape
- cursor navigation and dirty-page ownership
- compaction policy and structural merge logic

## Structural rules

### 1. Leaf rewrite

For each `TrieLeafEntry`:

- scan `tombstonedDots`
- remove any tombstoned dot included by `includedVV`
- remove the same dot from `dots` if still present there
- if no live dots remain, drop the entry

The rewritten leaf becomes dirty only if something actually changed.

### 2. Empty-leaf handling

If a leaf becomes empty after compaction:

- remove the leaf from its parent branch
- dirty the parent branch

### 3. Undersized-leaf merge

If a leaf is non-empty but `geometry.mergeRequired(entryCount)` is true:

- try to merge it with a sibling leaf under the same parent branch
- only merge if the combined entry count fits within `leafCapacity`
- merged leaf entries must remain strictly sorted by suffix

If no lawful sibling merge exists, keep the undersized leaf as-is. Compaction
should not invent lossy or geometry-breaking structure changes.

### 4. Branch collapse

After child updates:

- if a branch has no remaining children, remove it from its parent
- if a branch has exactly one child and that child is a leaf, collapse the
  branch so the leaf hangs directly from the next higher branch when lawful

The first cut should prefer clear lawful collapse rules over “collapse every
possible sparse branch” cleverness.

## Ownership and mutation

Compaction must work through the same dirty-page law as `TrieCursor`:

- rewrite leaves as new `TrieLeaf` instances
- rewrite branches as new `TrieBranch` instances
- keep structural sharing for untouched subtrees
- leave persistence to the existing flusher path

This cycle should not bypass the cursor and mutate store objects directly.

## Playback questions

### Agent

- Can I explain why trie compaction must preserve the same stable-frontier law
  as the in-memory ORSet?
- Can I explain when an undersized leaf is allowed to merge versus when it must
  stay put?
- Can I point to one helper that owns compaction policy instead of bloating the
  engine?

### Human

- Does this feel like honest GC compaction instead of opportunistic shape
  rewriting?
- Is the boundary between compaction, session lifecycle, and GC policy clear?
- Does the structural merge story feel deterministic and geometry-driven?

## Test plan

### Golden path

- compaction removes tombstoned dots included in `includedVV`
- entries with no remaining live dots disappear
- `contains()` and `scan()` no longer report compacted-away elements
- `flush()` after compaction persists the cleaned structure and a reopened
  engine sees the compacted state

### Edge cases

- dots not included in `includedVV` remain intact
- compacting an already-clean trie is a no-op
- empty observed set / empty trie compaction is a no-op
- undersized leaf merge succeeds when sibling fit is lawful
- a too-large sibling pair does **not** merge
- single-child branch collapse preserves reachability

### Known failure modes

- compaction removes dots that are not in the stable frontier
- compaction drops sibling structure incorrectly and loses reachable elements
- merge produces an unsorted leaf
- compaction rewrites untouched branches and defeats structural sharing
- engine/session boundaries blur and compaction starts owning flush policy

## Red targets

Likely test surfaces:

- `test/unit/domain/orset/shadow/ShadowTrieORSet.compaction.test.ts`
- existing trie engine/cursor/flusher helpers

One narrow reopen assertion should prove:

- compact
- flush
- reopen
- observe only the stable surviving set

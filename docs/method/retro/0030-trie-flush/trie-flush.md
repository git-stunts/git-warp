---
title: "Bottom-up flush of dirty trie pages to Git"
cycle: "0030-trie-flush"
design_doc: "docs/design/0030-trie-flush/trie-flush.md"
outcome: hill-met
drift_check: yes
---

# Cycle 0030 Retro — TrieFlusher

**Status:** HILL MET

## Hill

`TrieFlusher` consumes a `DirtyPageSet` produced by cycle 0029's
cursor and persists it into the trie store. Bottom-up walk;
sequential writes; structural sharing via `cleanChildOidAt`;
pending child OIDs resolved from the flush's own new-OID map.
Empty snapshot returns the incoming root OID with zero writes.
Everything ends in a frozen `FlushResult` — the sole handoff
back to the caller.

## What ground was taken

### Code (three new source files)

- `src/domain/errors/TrieFlushError.ts` — `WarpError` subclass
  with four typed codes: `E_TRIE_FLUSH_STORE` (default),
  `E_TRIE_FLUSH_ENCODE`, `E_TRIE_FLUSH_UNRESOLVED`,
  `E_TRIE_FLUSH_STRUCTURE`. Matches the cycle 0026/0027/0029
  convention (own file, not re-exported from the errors barrel).
- `src/domain/orset/trie/FlushResult.ts` — frozen result value
  object with four fields (`rootOid`, `blobsWritten`,
  `treesWritten`, `bytesWritten`) and an `isClean()` predicate.
  Constructor validates every field; invalid inputs raise
  `TrieFlushError(E_TRIE_FLUSH_STRUCTURE)`.
- `src/domain/orset/trie/TrieFlusher.ts` — the flusher class.
  One public method (`flush`) and a small internal state record.
  Child-OID resolution lives in a pure helper
  (`resolveBranchChildren` / `resolveChildOid`). Three store-
  operation wrappers each serialize their own error
  classification.

### Tests (two new suites, 22 new tests + 4 integration)

- `test/unit/domain/orset/trie/TrieFlusher.test.ts` — 18 unit
  tests covering `FlushResult` (construction, freeze, validation,
  isClean), empty snapshot short-circuit, single-mutation flush,
  cascading-split round-trip, structural sharing, deterministic
  output, and all three error codes (unresolved pending OID,
  writeLeaf failure, writeBranch failure). Plus a clean-child
  fallback test to lock the `cleanChildOidAt` preservation
  behaviour.
- `test/integration/domain/orset/trie/TrieCursor.flush.integration.test.ts`
  — 4 integration tests against a real Git repository via
  `GitTrieStoreAdapter`: single element, 20-element cascading
  tree (with `git cat-file -t` validation of the written root),
  incremental update against a previously-flushed root, and
  empty-flush.

### Cursor refinement (necessary side effect)

The integration harness exposed one ambiguity in the cursor's
cold-load kind disambiguation that was dormant under the
`InMemoryTrieStore`: real Git's `cat-file blob <tree-oid>`
returns EMPTY bytes in some versions rather than an error, or
bytes that decode as malformed CBOR. The cursor's `#tryReadLeaf`
now treats both cases (empty bytes, CBOR decode failure) as
"not a leaf, fall through to `readBranch`". The updated behaviour
is documented inline and matches the adapter semantics.

One unit test was re-labelled from "surfaces a decode failure as
E_TRIE_CURSOR_DECODE" to "surfaces a malformed-leaf fallthrough
as E_TRIE_CURSOR_STORE" to reflect the new behaviour. The
`E_TRIE_CURSOR_DECODE` code is still produced — it is still the
error the cursor raises when `readBranch` succeeds but
`TrieBranch`'s constructor rejects the entries. That path is
exercised indirectly via the cursor's validation layer.

### Docs

- `docs/design/0030-trie-flush/trie-flush.md` — design doc
  opened at cycle start; source backlog item
  `docs/method/backlog/v17.0.0/PROTO_trie-flush.md` absorbed
  and removed.
- `src/domain/orset/README.md` — trie-subdir row updated to
  reflect `TrieFlusher.ts` and `FlushResult.ts` as shipped
  under cycle 0030.

## Design decisions locked

- **Bottom-up deterministic walk** — `DirtyPageSet.enumerateBottomUp()`
  is the sole ordering source. Two flushes of the same snapshot
  against the same content-addressed store produce identical
  root OIDs (the deterministic-output test proves it).
- **Sequential writes** — no implicit fan-out. `TrieStorePort`
  does not promise concurrency safety; the flusher does not
  ask.
- **No partial-flush recovery** — a store fault mid-walk raises
  `TrieFlushError` with the last path; the caller decides
  whether to retry with the same snapshot (the snapshot is
  immutable).
- **Resolution order** — for each child-slot in a dirty branch:
  (1) freshly-written OID from this flush, (2) clean-child OID
  recorded by the cursor, (3) the branch's own original child
  OID if not a `pending:` sentinel. Anything else raises
  `E_TRIE_FLUSH_UNRESOLVED`.
- **Pending sentinels are a load-bearing contract** — the
  cursor emits `pending:<path-key>` in every fresh child slot.
  The flusher recognises the prefix and refuses to persist a
  branch with a residual sentinel. This catches cursor/flusher
  handshake bugs early.
- **`FlushResult` validates its own inputs** — no back-door
  `as` casts into invalid states. Same SSTS P1 invariant
  enforcement as `TrieGeometry`/`TrieLeaf`/`TrieBranch`.
- **Root-is-leaf is NOT allowed** — matches cycle 0029's
  invariant. The cursor always wraps a leaf in a root branch,
  so the flusher never has to decide between writing a leaf as
  the root vs wrapping it. The `rootOid` field on `FlushResult`
  always addresses a branch when non-null.
- **No scripting-style file helpers** — everything the flusher
  needs lives as methods on the class (store wrappers) or as
  pure functions at module scope (child-OID resolution,
  `pending:` prefix check). No separate `trieFlushHelpers.ts`
  because the flusher fit comfortably under the SSTS per-method
  caps without extraction.

## Test count delta

| Slice | Tests added |
|-------|-------------|
| `FlushResult` | 7 |
| `TrieFlusher` (unit) | 11 |
| `TrieCursor.flush` (integration) | 4 |
| **Total new** | **22** |

Full suite after cycle: **6515 tests across 361 files**, all
passing. Baseline after cycle 0029 close was 6493/359. Delta
matches 22 new tests across two new test files (one unit, one
integration).

## Gate results

| Gate | Result |
|------|--------|
| `npm run typecheck` | green (tsconfig.src.json + tsconfig.test.json) |
| `npm run test:local` | 6515/6515 green (unit suite) |
| Integration tests | 4/4 green via real Git + GitTrieStoreAdapter |
| `npm run lint` | 0 errors |
| `npm run lint:sludge` | green |
| `npm run lint:contamination` | zero manifest drift |
| `npm run lint:semgrep` | **22 unquarantined violations — identical to baseline**. No violation touches any file this cycle created or modified. |

## Playback

### Agent

1. *Does `flush(emptySnapshot)` return the incoming root OID
   with zero writes?* Yes. Two dedicated tests (null rootOid
   and non-null rootOid) cover both shapes of empty snapshot.
2. *Does `flush` walk the dirty set bottom-up?* Yes. Covered
   indirectly by the cascading-split round-trip — the flusher
   MUST persist leaves before branches, or branch children
   would reference non-existent OIDs. The cursor/flusher
   integration test catches that regression immediately.
3. *Do sibling subtrees the cursor did not modify reuse their
   original OIDs?* Yes. The structural-sharing test asserts
   that modifying one element in a 10-element trie writes
   strictly fewer objects than the baseline, and the replay
   cursor observes both the original 10 elements and the new
   one.
4. *Does `flush` produce a real root OID when the source trie
   was empty?* Yes. Covered by the single-mutation unit and
   integration tests (source cursor opens with `rootOid: null`;
   flush returns a non-null OID).
5. *Do store failures bubble as `TrieFlushError` with typed
   codes and the offending path?* Yes. Three dedicated tests:
   `E_TRIE_FLUSH_STORE` via `writeLeaf` fault,
   `E_TRIE_FLUSH_STORE` via `writeBranch` fault, and
   `E_TRIE_FLUSH_UNRESOLVED` via a fabricated snapshot with a
   bare `pending:` sentinel. The `path` context is asserted in
   the writeLeaf case.
6. *Are writes sequential?* Yes. The flush loop is a single
   `for...await...of`. No `Promise.all`, no fan-out.

### Human

Deferred to review.

## How the flusher interacts with the pieces around it

- **`DirtyPageSet` (cycle 0029)** — sole input. The flusher
  relies on `enumerateBottomUp()` for ordering, `rootOid()` for
  the clean-return path, `cleanChildOidAt()` for structural
  sharing, and `isEmpty()` for the zero-write short-circuit.
- **`TrieStorePort` (cycle 0026)** — sole output. Three methods
  consumed: `writeLeaf`, `writeBranch`. (Reads happen during
  cursor-side descent, not during flush.)
- **`TrieLeaf.serialize` (cycle 0027)** — the codec boundary.
  Serialize errors become `E_TRIE_FLUSH_ENCODE`.
- **`TrieBranch.entries` (cycle 0027)** — the child-map
  accessor used during resolution.
- **`GitTrieStoreAdapter` (cycle 0028)** — not a direct
  dependency (the flusher consumes the port, not the concrete
  adapter), but the integration suite validates the end-to-end
  round trip through it.

## Drift

- **One cursor refinement made it into this cycle's scope.**
  The `#tryReadLeaf` fallthrough change was triggered by the
  integration harness. The alternative was to leave the
  integration test broken — which would have failed the gate
  policy. The refinement is small and is documented in both
  this retro and the cursor's JSDoc.
- **No other drift.** No changes to existing adapters, ports,
  or codec modules. No quarantine-manifest mutations. No new
  semgrep violations. No `src/` file edits outside the cycle's
  own files plus the cursor.

## New debt

- None. The flusher has no external coupling beyond the cycle
  0022/0026/0027/0029 types.

## Pre-existing gate noise surfaced

`npm run lint:semgrep` reports 22 unquarantined violations on
`release/v17.0.0` baseline. Identical count on this branch. All
22 are on files NOT touched by this cycle. Same baseline the
cycle 0027/0028/0029 retros documented.

## How this unblocks downstream

- **`PROTO_checkpoint-envelope-publication`** — unblocked on
  the trie-root side. The envelope tree can now reference a
  real `FlushResult.rootOid` obtained from `TrieFlusher.flush`.
  The checkpoint publisher wraps that OID in a commit and
  updates the ref.
- **`PROTO_shadow-trie-orset`** — unblocked. The ORSet engine
  can now `open(rootOid) → mutate → flush() → close()` with
  the pieces this line shipped.
- **`PROTO_state-session-async`** — unblocked on the
  persistence side. The session's close path flushes the
  cursor's snapshot and publishes the returned root.
- **`PERF_lru-page-cache`** — orthogonal; sits in front of
  `readLeaf`/`readBranch` and reduces the cold-load round
  trips the cursor currently eats.

## Backlog maintenance

- [x] `PROTO_trie-flush.md` removed from `v17.0.0/` lane at
      cycle open (content absorbed into design doc).
- [x] Seam README trie row updated: cycle 0030 shipped
      `TrieFlusher.ts` and `FlushResult.ts`.
- [x] Downstream items (`PROTO_checkpoint-envelope-publication`,
      `PROTO_shadow-trie-orset`, `PROTO_state-session-async`)
      noted as unblocked.
- [x] No dead backlog refs introduced.
- [x] No new backlog entries filed.

## Progress report

Hill ahead of us: take a dirty-page snapshot the cursor handed
us, walk it deepest-first, write every leaf as a Git blob and
every branch as a Git tree, splice clean OIDs where the cursor
recorded them, resolve every `pending:` sentinel before writing
the branch that carries it, and come back with a fresh root OID
that a second cursor can re-open and observe the same elements.

Mess we got INTO: the in-memory store's `readLeaf(<tree-oid>)`
raises MISSING, so the cursor's try-leaf-first probe falls
through cleanly. But real Git's `cat-file blob <tree-oid>`
returns EMPTY bytes (no error) in some versions; on other
versions the stream collect returns SOMETHING and the cursor
attempts to CBOR-decode a Git tree header. Cursor gets
"Unexpected end of CBOR data" and the user gets
`E_TRIE_CURSOR_DECODE` when they asked for `contains`.

Mess we got OUT of: the fallthrough now treats both empty-bytes
and CBOR-decode failure as "not a leaf, try branch". One unit
test was relabelled to assert the new, correct behaviour; four
integration tests now run green against real Git; the
deterministic-output unit test verifies same-input-same-root-OID
across two independent stores.

What this cycle shipped: 22 new tests, zero new semgrep noise,
zero quarantine drift, a real round trip from cursor → flush →
cursor all the way through `git cat-file`. `FlushResult` is a
frozen summary, `TrieFlushError` has four typed codes, and the
`pending:` sentinel contract between cursor and flusher is
documented, enforced, and tested.

What comes next: `PROTO_checkpoint-envelope-publication` wraps
the flusher's root in a checkpoint commit. `PROTO_shadow-trie-orset`
puts an ORSet-shaped facade in front of the cursor+flusher
pair. `PERF_lru-page-cache` eliminates the cold-load extra
round trip by caching decoded pages. The trie is no longer
just a data structure — it's a data structure with a
persistence contract, and it travels.

HOO RAH.

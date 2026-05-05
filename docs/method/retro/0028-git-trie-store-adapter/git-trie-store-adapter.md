---
title: "Git-native TrieStorePort adapter over raw Git blobs and trees"
cycle: "0028-git-trie-store-adapter"
design_doc: "docs/design/0028-git-trie-store-adapter/git-trie-store-adapter.md"
outcome: hill-met
drift_check: yes
---

# Cycle 0028 Retro — GitTrieStoreAdapter

**Status:** HILL MET

## Hill

`GitTrieStoreAdapter` implements `TrieStorePort` end-to-end against
native Git plumbing. Leaf blobs via `hash-object -w` / `cat-file
blob`, branch trees via `mktree` / `ls-tree` (non-recursive).
Branch entries named by nibble index in lowercase hex, zero-padded
to the minimum width required by the largest nibble. Unit tests
cover all four `TrieStoreError` codes and round-trips across 2/16/64/256-way
fanouts; integration tests validate the output against real Git.

## What ground was taken

### Code (two new files)

- `src/infrastructure/adapters/GitTrieStoreAdapter.ts` — the
  adapter. Consumes `GitPlumbing` directly (no `GraphPersistencePort`
  dependency, because the existing `readTreeOids` uses `ls-tree -r`
  which recurses into subtrees and would flatten a branch-of-branch
  hierarchy). All four port methods, each with typed error
  classification. No raw `Error`, no message parsing by callers,
  no Buffer leaking into the domain.
- `src/infrastructure/adapters/trieNibbleName.ts` — the nibble-name
  parser, extracted to its own file because it is the adapter's
  only real parsing boundary and benefits from isolated unit
  testing.

### Tests (two new files)

- `test/unit/infrastructure/adapters/GitTrieStoreAdapter.test.ts` —
  33 tests across constructor safety, leaf round-trips (empty, 1-byte,
  multi-byte binary, 1 MiB), branch round-trips (2/16/64/256-way
  fanouts plus sparse and empty), mode-bit tagging (100644 blob vs.
  040000 tree), nibble-name width auto-selection (1 digit for <16,
  2 digits for <=255), all four `TrieStoreError` codes, silent
  `cat-file -e` exits, pre-wrapped errors passing through write
  classification, and `Uint8Array` boundary preservation. 100%
  branch coverage on both adapter source files.
- `test/integration/infrastructure/adapters/GitTrieStoreAdapter.integration.test.ts`
  — 9 tests against a real Git repo initialised in a temp directory
  via `Plumbing.createDefault`. Validates written leaves against
  `git cat-file -t` / `git cat-file blob`, written branches against
  `git cat-file -t` / `git ls-tree` (and `git cat-file -p`), a full
  branch-of-branches-of-leaves hierarchy, and `E_TRIE_STORE_MISSING`
  for reads against the all-zeros OID.

### Docs

- `src/domain/orset/README.md` — trie-subdir row updated to reflect
  the adapter as shipped under cycle 0028 (at `src/infrastructure/adapters/`
  rather than `src/domain/orset/trie/`, because it is host-specific
  code and belongs in infrastructure, not in the warp-orset seam).
- Backlog item `docs/method/backlog/v17.0.0/INFRA_git-trie-store-adapter.md`
  removed; content absorbed into the cycle design doc.

## Playback

### Agent

1. *Can a 256-way branch round-trip through a real Git repo without
   name collisions, truncation, or silent drops?*
   Yes — verified by both unit and integration tests at 256-way
   fanout. Two-digit hex names (`00`..`ff`) encode the full range.

2. *Does the adapter treat leaf children and branch children
   differently at write time but identically at read time?*
   Yes — at write time the adapter probes each child OID's type
   with `cat-file -t` and emits `100644 blob` or `040000 tree`
   accordingly. At read time the port's `TrieBranchEntries` maps
   nibble indices to OIDs without kind information, by design.

3. *Do all four `TrieStoreError` codes surface through public paths?*
   Yes — `E_TRIE_STORE_MISSING` via missing-object reads, writes of
   branches whose child OIDs don't exist, and the silent `cat-file
   -e` exit path; `E_TRIE_STORE_CORRUPT` via non-hex or empty
   nibble names and malformed ls-tree records; `E_TRIE_STORE_WRITE`
   via non-blob/non-tree child kinds, `mktree` failures, and
   `hash-object` failures; `E_TRIE_STORE_READ` via opaque
   non-missing read failures.

4. *Does the seam README reflect the adapter as shipped?*
   Yes — trie-subdir row in `src/domain/orset/README.md` now lists
   `GitTrieStoreAdapter.ts` under cycle 0028.

### Human

Deferred to review.

## Adapter surface

### Port satisfied

`TrieStorePort` (cycle 0026) — `readLeaf`, `readBranch`,
`writeLeaf`, `writeBranch`.

### Ports consumed

The adapter consumes **exactly one port-like dependency**:
`GitPlumbing` (injected via a single-key deps object). The
`GitPlumbing` contract lives in `gitErrorClassification.ts`
alongside `GitGraphAdapter` and `GitTrustChainAdapter`.

Notable non-consumers:

- **No `GraphPersistencePort`.** The cycle brief suggested routing
  through it, but `readTreeOids` uses `ls-tree -r` (recursive),
  which would flatten a branch-of-branch hierarchy. Adding a
  non-recursive sibling method to `TreePort` would pollute the
  existing port for one consumer; keeping the adapter's plumbing
  call local keeps the blast radius minimal.
- **No `BlobPort`, no `TreePort`.** Same rationale — `readTreeOids`
  disqualifies the tree port, and going through the blob port
  alone would mean half the adapter consumes a port and the other
  half consumes plumbing directly. Picking one shape (direct
  plumbing) beat splitting.
- **No `CommitPort`, no `RefPort`, no `git-cas`.** Per scope. The
  adapter performs pure blob/tree object I/O.

### Storage semantics

- **Leaves are Git blobs.** Content-addressed. Two writes of the
  same bytes yield the same OID (integration-tested).
- **Branches are Git trees.** `mktree`-built. Sorted by entry name
  (mktree's natural behavior). Same child map yields the same
  tree OID regardless of insertion order.
- **Modes.** Leaf children get `100644 blob`. Branch children get
  `040000 tree`. The adapter picks the right mode by probing the
  child OID's type via `cat-file -t`.
- **Non-blob, non-tree children are rejected.** Commits or tags
  raise `E_TRIE_STORE_WRITE` with the offending kind in context.

## Nibble naming decision

**Convention:** lowercase hex, zero-padded to the minimum width
required by the largest nibble in the write-side map.

| Fanout        | Width | Example names          |
|---------------|-------|------------------------|
| 2 (1-bit)     | 1     | `0`, `1`               |
| 16 (4-bit)    | 1     | `0`, `1`, ..., `f`     |
| 64 (6-bit)    | 2     | `00`, `01`, ..., `3f`  |
| 256 (8-bit)   | 2     | `00`, `01`, ..., `ff`  |

Rationale:

- **Width is adapter-local, not a port parameter.** The port's
  `TrieBranchEntries` is geometry-agnostic. Hard-coding one width
  would tie the adapter to one geometry and break under benchmark-
  driven fanout changes.
- **Pad to `ceil(log2(maxNibble + 1) / 4)`.** A branch with only
  `{0}` writes `"0"`; a branch with `{0, 200}` writes `"00"` and
  `"c8"`. This keeps names as short as possible while remaining
  geometry-honest.
- **Lowercase hex only.** Matches Git's standard OID casing and
  makes `git ls-tree` output uniformly parseable.
- **Read-side decodes any width.** The parser accepts non-empty
  lowercase hex strings of any length and decodes them as
  non-negative integers. The adapter does not range-check against
  a geometry — that's the codec's job.

Alternatives considered and rejected:

- Always 2-digit names (padded `00` even for 16-way): wasted bytes
  in 16-way trees, and makes inspecting `git ls-tree` output on a
  small geometry unnecessarily noisy.
- Embed kind into the port's entry type (`{ oid, kind }`): rejected
  because it widens the port for a single adapter's convenience
  and leaks a Git-ism into the domain seam.

## Error mapping

| Plumbing outcome                                         | Mapped code             |
|----------------------------------------------------------|-------------------------|
| `cat-file` / `ls-tree` stderr matches a known missing-object phrase (`bad object`, `bad file`, `not a valid object name`, `does not point to a valid object`, `missing object`, `could not read`, `not a tree object`) at exit 128 or 1 | `E_TRIE_STORE_MISSING`  |
| Silent exit 1 from `cat-file -e` (empty stderr after a zero-byte read) | `E_TRIE_STORE_MISSING` |
| Tree entry name empty or containing non-hex characters   | `E_TRIE_STORE_CORRUPT`  |
| `ls-tree` record missing a tab or an OID column          | `E_TRIE_STORE_CORRUPT`  |
| `mktree` / `hash-object` non-zero exit                   | `E_TRIE_STORE_WRITE`    |
| `cat-file -t` reports a kind that isn't `blob` or `tree` | `E_TRIE_STORE_WRITE`    |
| Any other read-side plumbing failure                     | `E_TRIE_STORE_READ`     |

All failures carry a structured `context` with at least the
relevant OID or raw record name. The adapter never returns a
`Buffer` — it converts at the boundary.

## Test strategy: unit vs. integration

**Unit (33 tests, 100% branch coverage):** exercise every public
path through an inline `GitPlumbing` test double that captures
args/input per call and returns canned outputs. Error paths use
small single-purpose plumbing doubles (e.g., one that always
returns an opaque error, one that returns `commit` from `cat-file
-t`, one that silently exits 1). This is how we hit every branch
of `isMissingObject`, `isSilentMissing`, and
`classifyWriteFailure`.

**Integration (9 tests):** run against real Git via
`Plumbing.createDefault` on a `mkdtemp` temp directory. They
confirm what unit tests can't: that the bytes we send to `mktree`
produce a tree recognisable by `git cat-file -p`, that the bytes
we read back from `cat-file blob` match what we wrote, and that
a branch-of-branches-of-leaves hierarchy walks natively under
`git cat-file -p`.

The integration suite also surfaced two things the unit suite
couldn't:

- Real `git cat-file blob` on a missing OID says `fatal: git
  cat-file <oid>: bad file` — not `bad object`. Added `bad file`
  to `MISSING_OBJECT_HINTS`.
- Real `git ls-tree` on a missing OID says `fatal: not a tree
  object`. Added `not a tree object` to `MISSING_OBJECT_HINTS`.
- Real `git cat-file -e <oid>` on a missing OID exits 1 with an
  empty stderr. That silent exit carries no text the keyword
  classifier can match, so added an `isSilentMissing()` helper on
  the probe path that maps a silent exit-1 to
  `E_TRIE_STORE_MISSING`.

Those were real bugs discovered by the integration suite. Fixed
in a follow-up commit (`fix(infra/trie): classify silent cat-file
-e exits and extra git phrasings as missing objects`).

## Design decisions locked

- **Adapter consumes `GitPlumbing` directly, not
  `GraphPersistencePort`.** The composite port's `readTreeOids`
  recurses; the adapter needs a flat, non-recursive tree read.
  Going straight to plumbing matches the existing pattern in
  `GitTrustChainAdapter`.
- **Kind probe via `cat-file -t`, not a port-level entry tag.**
  The cost is one extra plumbing call per branch child. The
  alternative (widening `TrieBranchEntries`) would leak Git-isms
  into the domain seam.
- **Silent `cat-file -e` maps to missing.** Git emits an empty
  stderr on exit 1 when the object doesn't exist — the classifier
  has to recognise that specifically.
- **Nibble-name parser in its own file.** It's the adapter's only
  real parsing boundary and deserves isolated unit tests.
- **Mode constants named.** `100644 blob` and `040000 tree` live
  as named constants (`BLOB_MODE`, `TREE_MODE`, `BLOB_TYPE`,
  `TREE_TYPE`) — no magic strings.

## Drift

- None inside the cycle scope. No modifications to existing
  adapters, ports, or the TrieStorePort contract itself.
- One self-inflicted process incident: a `git stash pop` inside the
  worktree accidentally tried to apply a pre-existing stash that
  wasn't mine. Recovered cleanly via `git reset --merge` (the
  non-destructive merge-abort variant). No user data lost; all
  three pre-existing stashes remain in the stash list; my commits
  were never at risk.

## New debt

- None introduced. The adapter has no external coupling beyond
  `GitPlumbing` and `TrieStoreError`.

## Pre-existing gate noise surfaced

- `npm run lint:semgrep` reports 25 unquarantined violations on
  the `release/v17.0.0` baseline. I verified that the hit count
  is **identical** on the baseline and on my branch, and none of
  the hits live in files touched by this cycle. Pre-existing
  noise; not mine to fix here.

## How this unblocks downstream

- **`PROTO_trie-cursor`** — unblocked. The cursor constructs and
  traverses trie pages via the port. A concrete adapter against
  real Git unblocks end-to-end read/write tests.
- **`PROTO_checkpoint-envelope-publication`** — unblocked. Real
  trie root trees can be published; the envelope tree can reference
  a real Git tree OID obtained from `GitTrieStoreAdapter.writeBranch`.
- **`PROTO_trie-codec-and-geometry`** — independent but
  compatible. The codec cycle produces and consumes
  `TrieBranchEntries` at whatever geometry it picks; the adapter's
  nibble-width auto-selection handles 1..8-bit nibbles without
  signature changes.
- **`PERF_lru-page-cache`** — unblocked. The cache sits in front
  of `readBranch` / `readLeaf` and keys on OID. Measuring
  cache-miss latency now has a real adapter to run against.
- **`PROTO_state-session-async`** — partially unblocked. The
  session still depends on `PROTO_trie-cursor` and the codec, but
  the storage layer is no longer a blocker.

## Backlog maintenance

- [x] Backlog item `INFRA_git-trie-store-adapter.md` removed
      (content absorbed into the cycle design doc)
- [x] Seam README trie row updated to reflect adapter shipped
- [x] Downstream backlog items noted as unblocked
- [x] No new backlog items filed (no debt or deferred work)

## Progress report

We promised a boring adapter: four methods, no caching, no
commits, no CAS. We delivered exactly that — and got a tiny drama
out of it.

The two messes:

1. **The recursive-tree trap.** The brief suggested consuming
   `GraphPersistencePort`'s tree methods, but `readTreeOids` only
   runs recursively (`ls-tree -r -z`). That would flatten a
   branch-of-branch-of-leaf hierarchy and hide the structure we
   need. Solution: consume `GitPlumbing` directly, like
   `GitTrustChainAdapter` already does.

2. **Git's four flavours of "this doesn't exist".** Unit tests
   passed with a happy mock. Integration tests against real Git
   revealed that `cat-file blob` says `bad file`, `ls-tree` says
   `not a tree object`, and `cat-file -e` emits an empty stderr
   with exit 1. None of those matched the patterns I copied from
   `GitGraphAdapter`. Added three new hints and a silent-exit
   classifier. Integration tests now pass; unit coverage is 100%.

Next up for this line: `PROTO_trie-cursor` (the cursor that uses
this adapter to traverse), `PROTO_trie-codec-and-geometry` (the
codec that produces and consumes `TrieBranchEntries`), and
`PERF_lru-page-cache` (the cache that makes the whole thing not
slow). The adapter is boring. Downstream gets to be interesting.

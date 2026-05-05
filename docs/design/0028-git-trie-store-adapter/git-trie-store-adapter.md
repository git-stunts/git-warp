---
title: "Git-native TrieStorePort adapter over raw Git blobs and trees"
legend: "INFRA"
cycle: "0028-git-trie-store-adapter"
source_backlog: "docs/method/backlog/v17.0.0/INFRA_git-trie-store-adapter.md"
---

# Git-native TrieStorePort adapter over raw Git blobs and trees

Source backlog item (absorbed into this doc): `docs/method/backlog/v17.0.0/INFRA_git-trie-store-adapter.md`
Legend: INFRA

## Sponsors

- Human: Backlog operator
- Agent: Implementation agent

## Hill

`GitTrieStoreAdapter` implements `TrieStorePort` end-to-end against
native Git plumbing:

- `writeLeaf(data)` -> `git hash-object -w --stdin`
- `readLeaf(oid)` -> `git cat-file blob <oid>`
- `writeBranch(children)` -> `git mktree` with
  `"100644 blob <oid>\t<hex-nibble>"` entries for leaf children,
  `"040000 tree <oid>\t<hex-nibble>"` entries for branch children
- `readBranch(oid)` -> non-recursive `git ls-tree <oid>` parsed back
  into `ReadonlyMap<number, string>`

Unit tests cover round-trips across 2/16/64/256-way fanouts and all
four error codes. Integration tests against a real Git repo confirm
written leaves are `git cat-file blob`-readable and written branches
are `git ls-tree`-readable.

## Playback Questions

### Human

- [ ] Does the adapter consume only existing, swap-friendly inputs?
- [ ] Is the nibble naming convention legible both to humans
      (`git ls-tree` output) and to the codec cycle?

### Agent

- [ ] Can a 256-way branch round-trip through a real Git repo
      without any name collisions, truncation, or silent drops?
- [ ] Does the adapter treat leaf children and branch children
      differently at write time (mode + object type) but identically
      at read time (nibble-indexed child OID map)?
- [ ] Do all four `TrieStoreError` codes surface through the
      adapter's public paths — `E_TRIE_STORE_MISSING` on read of an
      unknown OID, `E_TRIE_STORE_CORRUPT` on a non-hex tree-entry
      name, `E_TRIE_STORE_READ` on other read failures,
      `E_TRIE_STORE_WRITE` on write failures?
- [ ] Does `src/domain/orset/README.md` reflect the adapter as
      shipped?

## Accessibility and Assistive Reading

- Linear truth / reduced-complexity posture: four port methods, one
  error class, one helper for nibble parsing. No hidden behavior.
- Non-visual or alternate-reading expectations: all identifiers are
  read aloud cleanly; no emoji, no punctuation-as-identifier tricks.

## Localization and Directionality

- Locale / wording / formatting assumptions: nibble filenames are
  lowercase hex, zero-padded to the minimum width needed by the
  adapter's read path (which auto-detects width by parsing).
- Logical direction / layout assumptions: nibble order in
  `TrieBranchEntries` matches the `RouteKey.nibbleAt` extraction
  order — MSB-first. The adapter neither assumes nor cares about
  MSB-first at storage time; it is a simple key-value map over
  numbers and strings.

## Agent Inspectability and Explainability

- What must be explicit and deterministic for agents: same children
  -> same Git tree OID. `mktree` sorts entries by name; the adapter
  canonicalises at `writeBranch` time so insertion order does not
  perturb OIDs.
- What must be attributable, evidenced, or governed: every failure
  that crosses the adapter boundary is a `TrieStoreError` with a
  typed code and a structured `context` carrying at least the `oid`
  (or the raw tree-entry name, for corruption cases). No raw
  `Error`; no `err.message` parsing by callers.

## Non-goals

- [ ] No LRU / page cache. That is `PERF_lru-page-cache`.
- [ ] No codec / geometry. That is
      `PROTO_trie-codec-and-geometry`.
- [ ] No cursor / flush lifecycle. That is `PROTO_trie-cursor` and
      `PROTO_trie-flush`.
- [ ] No commit creation, no ref updates, no CAS routing. This is
      pure blob / tree object I/O.
- [ ] No modifications to existing adapters beyond what's strictly
      needed.

## Backlog Context

## Problem

`TrieStorePort` (cycle 0026) captures the minimum contract the
shadow-trie ORSet needs for reading and writing the Git objects that
back its branch nodes and leaf nodes. Without a concrete adapter, no
downstream module (`PROTO_trie-cursor`, `PROTO_trie-codec-and-geometry`,
`PROTO_checkpoint-envelope-publication`) can be wired against real
Git storage. The in-memory test double in the port's contract suite
is sufficient for the port itself but not for the rest of the line.

## Fix

Introduce `GitTrieStoreAdapter` in the infrastructure layer. It
consumes `@git-stunts/plumbing` directly (the same dependency
`GitGraphAdapter` and `GitTrustChainAdapter` already use) and
translates the four port methods into native Git plumbing calls.

### Adapter surface

```typescript
export default class GitTrieStoreAdapter implements TrieStorePort {
  constructor(deps: GitTrieStoreAdapterDeps);
  readLeaf(oid: string): Promise<Uint8Array>;
  readBranch(oid: string): Promise<TrieBranchEntries>;
  writeLeaf(data: Uint8Array): Promise<string>;
  writeBranch(children: TrieBranchEntries): Promise<string>;
}
```

`GitTrieStoreAdapterDeps` carries exactly one thing: a
`GitPlumbing` (the shared plumbing contract from
`gitErrorClassification.ts`). No blob port, no tree port, no commit
port. The adapter does its own plumbing calls because the existing
`TreePort.readTreeOids` uses `ls-tree -r` (recursive), which would
flatten nested branch-of-branch trees and break the nibble-indexed
child map the port needs. Adding a non-recursive sibling method to
`TreePort` would pollute the existing port for one consumer; keeping
it local keeps the blast radius minimal.

### Plumbing commands consumed

| Port method     | Git command                                   |
|-----------------|-----------------------------------------------|
| `writeLeaf`     | `hash-object -w --stdin`                      |
| `readLeaf`      | `cat-file blob <oid>`                         |
| `writeBranch`   | `mktree` (with mode + type + oid + nibble)    |
| `readBranch`    | `ls-tree <oid>` (non-recursive)               |

A secondary `cat-file -e <oid>` probe is used to disambiguate
legitimate zero-byte reads from missing objects, mirroring the
pattern already in `GitGraphAdapter._assertBlobExistsForEmptyRead`.

### Nibble filename convention

A branch node is a Git tree whose entries are named by the nibble
index they sit at. The name is the nibble's hex representation,
zero-padded to the minimum width required to cover the fanout:

| Fanout | Nibble bits | Name width | Example names             |
|--------|-------------|------------|---------------------------|
| 2      | 1           | 1          | `0`, `1`                  |
| 16     | 4           | 1          | `0`, `1`, ..., `f`        |
| 64     | 6           | 2          | `00`, `01`, ..., `3f`     |
| 256    | 8           | 2          | `00`, `01`, ..., `ff`     |

At **write** time, the adapter does not know the geometry. It picks
the minimum hex width that encodes the largest nibble index in the
map: `max(1, ceil(hexDigits(maxNibble)))`. A branch with only `{0}`
writes `"0"`; a branch with `{0, 200}` writes `"00"` and `"c8"`.
This keeps names as short as possible while remaining
geometry-honest.

At **read** time, the adapter parses each entry name as lowercase
hex. Any entry name that is not a valid hex string (empty, contains
non-hex characters, or has leading whitespace) raises
`E_TRIE_STORE_CORRUPT`. The adapter does not validate range against
a geometry — it just decodes the nibble index and hands the map to
the caller. Geometry enforcement is the codec's problem (cycle
0027).

### Mode bits at write time

`mktree` input lines take the form `<mode> <type> <oid>\t<name>`.
The adapter needs to distinguish leaf children (blobs) from branch
children (trees) at write time. But the port's
`TrieBranchEntries = ReadonlyMap<number, string>` does not carry
that distinction — child OIDs are opaque hex strings.

Resolution: the adapter **probes each child OID** via
`cat-file -t <oid>` and emits `100644 blob` for `blob` responses,
`040000 tree` for `tree` responses. Anything else raises
`E_TRIE_STORE_WRITE` with a context payload naming the offending
OID and its observed type. This costs one extra plumbing call per
child but keeps the port contract tiny (no `TrieChildKind` tag on
entries). In practice the trie code paths already hold the OIDs in
hand and the adapter's caller will cache children during an
aggregate flush.

An alternative considered: embed kind into the entries as
`ReadonlyMap<number, { oid: string; kind: 'blob' | 'tree' }>`. This
was rejected because (a) it widens the port's collaborator type for
a single adapter's convenience, (b) it leaks a Git-ism into the
domain seam, and (c) the codec cycle owns `TrieBranchEntries` and
should not be forced to re-tag what the trie structure already
implies. The probe stays in the adapter.

### Failure model

All adapter-boundary errors become `TrieStoreError`:

| Plumbing outcome                                   | Mapped code             |
|----------------------------------------------------|-------------------------|
| `cat-file`/`ls-tree` missing-object (128, `bad object`, `not a valid object name`, `does not point to a valid object`) | `E_TRIE_STORE_MISSING`  |
| Tree entry with a non-hex or empty name            | `E_TRIE_STORE_CORRUPT`  |
| `mktree` / `hash-object` non-zero exit             | `E_TRIE_STORE_WRITE`    |
| Any other read-side plumbing failure               | `E_TRIE_STORE_READ`     |

The adapter never returns a `Buffer` — it converts at the boundary
via `Uint8Array.from` / `new Uint8Array(bufferAsArrayBuffer)` so the
domain only sees `Uint8Array`.

## Scope

**In:**

- Adapter at `src/infrastructure/adapters/GitTrieStoreAdapter.ts`.
- Unit tests at
  `test/unit/infrastructure/adapters/GitTrieStoreAdapter.test.ts`
  with an in-memory `GitPlumbing` double.
- Integration tests at
  `test/integration/infrastructure/adapters/GitTrieStoreAdapter.integration.test.ts`
  against a real Git repo initialised in a temp directory.
- `src/domain/orset/README.md` updated to mark the adapter as
  shipped.

**Out:**

- No new port methods. No modifications to existing adapters.
- No LRU cache, no codec, no geometry object.
- No checkpoint envelope publication.
- No cursor / flush lifecycle.
- No ref-update or commit-creation code.
- No git-cas routing. Per design 0018 git-cas carve-out, core trie
  publication stays on native Git.

## Notes

- Consumer of: `TrieStorePort` (cycle 0026).
- Plumbing dependency is injected, matching the pattern in
  `GitGraphAdapter` and `GitTrustChainAdapter`. This keeps the
  adapter swap-friendly for tests and for future platforms that
  want a non-subprocess plumbing implementation.
- The integration test uses `Plumbing.createDefault({ cwd })` with
  a `mkdtemp` temp directory, mirroring
  `test/integration/api/helpers/setup.ts`.
- Unit tests use an inline `GitPlumbing` test double. The double
  captures `args` and `input` per call and returns canned outputs
  so error-path tests can simulate missing objects, corrupt tree
  entries, and write failures deterministically.
- 100% branch coverage of the adapter is the test floor. The
  coverage ratchet is not touched; `npm run test:coverage` is the
  only entry point allowed to rewrite ratchet thresholds.

## Downstream effects

- `PROTO_trie-cursor` — the cursor constructs and traverses trie
  pages via the port. A concrete adapter unblocks end-to-end
  read/write tests.
- `PROTO_checkpoint-envelope-publication` — real trie root trees
  can now be published; the envelope tree can reference a real Git
  tree OID instead of a fabricated one.
- `PROTO_trie-codec-and-geometry` — the codec cycle runs in
  parallel and does not depend on this adapter, but the adapter's
  tests validate that the codec's geometry choices (any fanout up
  to 256) round-trip through native Git without name collisions.
- `PERF_lru-page-cache` — sits in front of `readBranch`/`readLeaf`.
  Having a real adapter lets us measure cache-miss latency against
  native Git.

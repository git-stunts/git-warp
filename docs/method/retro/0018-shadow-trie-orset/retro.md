# Cycle 0018 Retro — Shadow-Trie ORSet + Workspace Package Reorganization

**Status:** DESIGN COMPLETE — implementation driven by v17 backlog

## Hill

Replace memory-resident ORSet with a bounded-residency storage-backed
ORSet engine using a hashed prefix trie stored as native Git objects.
Reorganize the repository into a workspace with four packages.

## What ground was taken

### Design decisions locked

8 architectural decisions finalized and documented:

1. Core trie state uses native Git objects (branches = trees,
   leaves = blobs, native `git gc` reachability)
2. Route keys are binary blake3(elementId) with nibble extraction
3. First cut replaces nodeAlive and edgeAlive only
4. StateSession is the async domain-facing contract
5. Checkpoint truth is ref -> commit -> envelope tree with real
   Git tree entries
6. Patch envelopes use native Git tree reachability
7. npm workspaces (not pnpm)
8. Package extraction order: warp-orset early, kernel and adapters
   later after seams are proven

### Seam architecture resolved

Three-layer seam model locked after review:

- **ORSetLike** — synchronous in-memory seam. The existing ORSet
  class implements it. Domain code uses it for in-memory state.
- **StateSession** — async domain-facing contract for trie-backed
  state. The only thing domain code talks to when operating on
  out-of-core state.
- **ShadowTrieORSet** — internal async engine behind the session.
  Not exposed to domain code. Does not implement ORSetLike.

### Backlog decomposed

24 items across 7 layers (ST-0 through ST-6) in
`docs/method/backlog/v17.0.0/`:

- ST-0: planning + workspace shells (4 items)
- ST-1: ORSet seam + storage contracts (4 items)
- ST-2: trie foundation (5 items)
- ST-3: ShadowTrieORSet implementation (3 items)
- ST-4: async session firewall (3 items)
- ST-5: kernel integration (3 items)
- ST-6: broader package extraction (2 items)

DAG verified acyclic, all dependency refs resolve. Lane README
updated with ST layer checklist.

### Review corrections incorporated

7 fixes from editorial review before any code was written:

1. TrieStorePort scoped to read/write only — no checkpoint
   publication
2. Checkpoint envelope uses real Git tree entries, not OIDs in CBOR
3. ORSetLike vs StateSession contradiction resolved
4. Async scan made explicit in index builder item
5. Ports stay with kernel, not adapters
6. Geometry parameterized via TrieGeometry config from day one
7. git-cas carve-out: core trie publication explicitly out of scope
   for INFRA_unify-persistence-on-git-cas

### Design doc fleshed out

`docs/design/0018-shadow-trie-orset/shadow-trie-orset.md` expanded
from stub to full design with architecture diagrams, trie structure,
package map, seam model, checkpoint envelope format, and explicit
non-goals.

## What was not delivered

No implementation. Zero source changes. This was a design-only cycle
by explicit instruction: "your first action is NOT coding."

## What was learned

- The biggest risk in the original draft was the sync/async
  contradiction: an ORSetLike contract that promised synchronous
  access while the trie engine underneath is fundamentally async.
  Catching this before coding saved a rewrite.
- Checkpoint reachability is load-bearing. "Root OID in CBOR" looks
  harmless but breaks `git gc` reachability. The envelope must use
  real Git tree entries or trie pages become orphans.
- The TrieStorePort was trying to be both a low-level storage
  primitive and a high-level checkpoint publisher. Scoping it down
  to boring read/write made it reusable and testable.
- Editorial review before coding is high-leverage. 7 corrections
  on paper cost one commit. 7 corrections after implementation
  would have cost a week.

## What comes next

Pull ST-0 items into implementation. First code: workspace scaffold
and warp-orset package extraction. Then PROTO_orsetlike-contract as
the seam that everything downstream depends on.

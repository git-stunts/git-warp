---
title: "Git-native TrieStorePort for branch trees and leaf blobs"
legend: "PROTO"
cycle: "0026-trie-store-port"
source_backlog: "docs/method/backlog/v17.0.0/PROTO_git-trie-store-port.md"
---

# Git-native TrieStorePort for branch trees and leaf blobs

Source backlog item: `docs/method/backlog/v17.0.0/PROTO_git-trie-store-port.md`
Legend: PROTO

## Sponsors

- Human: Backlog operator
- Agent: Implementation agent

## Hill

`TrieStorePort` is defined as an `interface` in
`src/domain/orset/trie/TrieStorePort.ts` with four boring methods —
`readLeaf`, `readBranch`, `writeLeaf`, `writeBranch` — backed by a
geometry-parameterized `TrieBranchEntries` map that does NOT hardcode
16-way fanout. Contract tests verify a minimal in-memory test double
round-trips a branch through the port. No adapter. No caching. No
publication.

## Playback Questions

### Human

- [ ] Does the port shape survive when the geometry benchmark lands
      on a fanout other than 16?
- [ ] Is the in-memory double small enough to be obviously correct?

### Agent

- [ ] Can a 256-way branch (nibbleBits = 8) be written and read back
      through the port without changing the signatures?
- [ ] Is `TrieBranchEntries` runtime-honest — does it refuse a child
      OID that isn't a string at the in-memory double boundary?
- [ ] Do the port methods keep their failure modes typed as concrete
      domain error classes, not raw `Error`?
- [ ] Does `src/domain/orset/README.md` reflect the new `trie/` subdir
      with a status marker for this cycle?

## Accessibility and Assistive Reading

- Linear truth / reduced-complexity posture: port is four methods and
  one collaborator type; there is nothing hidden.
- Non-visual or alternate-reading expectations: all identifiers are
  read aloud cleanly; no emoji, no punctuation-as-identifier tricks.

## Localization and Directionality

- Locale / wording / formatting assumptions: none; OIDs are hex
  strings, bytes are `Uint8Array`.
- Logical direction / layout assumptions: nibble index order in
  `TrieBranchEntries` matches the `RouteKey.nibbleAt` extraction
  order — MSB-first.

## Agent Inspectability and Explainability

- What must be explicit and deterministic for agents: the port
  accepts and returns `Uint8Array` and `string`; no hidden effects.
- What must be attributable, evidenced, or governed: failures return
  typed `TrieStoreError` subclasses so callers can `instanceof`-dispatch
  without message parsing.

## Non-goals

- [ ] No adapter implementation. That is
      `INFRA_git-trie-store-adapter`.
- [ ] No LRU / page cache. That is `PERF_lru-page-cache`.
- [ ] No geometry configuration object. That is
      `PROTO_trie-codec-and-geometry`.
- [ ] No checkpoint envelope publication. That is
      `PROTO_checkpoint-envelope-publication`.
- [ ] No session / cursor lifecycle. That is
      `PROTO_state-session-async` and `PROTO_trie-cursor`.

## Backlog Context

## Problem

The Shadow-Trie ORSet stores its state as native Git objects: branch
nodes are Git trees, leaf nodes are Git blobs. There is no existing
port that captures this specific storage contract. `BlobPort` and
`TreePort` almost fit, but they target general-purpose Git object
operations and carry concerns (mode bits, arbitrary path entries,
batch operations) that the trie storage layer does not need and
should not see. The trie needs a tiny, purpose-built contract.

## Fix

Introduce `TrieStorePort` in the domain's ORSet seam
(`src/domain/orset/trie/`). Four methods, one collaborator type
(`TrieBranchEntries`), one error class (`TrieStoreError`). No
fanout assumptions. No adapter wiring.

### Port surface

```typescript
export default interface TrieStorePort {
  readLeaf(oid: string): Promise<Uint8Array>;
  readBranch(oid: string): Promise<TrieBranchEntries>;
  writeLeaf(data: Uint8Array): Promise<string>;
  writeBranch(children: TrieBranchEntries): Promise<string>;
}
```

### Collaborator type

`TrieBranchEntries` is `ReadonlyMap<number, string>`:

- key: the branch's local nibble index (0-based, non-negative
  integer). v1 starts 16-way (0..15) per the 4-bit nibble geometry,
  but the port signature supports 1/2/4/8-bit widths and any future
  fanout up to `RouteKey`'s 256.
- value: the child OID as a hex string.

The type is geometry-agnostic. Adapters validate range and encode
the map into whatever Git tree entry naming convention the geometry
cycle picks. The port itself does not care.

### Failure model

`TrieStoreError extends WarpError` with four codes:

- `E_TRIE_STORE_READ` — read call failed against backing store.
- `E_TRIE_STORE_WRITE` — write call failed against backing store.
- `E_TRIE_STORE_MISSING` — requested OID does not exist.
- `E_TRIE_STORE_CORRUPT` — OID resolved but bytes failed branch /
  leaf decoding.

Raw `Error` is banned per anti-sludge policy. The port documents
these codes; adapters throw typed instances; domain consumers
`instanceof`-dispatch.

## Scope

**In:**

- Port definition at `src/domain/orset/trie/TrieStorePort.ts`.
- `TrieBranchEntries` type at
  `src/domain/orset/trie/TrieBranchEntries.ts`.
- `TrieStoreError` class at
  `src/domain/errors/TrieStoreError.ts`.
- Unit test suite at
  `test/unit/domain/orset/trie/TrieStorePort.test.ts` with an
  in-memory test double inline in the test file.
- `src/domain/orset/README.md` updated to mark `trie/` status.

**Out:**

- No adapter. No caching. No geometry config. No publication. No
  session plumbing. No LWW. No ORSet coupling.

## Notes

- The port lives under `src/domain/orset/trie/` rather than
  `src/ports/` because it is warp-orset-destined code per the seam
  README. When extraction happens, it moves with the trie code into
  `packages/warp-orset/`. Other existing ports stay in `src/ports/`
  because they cross layer boundaries inside the root product.
- The port is an `interface`, not an `abstract class`. SSTS allows
  and recommends `interface` for ports; the rejection list forbids
  an abstract parent for a port in this line specifically because
  cycle 0023 (`ORSetLike`) taught us what happens when we reach for
  an abstract parent without a plurality of concrete subclasses.
  A port is exactly the case where a plurality is expected (real
  adapter + test double), so `interface` is correct.
- Nibble index keys are `number` rather than `string` to keep the
  port's type honest: the nibble at a given depth is a numeric
  value in `[0, 2^nibbleBits)`. Adapters can stringify it to the
  `"0".."f"` hex form (or longer for wider nibbles) at the adapter
  boundary.

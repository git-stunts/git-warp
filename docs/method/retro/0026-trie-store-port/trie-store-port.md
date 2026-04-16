---
title: "Git-native TrieStorePort for branch trees and leaf blobs"
cycle: "0026-trie-store-port"
design_doc: "docs/design/0026-trie-store-port/trie-store-port.md"
outcome: hill-met
drift_check: yes
---

# Cycle 0026 Retro — TrieStorePort

**Status:** HILL MET

## Hill

Define `TrieStorePort` as an `interface` in the ORSet seam with a
geometry-parameterized `TrieBranchEntries` collaborator and a
`TrieStoreError` failure model. Port only. No adapter, no caching,
no geometry config, no publication. Contract tests via an in-memory
double.

## What ground was taken

### Code (three new files)

- `src/domain/orset/trie/TrieStorePort.ts` — the port interface,
  type-only at runtime. Four methods, nothing more.
- `src/domain/orset/trie/TrieBranchEntries.ts` — type alias
  `ReadonlyMap<number, string>`. Geometry-agnostic. Docstring
  nails why the port must not hardcode 16.
- `src/domain/errors/TrieStoreError.ts` — `WarpError` subclass with
  four codes documented in the class doc:
  `E_TRIE_STORE_READ` (default), `E_TRIE_STORE_WRITE`,
  `E_TRIE_STORE_MISSING`, `E_TRIE_STORE_CORRUPT`.

### Tests (one new file, 14 tests)

- `test/unit/domain/orset/trie/TrieStorePort.test.ts` — contract
  suite covering:
  - port is declared as `export default interface` and not a class,
  - concrete implementation accepted by the type system,
  - leaf round-trip with defensive copy + `E_TRIE_STORE_MISSING`,
  - branch round-trip across three geometries (2-way, 16-way,
    256-way) + defensive copy + order-independent OID +
    `E_TRIE_STORE_MISSING`,
  - `TrieStoreError` default code, all four codes accepted,
    structured context preserved.

The in-memory test double lives inline in the test file, not in
`test/helpers/`. It is a test-only artifact that exists solely to
prove the interface compiles under a real implementor and to
exercise round-trip semantics.

### Seam README updated

`src/domain/orset/README.md` now marks the `trie/` subdir as
partially populated — `TrieStorePort.ts` and `TrieBranchEntries.ts`
delivered by cycle 0026, remaining trie modules pending.

## Port signature

```typescript
export default interface TrieStorePort {
  readLeaf(oid: string): Promise<Uint8Array>;
  readBranch(oid: string): Promise<TrieBranchEntries>;
  writeLeaf(data: Uint8Array): Promise<string>;
  writeBranch(children: TrieBranchEntries): Promise<string>;
}
```

`TrieBranchEntries` is `ReadonlyMap<number, string>`. The number is
a nibble index `[0, 2^nibbleBits)`. The string is a child OID.

## Error types introduced

`TrieStoreError extends WarpError`, default code
`E_TRIE_STORE_READ`. Four documented codes:

| Code                   | Meaning                                            |
|------------------------|----------------------------------------------------|
| `E_TRIE_STORE_READ`    | Read failed against the backing store.             |
| `E_TRIE_STORE_WRITE`   | Write failed against the backing store.            |
| `E_TRIE_STORE_MISSING` | OID does not exist.                                |
| `E_TRIE_STORE_CORRUPT` | OID resolved but bytes failed trie decoding.       |

`RouteKeyError` is not re-exported from `src/domain/errors/index.ts`,
so `TrieStoreError` follows the same convention. Consumers import
it directly.

## Playback

### Agent

1. *Does the port shape survive when the geometry benchmark lands on
   a fanout other than 16?*
   Yes — `TrieBranchEntries` is keyed by numeric nibble index,
   supports 1..256 fanout without a signature change. The
   "round-trips a wide 256-way branch" and "round-trips a 2-way
   branch (1-bit nibble geometry)" tests prove this directly.

2. *Can a 256-way branch (nibbleBits = 8) be written and read back
   through the port without changing the signatures?*
   Yes — verified by the 256-way round-trip test.

3. *Is `TrieBranchEntries` runtime-honest?*
   Yes — the in-memory double can reject non-string OIDs at the
   adapter boundary, and the port's `readBranch` returns a defensive
   copy so stored state is never aliased. The test asserts both.

4. *Do the port methods keep their failure modes typed as concrete
   domain error classes, not raw `Error`?*
   Yes — all failures raise `TrieStoreError` with a typed `code`.
   Raw `Error` is banned per anti-sludge policy.

5. *Does `src/domain/orset/README.md` reflect the new `trie/`
   subdir with a status marker for this cycle?*
   Yes — the table row for `trie/` now lists
   `TrieStorePort.ts, TrieBranchEntries.ts (cycle 0026)` and status
   `port: cycle 0026; rest pending`.

6. *Is the port an `interface` and not an `abstract class`?*
   Yes — the shape test reads the source and asserts the file
   contains `export default interface TrieStorePort` and does not
   contain `export default (abstract )?class TrieStorePort`.

### Human

Deferred to review.

## Design decisions locked

- **Port is an `interface`, not an `abstract class`.** SSTS allows
  and recommends `interface` for ports. Cycle 0023 (`ORSetLike`)
  rejected an abstract parent with one impl, but a port is exactly
  the case where a plurality of implementors is expected (adapter
  + test double). Existing ports in `src/ports/` use `abstract class`
  for historical reasons; this port uses `interface` because the
  cycle brief and SSTS both point there, and the rejection list
  explicitly forbids an abstract parent for this port.
- **`TrieBranchEntries = ReadonlyMap<number, string>`.** Numeric
  nibble index keeps the type honest; the nibble at a given depth
  is a numeric value in `[0, 2^nibbleBits)`. Adapters stringify at
  the Git tree-entry boundary (`"0".."f"` for 4-bit, `"00".."ff"`
  for 8-bit).
- **Child OID is a plain `string`, not an `Oid` class.** The cycle
  brief called this out — no object-model refactor in a port
  cycle. An `Oid` wrapper may appear later; the port widens without
  churn.
- **Port lives at `src/domain/orset/trie/`, not `src/ports/`.**
  The seam README treats `src/domain/orset/` as warp-orset-destined
  code. When extraction happens, the port moves with the trie code
  into `packages/warp-orset/` without the `src/ports/` detour.
  Other existing ports stay in `src/ports/` because they cross
  layer boundaries inside the root product.
- **Four codes on `TrieStoreError`, not a single catch-all.**
  `MISSING` and `CORRUPT` are semantically different from `READ`
  and `WRITE` — callers may want to retry a `READ` but not a
  `CORRUPT`.
- **`TrieStoreError` default code is `E_TRIE_STORE_READ`.**
  The most common caller path is a read, and a bare
  `new TrieStoreError(message)` should yield a useful code without
  forcing every call-site to pass one.
- **In-memory double is inline in the test file.** Not in
  `test/helpers/`. It's not a reusable fixture; it's specific to
  this contract suite and does not need to travel.

## Test strategy and coverage

The test file exercises three axes:

1. **Shape** — the port is declared as `interface` (proved by
   reading the source file at runtime), and a concrete implementation
   compiles and runs.
2. **Round-trip across geometries** — leaf bytes, 2-way branch,
   16-way branch, 256-way branch. Defensive copies on read. OID
   stability under insertion-order permutation.
3. **Failure modeling** — `E_TRIE_STORE_MISSING` on unknown OIDs,
   `TrieStoreError` default code, all four codes accepted,
   structured context preserved.

Touched source files have straightforward coverage:
- `TrieStorePort.ts` — type-only at runtime, no code to cover.
- `TrieBranchEntries.ts` — type alias, no code to cover.
- `TrieStoreError.ts` — constructor exercised by multiple tests
  across the suite.

## How this unblocks downstream

- **`INFRA_git-trie-store-adapter`** — unblocked. The adapter
  implements `TrieStorePort` and encodes `TrieBranchEntries` into
  Git tree entries at whatever name convention the geometry cycle
  settles on (hex `"0".."f"` for v1 4-bit).
- **`PROTO_trie-codec-and-geometry`** — unblocked. The codec
  produces and consumes `TrieBranchEntries` and leaf
  `Uint8Array`s at the types the port already speaks.
- **`PROTO_trie-cursor`** — unblocked. The cursor depends on the
  port for page reads and writes, and on `RouteKey` (cycle 0022)
  for path navigation.
- **`PERF_lru-page-cache`** — unblocked. The cache sits in front
  of `TrieStorePort.readBranch`/`readLeaf` and keys on OID.
- **`PROTO_state-session-async`** — partially unblocked. Session
  needs the port plus the cursor and codec, so it also depends on
  `PROTO_trie-cursor` and `PROTO_trie-codec-and-geometry`.

## Drift

- None. The implementation stayed inside the backlog item's scope.
  Three small files, one test file, one README table edit. No
  sneaky refactors, no sludge cleanup on adjacent code, no
  geometry dabbling.

## New debt

- None introduced. The port has no external coupling beyond
  `WarpError`.

## Pre-existing gate noise surfaced

`npm run lint:semgrep` flags two pre-existing false positives on
`release/v17.0.0` baseline:

- `src/domain/services/HookInstaller.ts:163` — the word "unknown"
  appears in a doc comment (`@throws {WarpError} If the strategy is
  unknown`), not in a type annotation.
- `src/domain/trust/reasonCodes.ts:38` — the word "unknown"
  appears in a doc comment (`Policy value is unknown or unsupported`).

Neither file is touched by cycle 0026. Both hits would be resolved
by tightening the semgrep pattern to exclude comments, which is out
of scope for this cycle. Filed as gate noise; no code change here.

## Backlog maintenance

- [x] Seam README reflects the new `trie/` subdir entries
- [x] `PROTO_git-trie-store-port` content absorbed into design and
      retro; backlog item remains in `v17.0.0/` lane for audit trail
- [x] No dead backlog refs
- [x] Downstream backlog items (`INFRA_git-trie-store-adapter`,
      `PROTO_trie-codec-and-geometry`, `PROTO_trie-cursor`,
      `PERF_lru-page-cache`, `PROTO_state-session-async`) noted as
      unblocked

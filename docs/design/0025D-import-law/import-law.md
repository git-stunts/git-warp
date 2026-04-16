---
title: "Import law: purge node:* and infrastructure imports from src/domain/** and src/ports/**"
legend: "PURGE"
cycle: "0025D-import-law"
parent_cycle: "0025-anti-sludge-purge"
---

# Cycle 0025D — Import law

## Sponsors

- Human: Backlog operator
- Agent: Implementation agent

## Hill

Zero `node:stream`, `node:crypto`, `crypto`, or other `node:*` / Node
bare-platform imports in **any** `src/domain/**` or `src/ports/**`
file. `policy/quarantines/0025D-import-law.json` has `files: []`.
The ESLint `no-restricted-imports` guardrail and the contamination
map agree: the hexagonal wall holds.

## Scope (three files)

From `policy/quarantines/0025D-import-law.json`:

- `src/ports/CommitPort.ts` — `import type { Readable } from 'node:stream'`
- `src/ports/GraphPersistencePort.ts` — `import type { Readable } from 'node:stream'`
- `src/domain/utils/defaultCrypto.ts` — `import type { Hash, Hmac } from 'node:crypto'` plus `await import('node:crypto')`

## Diagnosis

### Ports leak `node:stream` as a type surface

Both `CommitPort` and `GraphPersistencePort` declare
`logNodesStream(...): Promise<Readable>`. `Readable` here is
strictly a type-level import from `node:stream`. Consumers of the
stream (e.g. `GitLogParser`) only ever treat it as
`AsyncIterable<Uint8Array | string>` — the concrete Readable API
is never used through the port. The port therefore lies: it
advertises a Node-specific type for what is, in practice, a
platform-agnostic async iterable.

The adapter (`GitGraphAdapter.logNodesStream`) even casts the
plumbing's already-iterable stream up to `Readable` via
`as unknown as Readable` — a double-cast specifically to satisfy
the port's misdeclared type. This is the sludge pattern the
0025A cast purge is separately designed to kill, and the upstream
cause lives in the port contract.

The domain already has a portable stream abstraction: `WarpStream<T>`
at `src/domain/stream/WarpStream.ts`. Other ports
(`PatchJournalPort`, `IndexStorePort`) already return
`WarpStream<T>`. The log-stream port should follow the same
convention.

### `defaultCrypto.ts` is a misfiled adapter

`src/domain/utils/defaultCrypto.ts` does exactly what an adapter
does: it binds the `CryptoPort` interface to Node's `node:crypto`
module (with a browser-safe fallback that throws). It is named as
a "default", stored under `domain/utils/`, but its identity is
adapter-identity: it encapsulates platform I/O.

The repository already has:

- `src/ports/CryptoPort.ts` — the abstract contract (hash, hmac,
  timingSafeEqual).
- `src/infrastructure/adapters/NodeCryptoAdapter.ts` — a Node
  implementation.
- `src/infrastructure/adapters/WebCryptoAdapter.ts` — a Web Crypto
  implementation.

`defaultCrypto` is therefore a **third, redundant** Node adapter
sitting in the wrong layer. Consumers (`WarpRuntime`,
`SyncAuthService`, `TrustCanonical`, `StateSerializer`,
`seekCacheKey`) import the singleton as a fallback when the caller
did not inject a `CryptoPort`. The fallback is legitimate; the
location and the direct `node:crypto` import are not.

## Decisions

### Ports: Option A — reuse `WarpStream`

Replace `Readable` with `WarpStream<Uint8Array | string>` on both
`CommitPort.logNodesStream` and
`GraphPersistencePort.logNodesStream`. Justification:

- `WarpStream<T>` is the repo's existing domain stream abstraction.
  Other ports already speak it.
- The only thing consumers do with the return value is iterate it.
  `WarpStream` implements `[Symbol.asyncIterator]` and is directly
  usable in `for await`.
- The chunk element type `Uint8Array | string` preserves the
  existing behavior: `GitGraphAdapter` yields bytes from the git
  subprocess; `InMemoryGraphAdapter` yields a single pre-formatted
  string. Downstream (`GitLogParser.parse`) already accepts that
  union.
- Adapters convert their native producer (Node `Readable`, array)
  into `WarpStream.from(...)` at the boundary. `Readable` stays
  confined to `src/infrastructure/adapters/**`.

Rejected alternative: defining a new minimal `DomainReadable<T>`
interface/class. Rejected because `WarpStream<T>` already satisfies
the need and introducing a second stream type splits the seam.

### defaultCrypto: Option B — relocate to `infrastructure/adapters/`

Move `src/domain/utils/defaultCrypto.ts` wholesale to
`src/infrastructure/adapters/defaultCrypto.ts`. Keep the singleton
export and the lazy-`node:crypto` fallback as-is. Justification:

- Option A (introduce a CryptoPort) is already done — `CryptoPort`,
  `NodeCryptoAdapter`, and `WebCryptoAdapter` already exist. The
  defaultCrypto module IS a `CryptoPort` adapter, just misfiled.
- The consumers already all accept a `CryptoPort` via
  constructor/options. They fall back to `defaultCrypto` when none
  is injected. That fallback pattern is fine; the relocation only
  moves the file, not the contract.
- A full dependency-injection rewrite of the 5 consumer files is
  out of proportion to the violation. The violation is
  "wrong-layer import"; the fix is "right-layer import."
- Moving the file preserves the exact runtime behavior including
  the bundler-stub safety path (`await import('node:crypto')`
  inside `try` — which Vite / browser bundlers stub without
  crashing the module load).

Rejected alternative: deleting `defaultCrypto` and forcing every
consumer to receive a `CryptoPort` through dependency injection.
Rejected because:

- `WarpRuntime` currently wires two fallback paths (constructor +
  factory) that resolve `defaultCrypto` if the caller passes
  nothing. That ergonomic fallback has value for the public API.
- The port/adapter wall is the actual policy concern. Relocating
  the file satisfies the policy without a blast-radius rewrite.

The six consumer import paths change from
`'../utils/defaultCrypto.ts'` to
`'../../infrastructure/adapters/defaultCrypto.ts'` (relative-path
arithmetic per file). This is a mechanical path update, not a
semantic change.

## Blast radius

### Ports → adapters

- `src/ports/CommitPort.ts` — rewrite return type.
- `src/ports/GraphPersistencePort.ts` — rewrite return type.
- `src/infrastructure/adapters/GitGraphAdapter.ts` — replace the
  `as unknown as Readable` cast with `WarpStream.from(...)` over
  the plumbing's already-async-iterable stream. Removes node:stream
  import + drops a 0025A double-cast.
- `src/infrastructure/adapters/InMemoryGraphAdapter.ts` — replace
  `Readable.from([formatted])` with `WarpStream.of(formatted)`.
  Removes the dynamic `import('node:stream')`.
- `test/unit/ports/CommitPort.test.ts` — drop the `Readable` test
  prop stub; swap for a trivial `WarpStream` stub.
- `test/unit/ports/GraphPersistencePort.test.ts` — same.
- `test/unit/infrastructure/adapters/InMemoryGraphAdapter.test.ts` —
  existing `for await` consumption works unchanged (WarpStream is
  itself an async iterable). No behavior change.
- `test/helpers/mockPorts.ts` — `logNodesStream` already mocks an
  async iterable; wrap in `WarpStream.from(...)` so the mock matches
  the port type.
- `test/helpers/warpGraphTestUtils.ts` — same if a default mock is
  needed.

### defaultCrypto relocation

- Move `src/domain/utils/defaultCrypto.ts` →
  `src/infrastructure/adapters/defaultCrypto.ts`.
- Update 5 source consumer import paths:
  `src/domain/WarpRuntime.ts`,
  `src/domain/services/sync/SyncAuthService.ts`,
  `src/domain/trust/TrustCanonical.ts`,
  `src/domain/services/state/StateSerializer.ts`,
  `src/domain/utils/seekCacheKey.ts`.
- Update 4 test consumer import paths:
  `test/unit/domain/utils/defaultCrypto.test.ts`,
  `test/unit/domain/utils/defaultCrypto.unavailable.test.ts`,
  `test/unit/domain/services/SyncAuthService.test.ts`,
  `test/unit/domain/services/HttpSyncServer.auth.test.ts`.

No behavioral change. Import-path-only edit.

## Non-goals

- Do NOT refactor consumers to receive `CryptoPort` via DI. That is
  a separate ergonomics decision; 0025D only moves the wall.
- Do NOT unify `defaultCrypto` with `NodeCryptoAdapter`. They have
  different failure semantics (adapter throws on missing Node env;
  defaultCrypto's singleton throws only when a method is called).
  Consolidation is a later cool-ideas item.
- Do NOT touch `src/domain/utils/defaultTrustCrypto.ts` or
  `src/domain/utils/roaring.ts`. Both import `node:*` via
  `await import(...)` / `typeof import(...)` forms that the P6.5
  contamination scanner does not currently detect. They are real
  import-law violations and will be filed as a follow-up backlog
  item — but 0025D's hill is the three files in the manifest.
- Do NOT touch the ESLint `no-restricted-imports` rule. It already
  lists every `node:*` path; the manifest will empty out on its
  own when the three files stop importing those modules.

## Plan

One commit per concern:

1. Open cycle design doc (this commit).
2. `refactor(ports/commit,persistence): replace node:stream Readable
   with WarpStream`. Rewrite both ports, fix `GitGraphAdapter` /
   `InMemoryGraphAdapter`, update tests + mocks.
3. `refactor(crypto): relocate defaultCrypto from domain/utils to
   infrastructure/adapters`. Move the file + update all 9 import
   paths (5 src + 4 test).
4. Regenerate contamination manifest.
5. Close cycle retro.

## Success criteria

- `policy/quarantines/0025D-import-law.json.files` === `[]`.
- `npm run typecheck` — green.
- `npm run test:local` — green (6321/6321 or current baseline).
- `npm run lint` — 0 errors (no new `no-restricted-imports`
  violations).
- `npm run lint:sludge` — green.
- `npm run lint:quarantine-graduate` — green (touched files
  graduated, not narrowed).
- `npm run lint:contamination && git diff --exit-code
  policy/quarantines/` — clean.

## Playback questions

### Human

- [ ] Does `src/domain/` + `src/ports/` contain zero `node:*`
      imports after the cycle? (expected: three-file manifest is
      empty; scanner-regex blindspot for `await import(...)` in
      `defaultTrustCrypto.ts` and `roaring.ts` surfaced as
      follow-up, NOT silently hidden.)
- [ ] Did any consumer behavior change, or is every edit
      import-path-only? (expected: import-path-only for the crypto
      move; ports return `WarpStream<T>` whose `for await` usage is
      identical to a `Readable`.)
- [ ] Is the existing 0025A `as unknown as Readable` cast in
      `GitGraphAdapter` eliminated? (expected: yes, as a co-benefit.)

### Agent

- [ ] After the ports rewrite, neither port file imports anything
      from `node:*`.
- [ ] After the crypto relocation, no file under `src/domain/` or
      `src/ports/` imports `node:crypto` or `crypto`.
- [ ] Contamination regenerate produces
      `0025D-import-law.json.files === []`.
- [ ] New follow-up backlog item filed for the scanner blindspot
      and the two latent `node:*` importers.

## Related

- Parent cycle: `docs/design/0025-anti-sludge-purge/anti-sludge-purge.md`
- Parent backlog: `docs/method/backlog/v17.0.0/PROTO_purge-import-law.md`
- Anti-sludge policy: `docs/ANTI_SLUDGE_POLICY.md`
- SSTS: `docs/SYSTEMS_STYLE_TYPESCRIPT.md`
- Existing port convention: `src/ports/PatchJournalPort.ts`,
  `src/ports/IndexStorePort.ts` (both already return
  `WarpStream<T>`).
- Adapter precedent: `src/infrastructure/adapters/NodeCryptoAdapter.ts`,
  `src/infrastructure/adapters/WebCryptoAdapter.ts`.

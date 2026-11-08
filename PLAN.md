# v21.0.0 Delivery Plan: PR #1040 Extractions & v21 Roadmap Checklist

## 1. Overview & Architecture Posture

- **Goalpost:** Observer-bound Optic API over the cone-bounded runtime ([#1048](https://github.com/git-stunts/git-warp/issues/1048), closing [#1039](https://github.com/git-stunts/git-warp/issues/1039)).
- **Substrate Version:** `21` (major version boundary, breaking cutover).
- **Strategy:** Atomic, independently verifiable PR extractions from monolithic prototype PR [#1040](https://github.com/git-stunts/git-warp/pull/1040) (+13,885 / -23,205 lines across 508 files), landing under strict TDD and anti-sludge rules before executing the direct breaking cutover ([#1054](https://github.com/git-stunts/git-warp/issues/1054)) to eliminate legacy whole-state contracts.

---

## 2. PR #1040 Extraction Slices

### Landed & Active Slices

- [x] **Slice 1: Private Cone Engine Foundation** ([#1062](https://github.com/git-stunts/git-warp/issues/1062) / PR [#1064](https://github.com/git-stunts/git-warp/pull/1064)) — *Merged to `main`*
  - [x] Per-entity cone record folding (nodes, edges, adjacency, admissions) from patch chains.
  - [x] Clone-local Git trie storage (`refs/warp/<lane>/cone/head`) via object session and fast-import batching.
  - [x] Bounded reading and writing costing $O(\text{touched records})$, never $O(\text{graph})$ or $O(\text{history})$.

- [x] **Slice 2: Cone Writes with Injected Access** ([#1051](https://github.com/git-stunts/git-warp/issues/1051) / PR [#1071](https://github.com/git-stunts/git-warp/pull/1071)) — *Merged to `main`*
  - [x] `Warp.open(injectedAccess).execute(intent)` producing typed `WarpWriteReceipt`.
  - [x] Admitting edge removes and verifying dot liveness against cone support.
  - [x] Safe writer bounds and explicit write failure causes.

- [ ] **Slice 3: Observer-Bound Optic Reads** ([#1052](https://github.com/git-stunts/git-warp/issues/1052) / PR [#1082](https://github.com/git-stunts/git-warp/pull/1082)) — *Code Complete, Ratchet Raised, Awaiting Merge*
  - [x] Injected access boundary: `Warp.open(injectedAccess).optic(grant)` acquiring `WarpReadGrant`.
  - [x] Observer-bound optic queries (`entityExists`, `nodeProps`, `edgeProps`, `edgesAround`, `records`).
  - [x] `ConeReadExecutor` establishing independent cone support slices without prior whole-state materialization.
  - [x] Strict domain error subclasses (`ObserverIdentityError`, `PurposeError`, `ReadBudgetError`, `WarpReadGrantError`, `WarpReadRequestError`, `OpticError`).
  - [x] Full-suite line coverage ratchet raised from 93.48% to 93.59%.
  - [ ] Push branch `feat/1052-optic-reads` and merge PR #1082 into `main`.

---

### Pending Extractions from #1040

- [ ] **Slice 4: Receipt-Derived Observation Coordinates & Replay** ([#1053](https://github.com/git-stunts/git-warp/issues/1053), [#1044](https://github.com/git-stunts/git-warp/issues/1044))
  - [ ] Extract `Coordinate` domain concept: opaque, receipt-derived token binding basis, observer, question, purpose, and budget.
  - [ ] Canonical serialization and parsing for Coordinates without private factories or raw frontier dumps.
  - [ ] `Optic(view).replay(coord)`: return original terminal receipt or typed refusal without re-executing intents.
  - [ ] `Optic(view).at(coord)`: re-ask query at historical observation coordinate.
  - [ ] Durable observation retention surviving `git gc` (`ObservationCustodyService`, `ObservationCustodyAdapters`).

- [ ] **Slice 5: Strands, Strand Overlays, and Settlement on Cone Bases** ([#1055](https://github.com/git-stunts/git-warp/issues/1055), [#968](https://github.com/git-stunts/git-warp/issues/968), [#970](https://github.com/git-stunts/git-warp/issues/970))
  - [ ] Pin `Warp.fork()` / `Runtime.fork()` to cone bases rather than full-state checkpoints.
  - [ ] Strand lanes reading and writing structurally shared patch overlays.
  - [ ] Settlement policy (`footprint-records/v1`) binding frontiers across independent writers.
  - [ ] Strand preview survival across cone basis refresh.

- [ ] **Slice 6: Plurality & Conflict Sibling Sets** (Slice 6 on [#1040](https://github.com/git-stunts/git-warp/pull/1040))
  - [ ] Register and lifecycle cone records retain bounded sets of concurrent siblings.
  - [ ] Optic readings report `plurality: SiblingSet`.
  - [ ] Blind writes that overwrite unobserved concurrent values report `plural`.
  - [ ] Lazy sibling decoding: keep plurality off the fast read path until requested.

- [ ] **Slice 7: Direct Breaking Cutover & Legacy Surface Elimination** ([#1054](https://github.com/git-stunts/git-warp/issues/1054))
  - [ ] Delete `src/application/Runtime.ts` and legacy whole-graph `Lane.ts`.
  - [ ] Delete obsolete whole-state helpers: `prepareOpticBasis`, `BoundedNodeRemovalBasis`, `ContentReadProjection`.
  - [ ] Delete `PatchJournalEntityAdmissionInventory`.
  - [ ] Remove full-state replay basis contracts and legacy checkpoint-tail coordinates (~23,000 lines removed).
  - [ ] Update public package export manifests and type declarations.

- [ ] **Slice 8: CLI Doctor & Repair Rewrite for Cone Model** ([#1057](https://github.com/git-stunts/git-warp/issues/1057))
  - [ ] `git warp repair --action basis`: advance cone basis in repair actions.
  - [ ] `git warp doctor cone-basis-lag`: replace checkpoint age warnings with cone basis lag metrics.
  - [ ] Guard against running legacy materialization during ordinary diagnostics.

- [ ] **Slice 9: Cone Performance Witnesses & Showcases**
  - [ ] Port `benchmarks/cone-showcase/` (`AnnotationCorpus`, `ColdOpen`, `GitProcessCounter`, `WitnessReport`).
  - [ ] Port `examples/annotations/` teaching example.
  - [ ] Run Docker cost witness script (`RunConeShowcaseWitness.sh`).
  - [ ] Verify p50 scaling invariants across 200, 2,000, and 20,000 threads.

---

## 3. v21 Roadmap Checklist (Milestone `v21.0.0`)

### Runtime Robustness & Concurrency
- [ ] **Fix clone-local write refs & open semantics** ([#1078](https://github.com/git-stunts/git-warp/issues/1078)): settle what `Warp.open` does before access, and guard clone-local write refs.
- [ ] **Crash, concurrency & durability witnesses** ([#1077](https://github.com/git-stunts/git-warp/issues/1077)): real multi-process crash witnesses for Warp writes.
- [ ] **Typed write causes & unforgeable receipts** ([#1076](https://github.com/git-stunts/git-warp/issues/1076)): prevent callers from synthesizing valid receipts.
- [ ] **Bounded publication probe & writer limit** ([#1075](https://github.com/git-stunts/git-warp/issues/1075)): protect against unbounded writer discovery.
- [ ] **Write attempt crash recovery & re-ask** ([#1074](https://github.com/git-stunts/git-warp/issues/1074)): recover in-flight write intents after process crash.
- [ ] **Honest cross-process `derived` values** ([#1073](https://github.com/git-stunts/git-warp/issues/1073)): guarantee determinism for derived properties across hosts.
- [ ] **Retain write races in receipt core** ([#1072](https://github.com/git-stunts/git-warp/issues/1072)): surface concurrent write races in receipt metadata.

### Storage Scaling & Retention Bounds
- [ ] **Bound retained observation loose objects** ([#1080](https://github.com/git-stunts/git-warp/issues/1080)): eliminate the ~300 loose objects and permanent ref per observation via `git-cas 7.2.0` compressed index.
- [ ] **Bound repository pack count** ([#1041](https://github.com/git-stunts/git-warp/issues/1041)): prevent save cost degradation from loose packs left by bulk loads.

### Ingestion & Stream Processing
- [ ] **Bounded bulk ingestion** ([#917](https://github.com/git-stunts/git-warp/issues/917)): stream public bulk intents through bounded atomic batches with backpressured receipts.

### Documentation & Newcomer Guidance
- [ ] **Optic-only newcomer path** ([#1055](https://github.com/git-stunts/git-warp/issues/1055)): rewrite getting-started and documentation for zero-ceremony Optic access without Rust toolchains.
- [ ] **Update architecture and operations documentation**: reflect cone-only operational commands and substrate version 21 in `ARCHITECTURE.md` and `docs/operations/`.

### Release Hygiene & Verification
- [ ] **Payload headroom & contract reconciliation** ([#1079](https://github.com/git-stunts/git-warp/issues/1079)): ensure packed tarball stays within BATS size budgets.
- [ ] **Re-review expired accepted security risks** ([#1032](https://github.com/git-stunts/git-warp/issues/1032)).
- [ ] **Full test suite & ironclad gates**: verify Vitest (7 shards), Deno, BATS release closure, sludge lint, and typecheck.
- [ ] **Release preflight**: run `scripts/release-preflight.sh` and `scripts/release-guard.sh` before tag.
- [ ] **Version synchronization**: align `package.json`, `package-lock.json`, `jsr.json` to `21.0.0`.

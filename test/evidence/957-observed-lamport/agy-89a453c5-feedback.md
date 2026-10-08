# Ultra-Strict Adversarial Code Review: Issue 957 Candidate

- **Repository**: `git-stunts/git-warp`
- **Branch**: `fix/957-observed-lamport`
- **Candidate Head**: `89a453c5c1c4c6fc7fcc29bc0dbf23de40f94b05`
- **Target Prerequisite**: `fix/985-sha256-ref-cas` at `83c4b2cf51d60ed736797d90d371c08b2158e3eb`
- **Mainline Anchor**: `ceb58e656ec5bc85f0ae5991bf2a55599693bbb3` (`v20.0.0`)
- **Review Mode**: Ultra-strict read-only source & evidence audit (no builds, executions, or modifications)

---

## 1. Executive Summary & Verification State

This candidate addresses issue #957 (observed-writer Lamport starvation) by capturing an immutable write basis containing explicitly inspected writer heads, advancing the scalar Lamport clock strictly past observed heads, merging causal membership contexts/dots independently from clocks, and persisting the observed frontier inside additive optional patch metadata within the existing single-writer CAS publication.

The review verified:
1. **Source Code**: Fully committed at `66f7a21eca29381a6cb2afa2830ecd290d3dbaf4`. No source modifications occurred in subsequent commits (`b578fd54`, `1c4832d5`, `89a453c5`), which strictly added tests, assertions, and validation receipts.
2. **Merge Integrity**: Exactly two merges exist in `origin/main..HEAD` (`08af35c2` and `38f807a7`). Both are clean and preserve repository invariants. Merge `08af35c2` recorded the observation custody plan prior to implementation.
3. **Evidence Validation**: All 69 manifest entries in `candidate-validation-manifest.json` match raw payload and archive SHA-256 digests. Raw console logs corroborate all reported test and coverage figures.
4. **Mandatory Policy Gaps**: The SSTS refactor doctrine requires 100% test coverage on touched code prior to acceptance. Retained evidence (`coverage-diagnostic-957-v1` and `coverage-touched-summary.json`) demonstrates that touched code achieves 93.25%–94.07% line coverage, with known uncovered statements across multiple touched production files. Packed-consumer verification and hosted CI gates remain unexecuted.

---

## 2. Verified Findings

### Demonstrated Code Defects & Inconsistencies

#### [P3] Unbounded Writer Enumeration in Write Observation Capture
- **Coordinates**: `src/domain/services/captureObservedWriteBasis.ts:34-42`
- **Scenario**: When preparing a public write intent that is not a cached removal (`selectedFrontier === undefined`), `captureFrontier()` lists all refs matching `refs/warp/<graph>/writers/*` and sequentially loads and reads each writer head via `readHead()`. Unlike `BoundedNodeRemovalBasis.ts:56` which enforces `MAX_REMOVAL_BASIS_WRITERS = 1024` (`if (frontier.size > MAX_REMOVAL_BASIS_WRITERS) throw budgetExceeded()`), `captureObservedWriteBasis.ts` has no bound on `frontier.size`. In a repository with thousands of active or historical writer refs, an ordinary property write will sequentially scan and decode every single writer head without a budget guard, violating resource discipline bounds.
- **Evidence**: `captureFrontier()` iterates `refs.listRefs(prefix)` without length or size checks.
- **Suggested Fix**: Apply `MAX_REMOVAL_BASIS_WRITERS` (or an explicit configurable bound) inside `captureFrontier()`, throwing `InvalidWriteObservationError` if active writer ref count exceeds the bound.

#### [P3] Asymmetric Clock Validation Allows Unobservable Max-Safe-Integer Lamport Patches
- **Coordinates**: `src/domain/services/ObservedWriteBasis.ts:17-21` vs. `src/domain/types/ObservedWriterHead.ts:34-38`
- **Scenario**: In `ObservedWriteBasis.ts`, constructor validation checks:
  ```ts
  if (!Number.isSafeInteger(ownCandidate) || ownCandidate < 1) {
    throw new InvalidWriteObservationError('Prepared write clock cannot be safely advanced');
  }
  const lamport = Math.max(ownCandidate, observation.maxLamport() + 1);
  ```
  If `ownCandidate === Number.MAX_SAFE_INTEGER`, this check passes and `this.lamport` becomes `Number.MAX_SAFE_INTEGER`. In `src/domain/types/Patch.ts:192`, `Number.isSafeInteger(Number.MAX_SAFE_INTEGER)` is true, allowing the patch to be constructed and committed.
  However, in `src/domain/types/ObservedWriterHead.ts:35`:
  ```ts
  if (!Number.isSafeInteger(lamport) || lamport < 0 || lamport >= Number.MAX_SAFE_INTEGER) {
    throw new InvalidWriteObservationError('Observed patch clock cannot be safely advanced');
  }
  ```
  `validateClock` rejects `lamport >= Number.MAX_SAFE_INTEGER`. Consequently, any future writer that attempts to inspect this published head via `ObservedWriterHead.fromEntry()` will fail with `InvalidWriteObservationError` because `head.lamport === Number.MAX_SAFE_INTEGER`.
- **Evidence**: `ObservedWriterHead.ts:35` sets a strict upper bound `< Number.MAX_SAFE_INTEGER`, while `ObservedWriteBasis.ts:17` and `Patch.ts:192` allow `<= Number.MAX_SAFE_INTEGER`.
- **Suggested Fix**: Disallow `ownCandidate >= Number.MAX_SAFE_INTEGER` in `ObservedWriteBasis.ts` and require `lamport < Number.MAX_SAFE_INTEGER` before admitting the basis.

#### [P4] Ambient `declare` Property Syntax on Concrete Domain Class
- **Coordinates**: `src/domain/types/Patch.ts:151`
- **Scenario**: `Patch.ts` declares `declare readonly observedFrontier?: ObservedWriteFrontier;`. While this prevents TypeScript from generating an explicit `this.observedFrontier = undefined` assignment (preserving `hasOwn(patch, 'observedFrontier') === false` for legacy CBOR encoding parity), using ambient `declare` on a concrete domain class member obscures runtime truth and relies on type erasure rather than an explicit property descriptor or initialization contract.
- **Evidence**: `src/domain/types/Patch.ts:151`.
- **Suggested Fix**: Document this explicit CBOR serialization rationale directly above the property, or manage property omission through the codec boundary/DTO projection rather than ambient domain declarations.

---

### Acknowledged Evidence & Verification Limitations (Not Code Defects)

#### [P4] SSTS Refactor 100% Touched-Code Coverage Not Established
- **Coordinates**: `test/evidence/957-observed-lamport/coverage-touched-summary.json` & `coverage-diagnostic-957-v1-console.txt.gz`
- **Impact**: The repository doctrine in `AGENTS.md` mandates 100% test coverage on touched code for refactor slices. While the full 825-file manifest in `coverage-957-v1` reports 94.07% line coverage (27,983/29,746 lines) against the unchanged 93.48% gate, targeted touched diagnostics (`coverage-diagnostic-957-v1`) failed at 93.25% line coverage. Statement gaps exist in:
  - `src/domain/api/WriteRuntime.ts`: 6 uncovered statements (lines 195, 198, 209, 267, 319, 335)
  - `src/domain/services/BoundedNodeRemovalBasis.ts`: 2 uncovered statements (lines 56, 169)
  - `src/domain/services/ObservedWriteBasis.ts`: 1 uncovered statement (line 15)
  - `src/domain/services/PatchBuilder.ts`: 9 uncovered statements (lines 245, 281, 282-289, 284, 285, 286, 288)
  - `src/domain/services/PatchCommitter.ts`: 4 uncovered statements (lines 87-94, 117, 133, 134)
  - `src/domain/services/controllers/PatchController.ts`: 11 uncovered statements (lines 152, 155, 160, 233, 339, 340, 366, 369, 437, 438)
  - `src/domain/services/sync/syncPatchLoader.ts`: 19 uncovered statements (lines 73, 103-109, 112-114, 117, 119, 162-183, 186-193)
  - `src/domain/types/Patch.ts`: 6 uncovered statements (lines 22-24, 33-35, 95-97, 190)
  - `src/infrastructure/adapters/CborPatchJournalAdapter.ts`: 4 uncovered statements (lines 131, 193-196, 201, 318)
- **Status**: Retained diagnostic failure, acknowledged as an open requirement.

#### [P4] Packed-Consumer Installation Validation Outstanding
- **Coordinates**: `test/evidence/957-observed-lamport/README.md:5`
- **Impact**: All integration and unit tests execute against copied source files inside the container worker. Verification against a packed, published npm tarball (`type-firewall-packed-consumer`) has not been performed for candidate head `89a453c5`.
- **Status**: Acknowledged as an open gate.

#### [P5] Memory-Only Publication Failure Acknowledgement Fixture
- **Coordinates**: `test/unit/domain/services/PatchCommitter.failureContract.test.ts:37-53`
- **Impact**: `PatchCommitter.failureContract.test.ts` asserts that `onCommitSuccess` callback rejections log warnings and preserve acknowledged publications. However, it uses `ObservationJournal`, an acknowledgement test fixture that does not execute Git ref mutations or test true filesystem persistence under callback crash. Real persistence is verified separately by `Runtime.observedLamport.integration.test.ts`.

---

## 3. Production Path & Causal Model Analysis

### Path Tracing: Public Write Preparation to Publication
1. **Entry Point**: `WriteRuntime.publishIntentWrite()` (`src/domain/api/WriteRuntime.ts:134-144`) calls `patch.prepareWriteBasis()` before applying intent operations.
2. **Observation Capture**: `PatchBuilder.prepareWriteBasis()` (`src/domain/services/PatchBuilder.ts:230`) dispatches to `_prepareObservation()`:
   - For cached removals (`nodeIds.length > 0 && state !== null`), pins to `_snapshotFrontier`.
   - For standard public writes (`nodeIds.length === 0`), calls `captureObservedWriteBasis()` (`src/domain/services/captureObservedWriteBasis.ts:21`).
   - For strands (`_targetRefPath !== null`), falls back to `_restoreWriterContext()`.
3. **Head Inspection**: `captureObservedWriteBasis` lists writer refs, reads heads via `readHead(journal, writer, sha)`, pins own predecessor to `expectedParentSha`, and constructs `ObservedWriterHead` instances.
4. **Causal Join**: Membership dots and contexts are aggregated via `observedMembership(entry)` using `VersionVector.merge()`. Clocks are advanced via `Math.max(ownCandidate, observation.maxLamport() + 1)`.
5. **Mutation Guard During Await**: Both `prepareWriteBasis` and `_prepareObservation` verify `this._assertNotCommitted()` and `if (this._ops.length > 0) throw new PatchError(...)`, guaranteeing that concurrent operations added during async I/O abort cleanly.
6. **Publication**: `commitPatch()` (`src/domain/services/PatchCommitter.ts:58-126`) verifies single-writer ref CAS, checks parent commit message lamport, constructs `Patch({ ..., observedFrontier })`, stages asset CBOR, commits the Git bundle, and updates the ref.
7. **Storage Adapter Decode**: `CborPatchJournalAdapter.readPatch()` (`src/infrastructure/adapters/CborPatchJournalAdapter.ts:139-145`) calls `hydratePatchAtDecodeBoundary()`, invokes `decodeObservedWriteFrontier()`, and verifies `requireObservationGraph(patch, this.#graph)`.

### Assessment: What Head-Only Observation Proves vs. Causal Knowledge Loss
- **What It Proves**:
  1. The new write strictly succeeds the observed heads in Lamport ordering ($L(w) > \max_{h \in \text{heads}} L(h)$), preventing LWW starvation against prior writes.
  2. The new write includes all causal dots present in the observed heads' contexts and operations ($\text{context}(w) \supseteq \bigcup_{h} (\text{context}(h) \cup \text{dots}(h))$).
  3. The exact set of observed writer heads is immutably recorded in `observedFrontier` (graph name, writer IDs, and exact patch SHAs).
- **What It Does NOT Prove (Causal Loss vs. Lamport Inference)**:
  1. Head-only observation does **not** perform causal history traversal or ancestor graph verification. It trusts that each writer's head context accurately summarizes its historical causal dependencies.
  2. Lamport advancement is a scalar linearization tool, **not** proof of causal ancestry. A writer advancing past observed Lamport 21 does not make it a causal descendant of intermediate operations if those operations were not in the head context.
  3. Writers that are concurrent and unobserved (e.g., partitioned replicas whose refs have not been fetched) remain concurrent. Their conflict resolution depends on deterministic LWW tie-breaks, which this design correctly preserves without fabricating cross-writer Git parentage.

---

## 4. Audit of Merges (`origin/main..HEAD`)

| Commit SHA | Parents | Description & Conflict Resolution Audit |
| :--- | :--- | :--- |
| `08af35c2096ddf355d9fea5e9cb89121610c9cdd` | `f8680b03` (P1) <br> `83c4b2cf` (P2) | **Local feature stack merge**: Merges initial RED reproduction (`f8680b03`) with CAS prerequisite stack (`83c4b2cf`). <br> **Audit**: Clean 3-way tree merge; no conflict markers. Adds `observation-custody-plan.md` prior to code changes in `66f7a21e`. Tree identity preserved. |
| `38f807a7ea466ebddca69bc061850a04e39ad367` | `b0e283f3` (P1) <br> `5c82ba6c` (P2) | **Inherited stack merge**: Merges reviewed audit prerequisite (#987, `5c82ba6c`) into CAS branch (`b0e283f3`). <br> **Audit**: Clean merge. Brings `dependency-audit.md` and lockfile updates into CAS stack. No regressions. |

---

## 5. Mandatory Verification Checklist

### Code Paths Traced
- [x] `PatchDiscovery.ts:144-160` $\to$ `PatchController.ts:140-174` (initial nextLamport lookup)
- [x] `WriteRuntime.ts:134-144` $\to$ `PatchBuilder.ts:230-277` (`prepareWriteBasis` & `_prepareObservation`)
- [x] `captureObservedWriteBasis.ts:21-78` (`captureFrontier`, `readHead`, `observedMembership`, `pinOwnPredecessor`)
- [x] `ObservedWriteBasis.ts:13-29` (Lamport computation & coordinate generation)
- [x] `PatchCommitter.ts:58-126` (CAS check, parent Lamport resolution, `new Patch(...)` construction)
- [x] `CborPatchJournalAdapter.ts:84-145, 316-320` (`appendPatch`, `readPatch`, `requireObservationGraph`)
- [x] `ObservedWriteFrontierDecoder.ts:8-40` (untrusted raw object parsing & domain instantiation)
- [x] `PatchHydrationAdapter.ts:10-18` (`hydratePatchAtDecodeBoundary`)
- [x] `syncPatchLoader.ts:56-76` (`normalizePatch` preservation of `observedFrontier`)
- [x] `WriteRuntime.ts:271-353` (`operationalWriteFailure`, `invalidObservationMetadata`, typed refusal mapping)
- [x] `BoundedNodeRemovalBasis.ts:45-62` (observation-backed frontier reuse)
- [x] `BtrCodecAdapter.ts:240-254` (canonical BTR signing isolation)

### SHAs & Merges Audited
- [x] Target prerequisite head: `83c4b2cf51d60ed736797d90d371c08b2158e3eb`
- [x] Implementation commit: `66f7a21eca29381a6cb2afa2830ecd290d3dbaf4`
- [x] Test/evidence commits: `b578fd54`, `1c4832d5`, `89a453c5` (exact HEAD: `89a453c5c1c4c6fc7fcc29bc0dbf23de40f94b05`)
- [x] Merge commit `08af35c2` audited against parents `f8680b03` and `83c4b2cf`
- [x] Merge commit `38f807a7` audited against parents `b0e283f3` and `5c82ba6c`

### Evidence, Hashes & Numbers Checked
- [x] `candidate-inputs.json`: All 25 file SHA-256 digests match working tree files.
- [x] `candidate-validation-manifest.json`: All 69 manifest entries match uncompressed payload and archive SHA-256 digests.
- [x] `red.txt.gz`: Initial RED on Node 24.18.0 confirmed (SHA-1: `expected 1 to be greater than 21`; SHA-256: ref CAS bootstrap failure).
- [x] `red-957-current-v1-console.txt.gz`: 4 failed tests confirmed (2 starvation + 2 missing metadata).
- [x] `full-unit-957-v2-console.txt.gz`: 8,716 passed tests across 6 shards (304 + 988 + 910 + 3144 + 2119 + 1251), 2 skipped.
- [x] `integration-957-v1-console.txt.gz`: 183 passed tests (163 general + 20 content-attachment).
- [x] `coverage-957-v1-console.txt.gz`: 825 files, 8,926 passed, 2 skipped, 27,983/29,746 lines (94.07% vs. 93.48% gate).
- [x] `coverage-diagnostic-957-v1-console.txt.gz`: 311 passed, 93.25% line coverage (retained gate failure).
- [x] `edges-957-v2-console.txt.gz`: 40 passed tests.
- [x] `graph-guard-957-v1-console.txt.gz`: 46 passed tests.
- [x] `failure-contract-957-v3-console.txt.gz`: 4 passed tests.
- [x] Resource constraints verified: Worker `git-warp-tests`, image `sha256:9f145953f6e79a59749a683d11a476133cb7cef0588b79256dc195b1d0c87ad7`, Node `22.23.3`, npm `10.9.9`, 20 GiB monitored build bound, 3 GiB runtime tmpfs, 16 MiB stdout cap, 768 PID limit.

### Repository Binding Policy Checks
- [x] Anti-sludge scan: Zero `any`, zero `as unknown as`, zero `unknown` outside adapters, zero raw `new Error` in domain.
- [x] File line limits: All source files $\le 500$ lines (`PatchBuilder.ts` is 499 lines), test files $\le 800$ lines.
- [x] Quarantine manifests: Zero touched files present in `policy/quarantines/*.json`.

---

## 6. Execution Status Disclosure

- **Executed**: Read-only static queries, git rev-parse, git log graph traversal, git diff inspection, python-based digest/manifest validation, and raw gzip console log inspection.
- **Inspected Only**: All committed source files in `src/`, test files in `test/`, and receipts in `test/evidence/957-observed-lamport/`.
- **Skipped / Unavailable**: No container test campaigns or build scripts were executed (Docker-only tests with guarded worker per user instructions). Hosted PR checks and packed-consumer checks are unexecuted and remain outstanding.

---

## Final Verdict

**REQUEST CHANGES**

*(Rationale: While the domain model, CRDT causal separation, and publication custody mechanics are robustly designed and supported by raw evidence, the candidate cannot be approved in its current state due to: (1) demonstrated unbounded writer enumeration under property writes in `captureObservedWriteBasis.ts`, (2) clock validation asymmetry allowing unobservable `Number.MAX_SAFE_INTEGER` patches, and (3) missing mandatory repository requirements, specifically the unmet 100% touched-refactor coverage gate and unexecuted packed-consumer validation.)*

═══ ⋆★⋆ Progress Report ⋆★⋆ ═══

Issue 957 Observed-Lamport Code Review
[████████████████████] 100% (1/1 slices)

- [x] Ultra-strict adversarial code and evidence review of candidate 89a453c5

⎇ fix/957-observed-lamport +13/-0
🚫 none

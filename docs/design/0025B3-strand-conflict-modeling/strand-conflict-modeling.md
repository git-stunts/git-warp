---
title: "Strand + conflict-data modeling: name the concepts, delete the Record<string, unknown> spray"
legend: "PURGE"
cycle: "0025B3-strand-conflict-modeling"
parent_cycle: "0025-anti-sludge-purge"
---

# Cycle 0025B3 — Strand conflict-data modeling

## Sponsors

- Human: Backlog operator
- Agent: Implementation agent

## Hill

The 22 files under `src/domain/services/strand/` and
`src/domain/types/conflict/` listed in
`policy/quarantines/0025B-boundary.json` expose **zero**
`Record<string, unknown>` and **zero** non-catch, non-type-guard
`unknown` uses in non-adapter positions. Every raw-shape flowing
through the strand pipeline has a named, runtime-backed domain
type. The `policy/quarantines/0025B-boundary.json` manifest shrinks
by 22 entries.

## Scope

All 22 files listed in the parent backlog item (0025B3 cluster):

**services/strand/:** ConflictAnalysisRequest, ConflictAnalyzerService,
ConflictCandidate, ConflictCandidateCollector, ConflictFrameLoader,
ConflictTraceAssembler, StrandCoordinator, StrandDescriptorStore,
StrandIntentService, StrandPatchService, conflictCandidateAnalysis,
conflictTargetIdentity, createStrandCoordinator,
descriptorNormalization, strandShared.

**types/conflict/:** ConflictAnchor, ConflictDiagnostic,
ConflictResolution, ConflictResolvedCoordinate, ConflictTarget,
ConflictTrace, validation.

## Diagnosis

The strand pipeline shares a **conflict-data anti-model**:
`Record<string, unknown>` sprayed through conflict frames,
witnesses, resolutions, and hashing payloads. The latent concepts
never got named. Specific concept holes identified:

1. **`ConflictReceiptRef`** — evidence references to tick-receipt
   coordinates (`patchSha`, `lamport`, `opIndex`). Currently
   `Array<Record<string, unknown>>` in `ConflictTrace.evidence.receiptRefs`
   and in the trace assembler.
2. **`ConflictEventIdRef`** — the `{ lamport, writerId, patchSha, opIndex }`
   event-id bag attached to ConflictResolution.comparator winner/loser.
   Currently `Record<string, unknown>` at construction and as frozen
   internal storage.
3. **`StrandCoordinateMetadata`** — the strand-specific braid metadata
   attached to `ConflictResolvedCoordinate.strand`. Currently
   `Record<string, unknown>` and constructed via a nested helper.
4. **`ConflictAnalysisFilterRecord`** — the snapshot-filter payload
   from `ConflictAnalysisRequest.toSnapshotFilterRecord()`. Currently
   `Record<string, unknown>` feeding into hash inputs.
5. **`ConflictDiagnosticData`** — the structured data payload attached
   to a diagnostic. Currently `Record<string, unknown> | undefined`.
6. **`HashablePayload`** — structural JSON-tree value accepted by the
   analyzer's `_hash` method. Currently `unknown` on every
   hashing-service interface. Modelled as a recursive structural
   alias (not a class — it captures raw byte-ready values and has no
   invariants beyond shape).

Additionally the `descriptorNormalization` chain takes `value: unknown`
at every entry point. Because `parseStrandBlob` (out of scope for
0025B3) leaves `intentQueue`/`evolution` as unvalidated trailing
fields via `[key: string]: unknown`, these normalizers serve as a
secondary boundary decoder. The fix:

- Introduce **type-predicate parsers** for the raw intent-queue /
  evolution / last-tick / rejected-counterfactual shapes. `unknown`
  remains ONLY inside the type-guard predicate signatures
  (`function isFoo(value: unknown): value is Foo`) — legitimate per
  the 0025B exit criteria.
- The public normalize functions take typed input (the narrowed
  raw shape), never `unknown`.

## Non-goals

- Do NOT touch `parseStrandBlob.ts` (0025B5 territory).
- Do NOT rename `OpLike` / `PatchLike` (0025C territory).
- Do NOT substantively modify `JoinReducer`, `PatchHydrator`, or
  `OpNormalizer` (explicitly out of scope per task spec).
- Do NOT touch controllers/ (0025B2) or ports/ (0025B1).

## Op-model concession

Canonical ops (`canonOp`) produced by `normalizeRawOp(rawOp)` flow
through `conflictCandidateAnalysis` and `conflictTargetIdentity` as
`Record<string, unknown>`. This IS the Op concept 0025C introduces.
Per the task spec we leave this alone: replace the raw `Record<string,
unknown>` uses with a minimal interim `CanonicalOpBlob` type alias
that captures the structural shape actually read (string/array-of-
string properties). Every such use gets a `TODO(0025C)` comment. When
0025C introduces the `Op` class hierarchy, the alias folds into it.

## Plan

Commits will be shaped around one concept per commit:

1. Open cycle design doc (this commit).
2. Introduce `ConflictReceiptRef` class; retype `ConflictTrace` and
   `ConflictTraceAssembler` to emit it.
3. Introduce `ConflictEventIdRef` class; retype `ConflictResolution`
   comparator to emit it.
4. Introduce `StrandCoordinateMetadata` class; retype
   `ConflictResolvedCoordinate.strand` and the frame-loader helper.
5. Introduce `ConflictAnalysisFilterRecord` class; retype
   `ConflictAnalysisRequest.toSnapshotFilterRecord`.
6. Introduce `ConflictDiagnosticData` class; retype `ConflictDiagnostic`
   and the push-diagnostic helper.
7. Introduce `HashablePayload` structural alias; retype every
   `_hash(payload: unknown)` service surface.
8. Retype `canonOp` chain via `CanonicalOpBlob` alias + TODO(0025C).
9. Refactor `descriptorNormalization` to use type-predicate parsers.
10. Retype `StrandDescriptorStore` / `StrandPatchService` /
    `StrandIntentService` / `createStrandCoordinator` to eliminate
    stray `Record<string, unknown>` and `unknown` at service-level
    signatures.
11. Retype `ConflictAnalysisRequest` private normalizers using the
    same type-predicate pattern.
12. Regenerate contamination manifest.
13. Close cycle with retro.

Each commit must compile and pass the full test suite.

## Success criteria

- `policy/quarantines/0025B-boundary.json` shrinks by exactly the
  22 files in this scope.
- `npm run typecheck`, `npm run test:local`, `npm run lint`,
  `npm run lint:sludge`, `npm run lint:quarantine-graduate`,
  `npm run lint:contamination && git diff --exit-code
  policy/quarantines/` all green.

## Playback questions

### Human

- [ ] Do any new `*Like` types exist in the patch? (expected: zero)
- [ ] Is every new domain class validated in its constructor and
      `Object.freeze`d? (expected: yes)
- [ ] Did the refactor preserve tick-receipt + conflict-analysis
      behavior end-to-end? (expected: yes, per unchanged tests)

### Agent

- [ ] For each new class: it replaces at least one
      `Record<string, unknown>` site.
- [ ] For each remaining `unknown` in scope: it appears ONLY inside
      a `catch` binding or a `value is Foo` type-guard predicate.
- [ ] The contamination manifest shows exactly the scope files
      removed.

## Related

- Parent cycle: `docs/design/0025-anti-sludge-purge/`
- Parent backlog: `docs/method/backlog/v17.0.0/PROTO_purge-boundary-leaks.md`
- Predecessor retros: `docs/method/retro/0023-orsetlike-contract/`,
  `docs/method/retro/0024-orset-internal-encapsulation/`.
- Anti-sludge policy: `docs/ANTI_SLUDGE_POLICY.md`
- SSTS: `docs/SYSTEMS_STYLE_TYPESCRIPT.md`

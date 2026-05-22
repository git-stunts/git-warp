# BEARING

Updated at cycle boundaries and before the final commit of each v18 slice.

Scope note:

- `BEARING` says where the repo stands now, what feels wrong now, and what is
  next.
- For canonical noun meanings, use [GLOSSARY.md](GLOSSARY.md).
- For the runtime architecture ladder, use
  [0035-observer-geometry-architecture-ladder.md](design/0035-observer-geometry-architecture-ladder.md).
- For later-major horizon planning, use
  [release-horizon-v20-v21.md](design/release-horizon-v20-v21.md).

## Continuum Optic Admission Posture

For cross-repo optic admission, git-warp is a complete Continuum participant,
not an Echo runtime surrogate. Continuum is the protocol for exchanging
witnessed causal history. Wesley compiles artifacts and descriptors, Echo
admits Echo-local runtime invocations, git-warp admits git-warp-local causal
history and readings, authority layers issue grants, and applications hide
handles and basis references behind product adapters.

## Where are we

`git-warp` has shipped `v17.0.0` and the `v17.0.1` follow-up release repair.
The release work is now behind us in repo history, npm, and JSR; the active
direction is `v18.0.0`.

The v18 hill is not generic graph-model cleanup. It is Continuum
compatibility:

> Make `git-warp` a Continuum-compatible sibling WARP runtime: consume
> Wesley-generated artifacts for Continuum-owned contract families, map
> git-warp's append-only Git-backed causal history into honest WARP Optic
> evidence, and
> give `warp-ttd` generated-family facts instead of handwritten adapter
> folklore.

The long-term compatibility target is the WARP Optic shape described in
`~/git/blog/aion-paper-07/dist/aion-paper-07.txt`, plus the Continuum
contract families authored in `~/git/continuum/schemas/` and compiled by
Wesley. Echo and `git-warp` are sibling runtime implementations. `git-warp`
has its own Continuum role, and it must not emit Continuum-shaped values as
native Continuum witnesses until that witnesshood is actually proven.

Backlog fold-in: the repo-visible v18 lane is
`WL-4A-v18-graph-substrate-convergence` in
[WORKLOADS.md](method/backlog/WORKLOADS.md), backed by the eight notes in
[method/backlog/v18.0.0](method/backlog/v18.0.0/). Treat that lane as the
graph-model track inside this compatibility campaign: node and edge record
identity, attachment slots, graph-op algebra, content cutover, legacy property
projection, migration tooling, and genesis replay equivalence. Existing
`echo-shaped` backlog identities are historical shorthand for graph-model
pressure already exercised by Echo, not a claim that Echo owns `git-warp`'s
Continuum role.

Current branch state at this boundary:

- Branch: `v18-continuum-slices-11-15`
- Base branch: `main`
- Latest remote head inspected: `origin/main` at `a4c5467e`
- Latest released package line: `17.0.1`
- Latest merged PR: #94, v18 Continuum slices 6 through 10 plus review
  repairs
- Latest completed v18 implementation cycle:
  `0163-v18-witnessed-suffix-source-facts`

The release ladder is now:

- `v17.0.0`: shipped TypeScript migration, public API honesty,
  materialization-frontdoor deletion, readings/optics direction, and query
  read-model groundwork.
- `v17.0.1`: repaired recursive tree OID read fanout, preserved
  prototype-like Git path names, and captured review follow-up backlog designs.
- `v18.0.0`: Continuum/WARP Optic compatibility for git-warp as an independent
  Continuum participant, through Wesley-generated contract-family artifacts and
  honest evidence posture.
- `v19.0.0`: observation, doctrine, and slice-first runtime convergence
- `v20.0.0`: slice-first read execution
- `v21.0.0`: distributed observer geometry and admission reality

The v18 compatibility work is bigger than ten slices. The first ten slices are
the opening campaign. Slice 11 is an explicit re-plan point after the repo has
real evidence from generated artifact ingestion, evidence posture, and the
first receipt-family projection.

## Invariants

Compact list here; full derivations with paper grounding, codebase
mapping, and concrete checks live in `docs/invariants/`.

1. **TICK-CONFLUENCE** — same patches, any order, same materialized state
   (Paper II Thm 5.1, OG-4 Thm 10) → `tick-confluence.md`
2. **HOLOGRAPHIC-BOUNDARY** — initial state + patch chains = complete replay,
   no ambient state (Paper III Thm 4.1) → `holographic-boundary.md`
3. **BACKWARD-PROVENANCE** — every value traces to exactly one producing
   patch (Paper III Thm 4.2) → `backward-provenance-completeness.md`
4. **PAYLOAD-MONOID** — checkpoint + remaining patches = full replay
   (Paper III Prop 3.2) → `payload-monoid.md`
5. **STATE-PROVENANCE-SEP** — state convergence does not imply history
   convergence (OG-4 Prop 13, OG-1 Thm 91) → `state-provenance-separation.md`
6. **EXPLICIT-CONFLICT** — conflicts are surfaced, never silently erased
   (OG-4 Thm 15) → `explicit-conflict-surfacing.md`
7. **APPEND-ONLY** — Git history never rewritten
   (Paper III Def 3.6) → `append-only-history.md`
8. **DOMAIN-PURITY** — domain never imports infrastructure or ambient state
   (Paper III Rmk 3.4) → `domain-purity.md`
9. **WRITER-ISOLATION** — each writer owns its own ref, no coordination
   (Paper II Thm 7.1, OG-4 Thm 10) → `writer-isolation.md`
10. **TWO-PLANE-COMMUTATION** — property and topology ops commute
    (Paper II Thm 7.1) → `two-plane-commutation.md`
11. **CAS-ATOMICITY** — writer ref updates are compare-and-swap
    (Paper II Rmk 4.3) → `cas-atomicity.md`
12. **OBSERVER-DETERMINISM** — queries and traversals are deterministic
    functions of state (Paper IV Def 3.1) → `observer-projection-determinism.md`
13. **TRAVERSAL-TRUTH** — streams for traversal, ports for truth
    (OG-1 Def 3, Paper IV Sec 3.3) → `traversal-truth.md`
14. **NO-SCALARIZATION** — observer comparison is multi-dimensional
    (OG-1 Thm 87) → `no-scalarization.md`
15. **SUFFIX-TRANSPORT** — sync at tip, not replay from frontier
    (OG-4 Thm 9) → `suffix-transport-correctness.md`

## What just shipped

`v17.0.0` shipped and was followed by release hardening and the `v17.0.1`
performance/correctness repair:

- The v17 release branch landed through PR #84.
- Follow-up repair and package migration work landed through PR #85.
- Release hardening landed through PR #86.
- The final v17 coverage ratchet landed through PR #87; the signed
  `v17.0.0` tag points at that merge.
- npm publish recovery landed through PR #88.
- PR #89 simplified the README model sentence after the release line.
- PR #93 flattened recursive tree OID reads into one `git ls-tree -rz` call,
  fixed prototype-like path handling with a `Map` accumulator, released
  `v17.0.1`, and added design-backed backlog fuel for path-keyed boundary
  audits, safe path-map materialization, review-bot warning policy, and a
  recursive tree path benchmark.

The shipped v17 scope remains: TypeScript migration, public API honesty,
materialization-frontdoor deletion, readings/optics direction, query
read-model groundwork, sync hardening, release gates, and package publishing.

## What feels wrong

- The release preflight fix lowered the coverage ratchet to the measured
  full-suite v17 line baseline `91.74%`; this is tracked as v19 bad-code debt
  in `SPEC_coverage-ratchet-baseline-drop.md`.
- The v17.0.1 performance repair proved that adapter-level path keys must not
  be treated as safe object member names. That is now tracked by planned
  design/backlog work in cycles 0150 through 0153.
- v18 can easily turn into adapter folklore if `git-warp` hand-authors local
  mirrors of Continuum-owned families instead of consuming Wesley-generated
  artifacts.
- v18 can also lie in the other direction: Continuum-shaped values are not
  Continuum-native witnesses unless the runtime has actually proven native
  witnesshood. Initial git-warp compatibility evidence should be treated as
  translated git-warp evidence until stronger proof exists.
- The v18 backlog already names a graph-model convergence lane. The plan must
  fold that lane into Continuum compatibility instead of replacing it with a
  parallel cross-repo adapter plan.
- `warp-ttd` needs git-warp facts as generated-family nouns, but the existing
  ecosystem still contains handwritten adapter and protocol residue.

## What comes next

Run v18 slices 11 through 15 in order. Each slice gets a design document
before implementation, RED before GREEN, and a BEARING update before the final
commit for that slice.

## Running Task List

- [x] 1. Sync and clean the repo runway: fast-forward `main`, clear fsmonitor
  noise, close stale v17/0145 bookkeeping, and record the v18 starting point.
- [x] 2. Create the v18 Continuum compatibility charter: WARP Optic
  compatibility, Continuum contract-family compatibility, Wesley-generated
  artifact consumption, and `warp-ttd` acceptance.
- [x] 3. Build the cross-repo contract matrix: Continuum family to Wesley
  generated artifact to git-warp source fact to `warp-ttd` consumer need,
  with `WL-4A-v18-graph-substrate-convergence` folded in as the graph-model
  track.
- [x] 4. Define git-warp's WARP Optic realization map: observer plan, bounded
  slice, lowering surface, admissibility law, and retention contract.
- [x] 5. Add a generated-artifact ingestion path for Continuum families, with a
  guard against handwritten local mirrors becoming contract authority. The
  current seam admits Continuum receipt-family fixture JSON and Wesley
  realization manifest JSON through explicit load context; it binds each
  accepted JSON shape to the matching context authority, the domain policy
  independently rejects descriptor kind/authority mismatches, the adapter entry
  point and adapter-local JSON type carriers are split below the source-size
  and one-file-per-concept caps, self-attested authority fields from artifact
  JSON are rejected, policy-test authority fixtures are named constants, and
  empty or internally inconsistent Wesley generated inventory is rejected.
- [x] 6. Make evidence posture explicit:
  [0154-v18-evidence-posture](design/0154-v18-evidence-posture/v18-evidence-posture.md)
  defines translated git-warp evidence first, with native Continuum evidence
  only after native witnesshood is proven. `ContinuumEvidencePosture` and
  `ContinuumEvidenceClaim` now separate generated artifact shape authority from
  witnesshood, require explicit proof for native Continuum evidence, and expose
  `requireTranslatedGitWarpEvidence()` for receipt-family projection.
- [x] 7. Prove the patch commit visibility contract:
  [0155-v18-patch-commit-visibility-contract](design/0155-v18-patch-commit-visibility-contract/v18-patch-commit-visibility-contract.md)
  defines success as canonical writer-tip advancement and visible graph truth,
  not just object creation. `commitPatch()` now verifies that the writer ref
  visibly points at the new commit before reporting success or running
  `onCommitSuccess`; hidden post-object/pre-ref failures raise typed
  persistence errors.
- [x] 8. Add the same-writer concurrent patch race witness:
  [0156-v18-same-writer-concurrent-race-witness](design/0156-v18-same-writer-concurrent-race-witness/v18-same-writer-concurrent-race-witness.md)
  requires final-frontier and visible-state assertions. `commitPatch()` now
  advances writer refs through `compareAndSwapRef`, translates atomic frontier
  movement into retryable writer conflict posture, and keeps the losing
  same-writer patch out of canonical materialized state.
- [x] 9. Project git-warp receipt facts into the generated Continuum
  receipt-family shape:
  [0157-v18-receipt-family-projection](design/0157-v18-receipt-family-projection/v18-receipt-family-projection.md)
  uses generated-family descriptors and explicit translated evidence posture.
  `GitWarpReceiptSourceFacts` validates local `TickReceipt`,
  `DeliveryObservation`, and optional `ReceiptShard` inputs;
  `ContinuumReceiptFamilyProjection` emits generated-family `receipts`,
  `witnesses`, and `deliveryObservations` arrays while preserving translated
  git-warp evidence posture.
- [x] 10. Add the first `warp-ttd` smoke over generated-family git-warp receipt
  facts:
  [0158-v18-warp-ttd-receipt-smoke](design/0158-v18-warp-ttd-receipt-smoke/v18-warp-ttd-receipt-smoke.md)
  rejects handwritten adapter-local receipt folklore. The standalone smoke
  `test/smoke/warpTtdReceiptFamilyProjectionSmoke.ts` dynamically loads the
  sibling `~/git/warp-ttd` adapter at execution time, rejects plain local
  receipt DTOs, and proves `warp-ttd` can summarize generated-family git-warp
  receipt projection facts while preserving translated evidence posture.
- [x] 11. Re-plan with evidence in hand after slices 1 through 10 and PR #94:
  [0159-v18-replan-with-evidence](design/0159-v18-replan-with-evidence/v18-replan-with-evidence.md)
  keeps slices 12 through 15 as translated source-fact compatibility work, not
  a full v19 observer/runtime rewrite.
- [x] 12. Refresh the generated Continuum/Wesley family inventory before
  projecting more families:
  [0160-v18-generated-family-inventory-refresh](design/0160-v18-generated-family-inventory-refresh/v18-generated-family-inventory-refresh.md)
  adds runtime-backed readiness rows for the four current Continuum families.
  Receipt and settlement are projection-ready; neighborhood core and runtime
  boundary stay authored-only until Wesley profiles and fixtures exist.
- [x] 13. Audit the `TickPatch`/`TickReceipt` witness ladder into replay core,
  witness core, and receipt shell:
  [0161-v18-tickpatch-tickreceipt-witness-ladder](design/0161-v18-tickpatch-tickreceipt-witness-ladder/v18-tickpatch-tickreceipt-witness-ladder.md)
  names `GitWarpTickPatchReplayCore`, `GitWarpTickReceiptWitnessCore`,
  `GitWarpTickReceiptShell`, and `GitWarpTickWitnessLadder`, validates
  patch/receipt alignment, and promotes the old up-next backlog note into the
  cycle packet.
- [x] 14. Project one git-warp read result into runtime-boundary
  reading-envelope source facts:
  [0162-v18-reading-envelope-source-facts](design/0162-v18-reading-envelope-source-facts/v18-reading-envelope-source-facts.md)
  adds `GitWarpReadingEnvelopePayloadFact` and
  `GitWarpReadingEnvelopeSourceFacts`, requires translated git-warp evidence,
  and keeps runtime-boundary marked as authored-only until Wesley profiles and
  fixtures exist.
- [x] 15. Project one git-warp sync/export suffix into translated
  witnessed-suffix source facts:
  [0163-v18-witnessed-suffix-source-facts](design/0163-v18-witnessed-suffix-source-facts/v18-witnessed-suffix-source-facts.md)
  adds `GitWarpWitnessedSuffixPatchFact` and
  `GitWarpWitnessedSuffixSourceFacts`, rejects empty suffix patch lists, and
  keeps the current sync protocol intact while runtime-boundary remains
  authored-only.

The loop stays strict: write or update the cycle doc, capture RED, green the
slice, update this BEARING task list before the final commit, validate, then
commit only the files touched in that slice.

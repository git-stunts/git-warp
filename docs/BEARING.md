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

`git-warp` has shipped `v17.0.0`. The release work is now behind us in
repo history, npm, and JSR; the active direction is `v18.0.0`.

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

- Branch: `v18-continuum-opening`
- Release tag: `v17.0.0`
- Latest remote head inspected: `origin/main` at `5afdd3eb`
- Latest package version: `17.0.0`
- Latest closed cycle:
  `0145-push-pr-review-merge`

The release ladder is now:

- `v17.0.0`: shipped TypeScript migration, public API honesty,
  materialization-frontdoor deletion, readings/optics direction, and query
  read-model groundwork.
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

`v17.0.0` shipped and was followed by release hardening:

- The v17 release branch landed through PR #84.
- Follow-up repair and package migration work landed through PR #85.
- Release hardening landed through PR #86.
- The final v17 coverage ratchet landed through PR #87; the signed
  `v17.0.0` tag points at that merge.
- npm publish recovery landed through PR #88.
- PR #89 simplified the README model sentence after the release line.

The shipped v17 scope remains: TypeScript migration, public API honesty,
materialization-frontdoor deletion, readings/optics direction, query
read-model groundwork, sync hardening, release gates, and package publishing.

## What feels wrong

- The release preflight fix lowered the coverage ratchet to the measured
  full-suite v17 line baseline `91.74%`; this is tracked as v19 bad-code debt
  in `SPEC_coverage-ratchet-baseline-drop.md`.
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

Run the v18 opening campaign. Update this task list at the end of each slice,
before the final commit for that slice, and mark completed items with `- [x]`.

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
- [x] 6. Make evidence posture explicit: translated git-warp evidence first,
  native Continuum evidence only after native witnesshood is proven. The
  current seam adds runtime-backed `ContinuumEvidencePosture` and
  `ContinuumEvidenceStatus`; translated git-warp evidence is explicit
  `translated-substrate` evidence, native Continuum evidence cannot be
  constructed without `nativeWitnessRef`, and translated evidence rejects native
  witness references.
- [x] 7. Prove the patch commit visibility contract: success means canonical
  writer-tip advancement and visible graph truth, not just object creation. The
  patch commit path now advances writer refs with `compareAndSwapRef()`,
  rereads the writer ref before returning success, throws
  `WRITER_COMMIT_NOT_VISIBLE` if the returned commit is not the visible writer
  tip, and has focused tests proving both ref visibility and materialized graph
  visibility.
- [x] 8. Add the same-writer concurrent patch race witness with final-frontier
  and visible-state assertions. The regression witness creates two stale
  builders for the same writer, commits them concurrently, proves exactly one
  wins, asserts the writer ref names the winning SHA, and verifies only the
  winning node is visible after materialization.
- [x] 9. Project git-warp receipt facts into the generated Continuum
  receipt-family shape with conformance tests. `ContinuumReceiptProjector` now
  maps `TickReceipt` into runtime-backed Continuum receipt-family `Receipt`
  facts, `ContinuumReceiptFamilyProjection` carries the receipt-family artifact
  descriptor and explicit evidence status, and non-receipt-family artifacts are
  rejected.
- [x] 10. Add the first `warp-ttd` smoke over generated-family git-warp receipt
  facts instead of handwritten adapter-local receipt folklore. The smoke starts
  from a real committed git-warp patch, materializes real `TickReceipt` output,
  loads the generated receipt-family fixture descriptor through the adapter
  seam, projects the receipt into `ContinuumReceiptFamilyProjection`, queries
  by head and frame for the `warp-ttd` target, and keeps evidence posture
  explicitly translated rather than native.
- [ ] 11. Re-plan with evidence in hand before expanding into reading-envelope,
  suffix/runtime-boundary, neighborhood-core, and settlement-family slices.

The loop stays strict: write or update the cycle doc, capture RED, green the
slice, update this BEARING task list before the final commit, validate, then
commit only the files touched in that slice.

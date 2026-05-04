# Bad-Code Release Triage

This note answers: when a bad-code card is paid down, which release
lane should absorb it?

The card-level `release_home` field is still the machine-readable
metadata. This document is the human triage layer to use before future
metadata cleanup passes.

## Current Metadata Snapshot

After the first metadata cleanup pass:

| Release Home | Count | Read |
|--------------|------:|------|
| `v17.0.0` | 187 | Current-engine cleanup bucket. Includes runtime-deletion fallout and stale-card rechecks. |
| `v18.0.0` | 12 | Graph-substrate cards promoted out of generic v17 cleanup. |
| `v19.0.0` | 11 | Observer/admission/runtime-doctrine cleanup. |
| `v20.0.0` | 15 | Slice-first read, index, traversal, and materialization-cost work. |
| `v21.0.0` | 7 | Strand, wormhole, conflict, and plural/distributed cleanup. |

There should be no remaining `release_home: v20.0.0+` values.

## Triage Rule

Use the release theme, not the filename prefix, as the slotting rule:

| Release | Bad-Code That Belongs Here |
|---------|----------------------------|
| `v17.0.0` | Current engine cleanup: TypeScript migration fallout, capability/API honesty, `WarpRuntime` deletion fallout, current sync/security hardening, current trie/checkpoint/index correctness, and test/doc debt that blocks the v17 package from being honest. |
| `v18.0.0` | Echo-shaped graph substrate convergence: node/edge record identity, attachment plane, typed payload model, graph-op algebra, graph-model migration, and replay equivalence from genesis. |
| `v19.0.0` | Observer/admission/doctrine convergence: audit/admission seams, observer-readable receipts, patch/session admission semantics, trust/admission boundary models, and doctrine cleanup that should not be mixed into graph-substrate migration. |
| `v20.0.0` | Slice-first runtime realization: bounded-support reads, streaming/page-shaped APIs, causal indexes, query/index cost surfaces, external-memory global operators, and materialization paths that must stop assuming whole-graph residency. |
| `v21.0.0` | Distributed observer geometry and admission reality: strand/braid/common-basis/local-site semantics, merge runtime nouns, witnessed admission, conflict witnesses, wormhole/plurality surfaces, and public noun cleanup for those later semantics. |

## `v17.0.0` Fit

The current `v17.0.0` bad-code population is mostly legitimate because
v17 is the cleanup release that makes the current engine packageable:

- `api-capabilities`
- `runtime-boundaries`
- `sync-trust-security`
- `testing-quality`
- `tooling-release`
- current `trie-state-storage`
- current `materialization-query-index`
- docs/DX debt needed for a credible v17 package

Cards pulled forward from `v20.0.0+` for recheck during the current
`WarpRuntime` death line:

- `CAST_callInternalRuntimeMethod-escape-hatch`
- `CAST_worldline-detached-double-cast`
- `OWN_detached-graph-option-drift`
- `OWN_warpruntime-delegation-dry`
- `PORT_worldline-encapsulation`

Why: these are not future merge/observer-geometry work. They are
symptoms of the old synchronous `WarpRuntime` center of gravity. If
`WarpRuntime` deletion removes the smell, graveyard them. If it does
not, keep them in v17 because they block the honest core/API boundary.

Other v17 recheck candidates:

- `OWN_dead-exports-182`: rerun static analysis before paying this down; the old count is likely stale.
- `OWN_exact-optional-conditional-spread`: only pay down after the current TypeScript surface stabilizes; some call sites may disappear as controllers and runtime shells move.
- `SPEC_test-helper-overlap`: recheck after the runtime-suite/helper migration line, because some overlap may already be gone.
- `SPEC_test-gods-30-over-800`: rerun file-size inventory before slicing; several test gods may already have been split.

## `v18.0.0` Fit

The first metadata pass promoted only graph-substrate bad-code into
`v18.0.0`. This should stay narrow.

Cards now pinned to v18 for the Echo-shaped graph substrate cycle:

- `CAST_warpstate-prop-unknown-value`: property value truth belongs with typed attachment/payload substrate decisions.
- `MODEL_neighbor-edge-typedef`: neighbor edge shape should line up with stable edge identity and edge-record nouns.
- `MODEL_patchdiff-no-validation`: diff entries are graph-change substrate forms, not just generic test debt.
- `MODEL_patchv2-no-validation`: patch/op validation must line up with the graph-op algebra.
- `MODEL_remove-nonexistent-entity-silent`: remove semantics belong with graph-op law, not adapter folklore.
- `CAST_reducer-silent-unknown-op-type`: unknown graph-op behavior belongs with graph-op algebra and replay honesty.
- `OWN_patchbuilder-12-param-constructor`: patch construction should be split along graph-op and persistence boundaries.
- `OWN_patchbuilder-churn-risk`: the high-churn patch builder is probably a symptom of graph-op and persistence concerns being fused.
- `MODEL_typedef-statediffresult-to-class`: graph/state diff results should become real runtime forms before diff APIs harden.
- `SPEC_state-diff-private-helper-residue`: helper residue should be settled when the graph substrate owns the diff contract.

Do not turn v18 into a generic "model cleanup" lane. If a card does
not touch graph records, attachments, graph ops, migration, or replay
equivalence, keep it out of v18.

## `v19.0.0` Fit

The existing `v19.0.0` observer/admission population is mostly right:

- `BND_patch-session-message-parsing`
- `HEX_btr-audit-ambient-timestamps`
- `HEX_wall-clock-eslint-suppressions`
- `MODEL_op-wire-pojo-class-duality`
- `OWN_join-reducer-import-time-strategy-validation-residue`
- `OWN_sorted-replacer-dry`
- `SPEC_audit-tests-vacuous-early-return`
- `SUB_p5-serialization-on-types`

Cards pulled into v19 because they fit observer/admission/trust
doctrine better than future merge/runtime work:

- `BND_schemas-refine-mutation`: trust/admission boundary validation should be pure and explicit.
- `HEX_warpserve-domain-infra-blur`: serving/admission orchestration needs an application seam rather than domain owning I/O shape.
- `OWN_trust-record-service-unreachable-exhausted-tails`: trust-record retry/admission tails should be proven or removed with the admission surface.

Card moved out of v19:

- `SUB_querybuilder-match-full-scan` belongs in `v20.0.0`; it is a
  slice-first/streaming/query-cost problem, not an admission-doctrine
  problem.

## `v20.0.0` Fit

v20 owns the operational cost model. A card belongs here when the smell
is "this read/index/materialization path assumes the whole relevant
world fits in memory" or when it blocks slice-first read execution.

Cards that fit v20 clearly:

- `SUB_querybuilder-match-full-scan`
- `SUB_toposort-full-adjacency`
- `OWN_logical-traversal-facade`
- `OWN_graph-traversal-monolith`
- `OWN_materialize-controller-god-object`
- `OWN_comparison-controller-shadow-selectors`
- `MODEL_frontier-typedef-to-class`
- `MODEL_crdt-constructor-validation`
- `MODEL_versionvector-constructor-no-validation`
- `SPEC_no-crdt-conflict-observability`
- `SUB_incremental-index-updater-null-proto-rewrap-dead-branch`
- `SUB_streaming-bitmap-index-builder-serialization-tail`

Moved to v20 after inspection:

- `SUB_bitmap-index-trio-coupling`: shared index format and
  streaming/index execution should settle with the v20 cost model.
- `OWN_materialized-view-service-verification`: index verification
  architecture belongs with the materialized-view/read substrate.
- `SPEC_dag-pathfinding-untested`: pathfinding is a global-operator
  correctness surface; v20 should decide the in-memory versus
  external-memory contract.

Important distinction:

- global-scope questions can belong to v20
- whole-graph in-memory materialization should not be treated as the
  unavoidable implementation

That is the same line drawn in
`docs/design/release-horizon-v20-v21.md`.

## `v21.0.0` Fit

v21 should stay focused on plural/distributed observer geometry, not
generic cleanup. A card belongs here when it directly concerns strand,
braid, wormhole, common-basis, merge/admission witnesses, or conflict
semantics that depend on the v20 slice-first runtime.

Cards that fit v21 clearly:

- `CAST_wormhole-service-defensive-tail-branches`
- `MODEL_strand-public-shape-identity`
- `MODEL_strand-typedef-corridor`
- `MODEL_wormhole-edge-typedef`
- `OWN_conflict-analyzer-dead-branches`
- `OWN_conflict-analyzer-god-object`
- `SPEC_untested-strand-services`

Kept in v17 for stale checks before any later split:

- `SPEC_test-helper-overlap`: move to v21 only if the remaining
  overlap is strand, braid, conflict, or wormhole fixture DSL overlap.
- `SPEC_test-gods-30-over-800`: split by owning release after the next
  file-size inventory; `StrandService`, `ConflictAnalyzerService`, and
  merge/plurality test gods likely belong in v21.

## Metadata Pass Result

The first metadata pass did this:

1. Split every `release_home: v20.0.0+` card into a concrete release
   or a recheck decision. The `+` bucket is no longer useful.
2. Moved `SUB_querybuilder-match-full-scan` from `v19.0.0` to
   `v20.0.0`.
3. Pulled the direct `WarpRuntime`/Worldline escape-hatch cards forward
   into v17 or graveyard them if the current runtime-deletion line
   already removed the smell.
4. Promoted only graph-substrate cards into v18. Do not move generic
   typedef cleanup there just because v18 has room.
5. Recomputed bad-code release counts from frontmatter and updated
   `bad-code/README.md`.

## Attack Vector

Do not burn the bad-code lane linearly.

Use feature/release overlap:

1. During the v17 burndown, pay down or graveyard bad-code cards that
   sit in the files already touched by the active v17 task.
2. At the v18 pull, move only the graph-substrate candidates listed
   above into the v18 lane and leave unrelated cleanup behind.
3. At the v19 pull, resolve admission/trust/audit cards as part of the
   observer/admission surface work.
4. At v20, treat every query/index/materialization card as a
   streaming/residency question first, not a local refactor first.
5. At v21, only pay down strand/merge/wormhole cards after the v20
   read substrate is real enough to avoid prematurely hardening bad
   nouns.

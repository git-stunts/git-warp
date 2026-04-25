# backlog workloads

This document partitions the entire live backlog into **MECE**
workloads that can be handed to agents as ownership units.

Counts in this document refer to live backlog notes only and exclude
backlog meta docs such as `README.md`, lane `README.md` files,
`SCORECARD.md`, and this `WORKLOADS.md` file itself.

The partition is built from the dependency bands in
[README.md](README.md):

- every live backlog note belongs to **exactly one** workload
- serial chains stay inside one workload when that is the cleaner
  ownership unit
- explicit `blocked_by` / `blocks` edges win over lane defaults
- workloads in the same wave are parallel candidates only when their
  `Preconditions` column is empty or already satisfied

If a workload is too large, refine it only after re-checking both the
dependency graph and likely write-surface overlap.

## Rules

1. One agent owns one workload at a time.
2. Do not split a workload mid-flight unless you also rewrite this
   partition.
3. If a note has an explicit `blocks` or `blocked_by` edge, that edge
   wins over lane inheritance.
4. If a note has no explicit edge, the lane band from
   [README.md](README.md) is its dependency posture.
5. A workload marked with a precondition is not ready to staff until
   that precondition is satisfied.

## Wave Summary

| Wave | Band | Workloads | Notes | Purpose |
|------|------|----------:|------:|---------|
| `0` | `B0` | 1 | 5 | Intake and triage |
| `1` | `B1` | 4 | 31 | Root backlog classification and maintenance |
| `2` | `B2` | 9 | 143 | Invariant debt paydown |
| `3.0` | `B3` | 7 | 32 | Ready-now v17 foundations and independent release hygiene |
| `3.1` | `B3` | 2 | 8 | Downstream v17 runtime split work |
| `3.x` parked | `B3` | 1 | 6 | Launch-prep proof and package tail |
| `4` | `B4` | 9 | 43 | v18 substrate cut plus current `up-next/` queue |
| `5` | `B5` | 3 | 11 | v19 observer/admission/runtime convergence |
| `6` | `B6` | 10 | 100 | v20/v21 horizon plus speculative orbit |
| Grand total | all | 46 | 379 | Full live backlog |

## Wave 0 — Intake

| Workload | Count | Selector | Agent surface | Preconditions |
|----------|------:|----------|---------------|---------------|
| `WL-00-inbox-triage` | 5 | `inbox/*.md` | Triage, classify, promote, or retire intake notes | none |

## Wave 1 — Root Backlog

| Workload | Count | Selector | Agent surface | Preconditions |
|----------|------:|----------|---------------|---------------|
| `WL-10-root-dx` | 21 | root `DX_*.md` | Docs, examples, guides, contributor experience | none |
| `WL-11-root-trust` | 5 | root `TRUST_*.md` | Trust schemas, fuzzing, and record validation | none |
| `WL-12-root-perf` | 2 | root `PERF_*.md` | Benchmark policy and out-of-core materialization | none |
| `WL-13-root-viz` | 3 | root `VIZ_*.md` | Mermaid and diagram validation | none |

## Wave 2 — `bad-code/`

These workloads are parallel by invariant and legacy filename family.
The canonical bad-code release-home triage lives in
[bad-code/RELEASE_TRIAGE.md](bad-code/RELEASE_TRIAGE.md).

| Workload | Count | Selector | Invariant owner | Preconditions |
|----------|------:|----------|-----------------|---------------|
| `WL-20-bad-hex` | 18 | `bad-code/HEX_*.md` | Hex boundary honesty | none |
| `WL-21-bad-bnd` | 7 | `bad-code/BND_*.md` | Boundary decode and validation honesty | none |
| `WL-22-bad-model` | 22 | `bad-code/MODEL_*.md` | Runtime-backed model honesty | none |
| `WL-23-bad-cast` | 9 | `bad-code/CAST_*.md` | No cast-cosplay or escape hatches | none |
| `WL-24-bad-port` | 11 | `bad-code/PORT_*.md` | Capability and port-surface honesty | none |
| `WL-25-bad-own` | 31 | `bad-code/OWN_*.md` | Ownership and cohesion | none |
| `WL-26-bad-sub` | 13 | `bad-code/SUB_*.md` | Substrate, streaming, and storage integrity | none |
| `WL-27-bad-spec` | 31 | `bad-code/SPEC_*.md` | Executable-spec honesty | none |
| `WL-28-bad-legacy-dx` | 1 | `bad-code/DX_*.md` | Legacy bad-code hygiene note with DX filename | none |

## Wave 3.0 — Ready-Now `v17.0.0`

These are current-release workloads that can move without waiting on the
runtime-kill closeout chain.

| Workload | Count | Items | Agent surface | Preconditions |
|----------|------:|-------|---------------|---------------|
| `WL-30-v17-provider-foundations` | 4 | `API_capability-interfaces`, `API_warpgraph-factory`, `API_warpgraph-runtime-bridge`, `CROSS_shared-provider-interfaces` | Provider interfaces, public factory, and runtime bridge seams | none |
| `WL-31-v17-cas-substrate-foundation` | 4 | `INFRA_unify-persistence-on-git-cas`, `INFRA_plumbing-violations`, `INFRA_substrate-upgrade-tool`, `INFRA_uniform-git-cas` | CAS, plumbing, and substrate migration | none |
| `WL-32-v17-purge-chain` | 4 | `PROTO_purge-cast-hacks`, `PROTO_purge-boundary-leaks`, `PROTO_purge-fake-models`, `PROTO_purge-import-law` | Anti-sludge purge chain; one owner, serial internal order | none |
| `WL-33-v17-ts-wave-sweep` | 9 | `TS_wave-01-codec`, `TS_wave-02-trust`, `TS_wave-03-dag-provenance`, `TS_wave-04-state-query`, `TS_wave-05-controllers`, `TS_wave-06-sync`, `TS_wave-07-index-small`, `TS_wave-08-strand-index-big`, `TS_wave-09-gods-and-monsters` | Wave-based TS migration sequence | none |
| `WL-34-v17-cli-mcp-shell` | 3 | `CLI_agent-native-output`, `CLI_missing-commands`, `MCP_warp-server` | CLI and MCP command surface | none |
| `WL-35-v17-docs-dx-sweep` | 6 | `DX_architecture-md-js-extensions`, `DX_conceptual-overview-query-pseudocode`, `DX_contributing-md-js-to-ts`, `DX_docs-readme-stale-paths`, `DX_package-json-description-alignment`, `DX_security-md-v17-api` | v17 docs, examples, and package-positioning cleanup | none |
| `WL-36-v17-state-stream-core` | 2 | `CORE_streaming-memory-audit`, `PROTO_orsetlike-contract` | Streaming memory audit and ORSet seam cleanup | none |

## Wave 3.1 — Downstream `v17.0.0`

These are still `B3`, but they depend on the provider or TS foundation
work above.

| Workload | Count | Items | Agent surface | Preconditions |
|----------|------:|-------|---------------|---------------|
| `WL-37-v17-god-to-api-runtime-split` | 6 | `GOD_query-builder`, `GOD_query-controller`, `GOD_materialize-controller`, `GOD_strand-service`, `API_migrate-consumers-to-capabilities`, `DX_warpapp-deprecation-warning` | God-object decomposition and final `WarpRuntime` kill chain | `WL-30`, `WL-33` |
| `WL-38-v17-host-bag-residue` | 2 | `SLUDGE_host-bag-injection`, `PORT_runtime-helper-wrapper-seams` | Host-bag and runtime-helper wrapper residue | `WL-30` |

## Wave 3.x — Parked `v17.0.0` Tail

This workload is MECE with the rest of `B3`, but it should stay parked
until the repo is otherwise essentially ready to launch `v17.0.0`.
These are launch-prep mechanics and proof surfaces, not active product
engineering trunks.

| Workload | Count | Items | Agent surface | Preconditions |
|----------|------:|-------|---------------|---------------|
| `WL-39-v17-launch-prep-tail` | 6 | `TS_publish-pipeline`, `TS_ssts-conformance-suite`, `INFRA_multipackage-publish-pipeline`, `INFRA_extract-warp-kernel-package-post-publish`, `INFRA_extract-warp-adapters-package-post-publish`, `INFRA_extract-warp-orset-package-post-publish` | Publish, declaration, and package-extraction tail | Repo otherwise ready to launch `v17.0.0` |

## Wave 4 — `B4`

This wave contains the next-major graph-substrate lane and the current
`up-next/` queue.

| Workload | Count | Items | Agent surface | Preconditions |
|----------|------:|-------|---------------|---------------|
| `WL-4A-v18-graph-substrate-convergence` | 8 | `PROTO_echo-shaped-node-records`, `PROTO_echo-shaped-edge-records`, `PROTO_attachment-plane-substrate`, `PROTO_graph-op-algebra-convergence`, `PROTO_content-attachment-plane-cutover`, `PROTO_legacy-props-as-projection`, `INFRA_graph-model-migration-tool`, `TRUST_genesis-replay-equivalence` | Echo-shaped graph model cut, migration tooling, and replay proof | v17 core release work complete |
| `WL-40-upnext-api-capability-contracts` | 4 | `DX_modular-type-declarations`, `DX_plumbing-to-gitplumbing-rename`, `PROTO_controller-capability-interfaces`, `PROTO_patch-commit-visibility-contract` | API capability and declaration-contract cleanup | none |
| `WL-41-upnext-runtime-boundaries` | 9 | `DX_max-file-size-policy`, `DX_trailer-codec-dts`, `NDNM_delete-vv-orset-shims`, `PROTO_cbor-op-hydration`, `PROTO_drop-v5-runtime-nouns`, `PROTO_op-consumer-instanceof-migration`, `PROTO_warpkernel-port-cleanup`, `PROTO_warpruntime-open-options-class`, `PROTO_wire-format-migration-edgepropset` | Runtime boundary cleanup and noun drift removal | none |
| `WL-42-upnext-streaming-read-chain` | 5 | `NDNM_defaultcodec-to-infrastructure`, `PERF_stream-read-migration`, `PERF_stream-cleanup`, `PERF_async-generator-traversal`, `PERF_stream-memory-tests` | Streaming read migration and memory witnesses | root `PERF_out-of-core-materialization` |
| `WL-43-upnext-merge-contracts` | 8 | `CC_conflict-pipeline-god-context`, `DX_merge-conflict-corpus`, `NDNM_worldline-class-rename`, `PROTO_merge-classifier`, `PROTO_same-writer-concurrent-patch-race`, `PROTO_ttd-merge-inspector`, `PROTO_WESLEY_lane-coordinate-capability-boundary`, `VIZ_cut-git-warp-visualization-surface-in-favor-of-warp-ttd` | Merge, conflict, worldline, and visualization contract cleanup | `PROTO_patch-commit-visibility-contract`; some items also wait on v21 noun work |
| `WL-44-upnext-observer-contracts` | 3 | `DX_observer-first-guide`, `NDNM_observer-full-structural`, `PROTO_tickpatch-tickreceipt-witness-ladder-audit` | Observer teaching, structural observer, and receipt ladder cleanup | relevant v19 observer docs/runtime seams |
| `WL-45-upnext-materialize-strategy` | 1 | `PROTO_materialize-strategy-decomposition` | Materialization strategy decomposition | none |
| `WL-46-upnext-trust-security` | 1 | `TRUST_sync-auth-ed25519` | Sync-auth cryptographic model upgrade | none |
| `WL-47-upnext-tooling-quality-tail` | 4 | `DX_agent-code-audit`, `DX_dependency-hygiene-audit`, `DX_npm-audit-fix-vite`, `DX_vision-readme-namespace-consistency` | Audit, dependency, and docs/tooling cleanup | none |

## Wave 5 — `B5`

This wave is `v19.0.0`: observer, admission, and doctrine convergence
after the graph-substrate cut.

| Workload | Count | Items | Agent surface | Preconditions |
|----------|------:|-------|---------------|---------------|
| `WL-5A-v19-doctrine-runtime-convergence` | 5 | `HYGIENE_warp-doctrine-runtime-alignment`, `API_observer-readable-receipts`, `PROTO_observer-plan-reading-envelopes`, `PROTO_witnessed-suffix-admission-shells`, `PROTO_live-holographic-strands` | Observer, admission, strand, and teaching-contract convergence | `v18.0.0` graph substrate convergence |
| `WL-5B-v19-support-slice-foundations` | 4 | `PROTO_bounded-support-rules-for-query-surfaces`, `PROTO_causal-indexes-for-sliced-queries`, `PROTO_support-scoped-fragment-materialization`, `PROTO_tick-range-graph-diff-api` | Bounded-support and causal-index design spine | `v18.0.0` graph substrate convergence |
| `WL-5C-v19-wesley-docs-seam` | 2 | `HYGIENE_docs-runtime-convergence-ratchet`, `PROTO_WESLEY_receipt-envelope-boundary` | Docs/runtime ratchet and receipt-envelope boundary | observer/runtime nouns stable enough to name |

## Wave 6 — `B6`

This wave contains the v20/v21 horizon lanes plus speculative work.
Nothing in `cool-ideas/` blocks committed release work until it is
promoted into a committed lane.

| Workload | Count | Selector / Items | Agent surface | Preconditions |
|----------|------:|------------------|---------------|---------------|
| `WL-6A-v20-slice-first-runtime` | 2 | `PROTO_playback-head-alignment`, `PROTO_strand-collapse-optic-for-causal-slicing` | Slice-first runtime realization and playback/read alignment | v19 read/runtime noun law |
| `WL-6B-v21-distributed-observer-geometry` | 4 | `PROTO_local-site-object-for-neighborhoods`, `PROTO_merge-runtime-noun-family`, `PROTO_strand-collapse-implementation`, `PROTO_wesley-merge-contracts` | Common-basis, braid, merge, and distributed observer geometry | v20 slice-first runtime substrate |
| `WL-60-cool-dx` | 43 | `cool-ideas/DX_*.md` | Developer-experience experiments | promotion decision |
| `WL-61-cool-idea` | 6 | `cool-ideas/IDEA_*.md` | General concept proposals | promotion decision |
| `WL-62-cool-infra` | 1 | `cool-ideas/INFRA_*.md` | Infrastructure speculation | promotion decision |
| `WL-63-cool-perf` | 8 | `cool-ideas/PERF_*.md` | Performance experiments | promotion decision |
| `WL-64-cool-proto` | 24 | `cool-ideas/PROTO_*.md` | Protocol and architecture experiments | promotion decision |
| `WL-65-cool-theory` | 1 | `cool-ideas/THEORY_*.md` | Theory and model notes | promotion decision |
| `WL-66-cool-trust` | 3 | `cool-ideas/TRUST_*.md` | Trust and witness experiments | promotion decision |
| `WL-67-cool-viz` | 8 | `cool-ideas/VIZ_*.md` | Visualization experiments | promotion decision |

## MECE Proof

The partition is exhaustive and non-overlapping:

- Wave `0`: `5`
- Wave `1`: `31`
- Wave `2`: `143`
- Wave `3.0`: `32`
- Wave `3.1`: `8`
- Wave `3.x`: `6`
- Wave `4`: `43`
- Wave `5`: `11`
- Wave `6`: `100`

Total:

- `5 + 31 + 143 + 32 + 8 + 6 + 43 + 11 + 100 = 379`

Every live backlog note is covered exactly once.

## Practical Assignment Order

If you want to staff agents immediately, start here:

1. Fill Wave `3.0` first if the goal is shipping `v17.0.0`.
2. Keep `WL-39-v17-launch-prep-tail` parked until the repo is
   otherwise essentially ready to launch `v17.0.0`.
3. Pull Wave `3.1` only after the named `v17` prerequisites are true.
4. Run Wave `2` in parallel when a release slice hits the same
   invariant family.
5. Use Wave `4` for `v18.0.0` planning or selective substrate prep
   without starving active `B3` work.
6. Keep Waves `5` and `6` parked unless deliberately working doctrine,
   horizon, or speculative follow-through.

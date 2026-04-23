# backlog workloads

This document partitions the entire live backlog into **MECE**
workloads that can be handed to agents as ownership units.

Counts in this document refer to live backlog notes only and exclude
backlog meta docs such as `README.md`, `SCORECARD.md`, and this
`WORKLOADS.md` file itself.

The partition is built from the dependency bands in
[README.md](README.md):

- workloads in the same wave form an antichain with respect to the
  **live** backlog graph
- any serial dependency chain that would break the antichain is kept
  **inside** one workload
- every live backlog note belongs to **exactly one** workload

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
5. A workload marked `external-check` needs a human or repo-truth check
   before assigning it, because one or more prerequisites are not live
   backlog notes.

## Wave Summary

| Wave | Band | Workloads | Notes | Purpose |
|------|------|----------:|------:|---------|
| `0` | `B0` | 1 | 5 | Intake and triage |
| `1` | `B1` | 4 | 31 | Root backlog classification and maintenance |
| `2` | `B2` | 8 | 139 | Invariant debt paydown |
| `3.0` | `B3` | 5 | 23 | Ready-now release foundations |
| `3.1` | `B3` | 3 | 23 | Downstream release workstreams |
| `4` | `B4` | 9 | 60 | Next-major substrate cut plus near-term queue |
| `5` | `B5` | 9 | 98 | Doctrine follow-through plus speculative orbit |
| Total | all | 39 | 379 | Subtotal before parked workloads |
| `3.x` parked | `B3` | 1 | 6 | Launch-prep proof and package tail |
| Grand total | all | 40 | 385 | Full live backlog |

## Wave 0 — Intake Antichain

| Workload | Count | Selector | Agent surface |
|----------|------:|----------|---------------|
| `WL-00-inbox-triage` | 5 | `docs/method/backlog/inbox/*.md` | Triage, classify, promote, or retire intake notes |

## Wave 1 — Root Backlog Antichain

| Workload | Count | Selector | Agent surface |
|----------|------:|----------|---------------|
| `WL-10-root-dx` | 21 | root `DX_*.md` | Docs, examples, guides, contributor experience |
| `WL-11-root-trust` | 5 | root `TRUST_*.md` | Trust schemas, fuzzing, and record validation |
| `WL-12-root-perf` | 2 | root `PERF_*.md` | Benchmark policy and out-of-core materialization |
| `WL-13-root-viz` | 3 | root `VIZ_*.md` | Mermaid and diagram validation |

## Wave 2 — `bad-code/` Antichain

These are parallel by invariant. Each workload is already canonical in
[bad-code/README.md](bad-code/README.md).

| Workload | Count | Selector | Invariant owner |
|----------|------:|----------|-----------------|
| `WL-20-bad-hex` | 17 | `bad-code/HEX_*.md` | Hex boundary honesty |
| `WL-21-bad-bnd` | 7 | `bad-code/BND_*.md` | Boundary decode and validation honesty |
| `WL-22-bad-model` | 22 | `bad-code/MODEL_*.md` | Runtime-backed model honesty |
| `WL-23-bad-cast` | 9 | `bad-code/CAST_*.md` | No cast-cosplay or escape hatches |
| `WL-24-bad-port` | 12 | `bad-code/PORT_*.md` | Capability and port-surface honesty |
| `WL-25-bad-own` | 31 | `bad-code/OWN_*.md` | Ownership and cohesion |
| `WL-26-bad-sub` | 10 | `bad-code/SUB_*.md` | Substrate, streaming, and storage integrity |
| `WL-27-bad-spec` | 31 | `bad-code/SPEC_*.md` | Executable-spec honesty |

## Wave 3.0 — Ready-Now `B3` Antichain

These are the current-delivery workloads that can be staffed in
parallel without crossing a **live** backlog edge.

| Workload | Count | Items | Agent surface |
|----------|------:|-------|---------------|
| `WL-30-v17-capability-provider-seams` | 2 | `API_capability-interfaces`, `CROSS_shared-provider-interfaces` | Provider interfaces, capability surfaces, shared runtime seams |
| `WL-31-v17-cas-substrate-foundation` | 5 | `INFRA_unify-persistence-on-git-cas`, `INFRA_plumbing-violations`, `INFRA_index-builder-on-git-cas`, `INFRA_substrate-upgrade-tool`, `INFRA_uniform-git-cas` | CAS, plumbing, substrate migration |
| `WL-32-v17-purge-chain` | 4 | `PROTO_purge-cast-hacks`, `PROTO_purge-boundary-leaks`, `PROTO_purge-fake-models`, `PROTO_purge-import-law` | Anti-sludge purge chain; one agent, serial internal order |
| `WL-34-v17-ts-wave-sweep` | 9 | `TS_wave-01-codec`, `TS_wave-02-trust`, `TS_wave-03-dag-provenance`, `TS_wave-04-state-query`, `TS_wave-05-controllers`, `TS_wave-06-sync`, `TS_wave-07-index-small`, `TS_wave-08-strand-index-big`, `TS_wave-09-gods-and-monsters` | Wave-based TS migration sequence |
| `WL-35-v17-hygiene-sludge-seed` | 3 | `HYGIENE_contamination-scanner-dynamic-imports`, `HYGIENE_type-import-and-template-expression-purge`, `SLUDGE_factory-functions-in-tests` | Cleanup and residue that do not wait on capability-provider work |

## Wave 3.1 — Downstream `B3` Antichain

These are still `B3`, but they sit behind wave `3.0` or need a live
dependency check before staffing.

| Workload | Count | Items | Preconditions |
|----------|------:|-------|---------------|
| `WL-36-v17-cross-residue-sludge` | 2 | `SLUDGE_host-bag-injection`, `SLUDGE_detached-graph-duplication` | Follows `WL-30-v17-capability-provider-seams` |
| `WL-37-v17-god-to-api-runtime-split` | 9 | `GOD_query-builder`, `GOD_query-controller`, `GOD_materialize-controller`, `GOD_strand-service`, `GOD_incremental-index-updater`, `GOD_remaining-big-files`, `API_warpgraph-factory`, `API_migrate-consumers-to-capabilities`, `API_kill-warpruntime` | Follows `WL-30`, `WL-33`, and `WL-34` |
| `WL-38-v17-shadow-trie-materialization-core` | 5 | `PROTO_orsetlike-contract`, `PROTO_shadow-trie-orset`, `PROTO_trie-compaction`, `PROTO_state-session-async`, `PROTO_gc-state-session` | Remaining shadow-trie engine and async-firewall follow-through after the checkpoint/snapshot unification cycle landed |

## Wave 3.x — Parked `B3` Tail

This workload is MECE with the rest of `B3`, but it should stay parked
until the repo is otherwise essentially ready to launch `v17.0.0`.
These are launch-prep mechanics and proof surfaces, not active product
engineering trunks.

| Workload | Count | Items | Preconditions |
|----------|------:|-------|---------------|
| `WL-39-v17-launch-prep-tail` | 6 | `TS_publish-pipeline`, `TS_ssts-conformance-suite`, `INFRA_multipackage-publish-pipeline`, `INFRA_extract-warp-kernel-package-post-publish`, `INFRA_extract-warp-adapters-package-post-publish`, `INFRA_extract-warp-orset-package-post-publish` | Launch-prep only. Keep parked until the repo is otherwise essentially ready to launch `v17.0.0`. Internal order follows `WL-33`, `WL-37`, and `WL-38`. |

## Wave 4 — `B4` Antichain

This wave now mixes the next-major graph-substrate lane with the
existing `up-next/` queue.

| Workload | Count | Items | Agent surface |
|----------|------:|-------|---------------|
| `WL-4A-v18-graph-substrate-convergence` | 8 | `PROTO_echo-shaped-node-records`, `PROTO_echo-shaped-edge-records`, `PROTO_attachment-plane-substrate`, `PROTO_graph-op-algebra-convergence`, `PROTO_content-attachment-plane-cutover`, `PROTO_legacy-props-as-projection`, `INFRA_graph-model-migration-tool`, `TRUST_genesis-replay-equivalence` | Echo-shaped graph model cut, migration tooling, and replay proof |
| `WL-40-upnext-execution-shells` | 3 | `CLI_agent-native-output`, `CLI_missing-commands`, `MCP_warp-server` | CLI and MCP surface; internal serial edge stays inside workload |
| `WL-41-upnext-dx-docs` | 17 | all `up-next/DX_*.md` | Documentation, review guidance, package metadata, audits |
| `WL-42-upnext-streaming-audit` | 5 | `CORE_streaming-memory-audit`, all `up-next/PERF_*.md` | Streaming memory, traversal, read cleanup |
| `WL-43-upnext-merge-observer-contracts` | 8 | `PROTO_WESLEY_lane-coordinate-capability-boundary`, `PROTO_WESLEY_receipt-envelope-boundary`, `PROTO_merge-classifier`, `PROTO_merge-runtime-noun-family`, `PROTO_tickpatch-tickreceipt-witness-ladder-audit`, `PROTO_ttd-merge-inspector`, `PROTO_wesley-merge-contracts`, `VIZ_cut-git-warp-visualization-surface-in-favor-of-warp-ttd` | Merge and observer contracts |
| `WL-44-upnext-runtime-boundaries` | 10 | `CC_conflict-pipeline-god-context`, `PROTO_cbor-op-hydration`, `PROTO_controller-capability-interfaces`, `PROTO_local-site-object-for-neighborhoods`, `PROTO_op-consumer-instanceof-migration`, `PROTO_patch-commit-visibility-contract`, `PROTO_playback-head-alignment`, `PROTO_warpkernel-port-cleanup`, `PROTO_warpruntime-open-options-class`, `PROTO_wire-format-migration-edgepropset` | Runtime boundary cleanup |
| `WL-45-upnext-strand-materialize` | 4 | `PROTO_materialize-strategy-decomposition`, `PROTO_same-writer-concurrent-patch-race`, `PROTO_strand-collapse-implementation`, `PROTO_strand-collapse-optic-for-causal-slicing` | Materialization and strand collapse |
| `WL-46-upnext-ndnm` | 4 | all `up-next/NDNM_*.md` | Legacy pattern removal |
| `WL-47-upnext-tail-edges` | 1 | `TRUST_sync-auth-ed25519` | Small tail task with isolated surface |

## Wave 5 — `B5` Antichain

This wave mixes deferred doctrine-parity work with the speculative
orbit.

| Workload | Count | Selector | Agent surface |
|----------|------:|----------|---------------|
| `WL-5A-v19-doctrine-runtime-convergence` | 5 | `v19.0.0/API_observer-readable-receipts.md`, `v19.0.0/HYGIENE_warp-doctrine-runtime-alignment.md`, `v19.0.0/PROTO_live-holographic-strands.md`, `v19.0.0/PROTO_observer-plan-reading-envelopes.md`, `v19.0.0/PROTO_witnessed-suffix-admission-shells.md` | Observer, admission, strand, and teaching-contract convergence after the substrate cut |
| `WL-50-cool-dx` | 43 | `cool-ideas/DX_*.md` | Developer-experience experiments |
| `WL-51-cool-idea` | 6 | `cool-ideas/IDEA_*.md` | General concept proposals |
| `WL-52-cool-infra` | 1 | `cool-ideas/INFRA_*.md` | Infrastructure speculation |
| `WL-53-cool-perf` | 8 | `cool-ideas/PERF_*.md` | Performance experiments |
| `WL-54-cool-proto` | 23 | `cool-ideas/PROTO_*.md` | Protocol and architecture experiments |
| `WL-55-cool-theory` | 1 | `cool-ideas/THEORY_*.md` | Theory and model notes |
| `WL-56-cool-trust` | 3 | `cool-ideas/TRUST_*.md` | Trust and witness experiments |
| `WL-57-cool-viz` | 8 | `cool-ideas/VIZ_*.md` | Visualization experiments |

## MECE Proof

The partition is exhaustive and non-overlapping:

- Wave `0`: `5`
- Wave `1`: `31`
- Wave `2`: `139`
- Wave `3.0`: `23`
- Wave `3.1`: `23`
- Wave `3.x`: `6`
- Wave `4`: `60`
- Wave `5`: `98`

Total:

- `5 + 31 + 139 + 23 + 23 + 6 + 60 + 98 = 385`

Every live backlog note is covered exactly once.

## Practical Assignment Order

If you want to staff agents immediately, start here:

1. Fill Wave `3.0` first if the goal is shipping `v17.0.0`.
2. Keep `WL-39-v17-launch-prep-tail` parked until the repo is
   otherwise essentially ready to launch `v17.0.0`.
3. Run Wave `2` in parallel when a release slice hits the same
   invariant.
4. Use Wave `4` for `v18.0.0` planning or selective substrate prep
   without starving active `B3` work.
5. Keep Wave `5` parked unless you are deliberately working doctrine
   or exploration follow-through.

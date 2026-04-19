# bad-code

Historical filename prefixes in this lane are legacy identities from earlier legend systems (`CC`, `PROTO`, `DX`, `TRUST`, and others). The canonical legend system for reading and filing `bad-code/` is invariant-based.

Existing filenames stay stable unless there is a strong reason to rename them. This README is the canonical grouping.

## Canonical Legends

| Code | Invariant | Count |
|------|-----------|------:|
| [HEX](../../legends/HEX.md) | No host, infrastructure, raw Git, ambient time, or ambient entropy leaks into core. | 17 |
| [BND](../../legends/BOUNDARY.md) | Decode, validate, and schema-check at the boundary; raw transport shapes do not leak inward. | 7 |
| [MODEL](../../legends/MODEL.md) | Runtime truth wins: real classes, constructor invariants, and honest domain forms. | 22 |
| [CAST](../../legends/CAST.md) | No cast-cosplay, escape hatches, or type lies. | 9 |
| [PORT](../../legends/PORT.md) | Capability and port surfaces must tell the runtime truth. | 12 |
| [OWN](../../legends/OWNERSHIP.md) | One owner per behavior: no gods, no duplication corridors, no mixed-concern facades. | 31 |
| [SUB](../../legends/SUBSTRATE.md) | Substrate integrity: streaming, CAS, checkpoint, index, and versioned storage stay explicit. | 10 |
| [SPEC](../../legends/SPEC.md) | Tests, docs, mocks, and coverage residue must reflect the real contract. | 31 |

## Index

### Hex Boundary (`HEX`) — 17

- [HEX_btr-audit-ambient-timestamps.md](HEX_btr-audit-ambient-timestamps.md)
- [HEX_domain-hex-defaults.md](HEX_domain-hex-defaults.md)
- [HEX_domain-utils-misplaced.md](HEX_domain-utils-misplaced.md)
- [HEX_index-rebuild-profiling-in-domain.md](HEX_index-rebuild-profiling-in-domain.md)
- [HEX_message-codec-hex.md](HEX_message-codec-hex.md)
- [HEX_sync-no-rate-limiting.md](HEX_sync-no-rate-limiting.md)
- [HEX_sync-secret-plain-string.md](HEX_sync-secret-plain-string.md)
- [HEX_sync-server-no-graceful-shutdown.md](HEX_sync-server-no-graceful-shutdown.md)
- [HEX_syncauth-ambient-entropy.md](HEX_syncauth-ambient-entropy.md)
- [HEX_wall-clock-eslint-suppressions.md](HEX_wall-clock-eslint-suppressions.md)
- [HEX_writerid-ambient-entropy.md](HEX_writerid-ambient-entropy.md)
- [HEX_cli-hook-installer-raw-git-bypass.md](HEX_cli-hook-installer-raw-git-bypass.md)
- [HEX_runtimehelpers-plumbing-composition-leak.md](HEX_runtimehelpers-plumbing-composition-leak.md)
- [HEX_scripts-raw-git-subprocess-policy-gap.md](HEX_scripts-raw-git-subprocess-policy-gap.md)
- [HEX_warpruntime-open-plumbing-composition-leak.md](HEX_warpruntime-open-plumbing-composition-leak.md)
- [HEX_warpserve-domain-infra-blur.md](HEX_warpserve-domain-infra-blur.md)
- [HEX_domain-crypto-hex.md](HEX_domain-crypto-hex.md)

### Boundary Decode (`BND`) — 7

- [BND_cbor-no-depth-limits.md](BND_cbor-no-depth-limits.md)
- [BND_checkpoint-deserialize-null-silent.md](BND_checkpoint-deserialize-null-silent.md)
- [BND_logger-bridge-no-validation.md](BND_logger-bridge-no-validation.md)
- [CC_patch-session-message-parsing.md](CC_patch-session-message-parsing.md)
- [DX_trailer-codec-type-poison.md](DX_trailer-codec-type-poison.md)
- [PROTO_http-request-typedef.md](PROTO_http-request-typedef.md)
- [TRUST_schemas-refine-mutation.md](TRUST_schemas-refine-mutation.md)

### Runtime Model (`MODEL`) — 22

- [CC_coordinate-fact-typedefs.md](CC_coordinate-fact-typedefs.md)
- [CC_crdt-constructor-validation.md](CC_crdt-constructor-validation.md)
- [CC_frontier-typedef-to-class.md](CC_frontier-typedef-to-class.md)
- [CC_gc-policy-typedef.md](CC_gc-policy-typedef.md)
- [CC_joinreducer-accepts-empty-remove.md](CC_joinreducer-accepts-empty-remove.md)
- [CC_lwwmax-null-return-awkward.md](CC_lwwmax-null-return-awkward.md)
- [CC_op-wire-pojo-class-duality.md](CC_op-wire-pojo-class-duality.md)
- [CC_patchdiff-no-validation.md](CC_patchdiff-no-validation.md)
- [CC_patchv2-no-validation.md](CC_patchv2-no-validation.md)
- [CC_remove-nonexistent-entity-silent.md](CC_remove-nonexistent-entity-silent.md)
- [CC_versionvector-constructor-no-validation.md](CC_versionvector-constructor-no-validation.md)
- [CC_wormhole-edge-typedef.md](CC_wormhole-edge-typedef.md)
- [DX_bun-deno-phantom-types.md](DX_bun-deno-phantom-types.md)
- [DX_strand-public-shape-identity.md](DX_strand-public-shape-identity.md)
- [DX_warp-types-eventid-dual.md](DX_warp-types-eventid-dual.md)
- [DX_writer-error-inverted-params.md](DX_writer-error-inverted-params.md)
- [IncrementalIndexUpdater-shape-sludge.md](IncrementalIndexUpdater-shape-sludge.md)
- [PROTO_neighbor-edge-typedef.md](PROTO_neighbor-edge-typedef.md)
- [PROTO_strand-typedef-corridor.md](PROTO_strand-typedef-corridor.md)
- [PROTO_typedef-statediffresult-to-class.md](PROTO_typedef-statediffresult-to-class.md)
- [TRUST_trust-assessment-typedef.md](TRUST_trust-assessment-typedef.md)
- [TRUST_trust-state-validation.md](TRUST_trust-state-validation.md)

### Cast Honesty (`CAST`) — 9

- [CC_call-internal-runtime-method.md](CC_call-internal-runtime-method.md)
- [CC_openWarpGraph-cast-cosplay.md](CC_openWarpGraph-cast-cosplay.md)
- [CC_reducer-silent-unknown-op-type.md](CC_reducer-silent-unknown-op-type.md)
- [CC_warpstate-prop-unknown-value.md](CC_warpstate-prop-unknown-value.md)
- [CC_worldline-detached-double-cast.md](CC_worldline-detached-double-cast.md)
- [PROTO_materialize-controller-seek-cache-error-opacity.md](PROTO_materialize-controller-seek-cache-error-opacity.md)
- [PROTO_roaring-loader-fallback-opacity.md](PROTO_roaring-loader-fallback-opacity.md)
- [PROTO_wormhole-service-defensive-tail-branches.md](PROTO_wormhole-service-defensive-tail-branches.md)
- [SSTS_callInternalRuntimeMethod-escape-hatch.md](SSTS_callInternalRuntimeMethod-escape-hatch.md)

### Capability Surface (`PORT`) — 12

- [CC_cbor-codec-triple-export.md](CC_cbor-codec-triple-export.md)
- [CC_git-adapter-encapsulation.md](CC_git-adapter-encapsulation.md)
- [CC_warpgraph-runtime-exposed.md](CC_warpgraph-runtime-exposed.md)
- [CC_worldline-encapsulation.md](CC_worldline-encapsulation.md)
- [DX_dual-export-pattern.md](DX_dual-export-pattern.md)
- [DX_wiredMethods-dts-signature-drift-risk.md](DX_wiredMethods-dts-signature-drift-risk.md)
- [PROTO_cli-persistence-plumbing-leak.md](PROTO_cli-persistence-plumbing-leak.md)
- [PROTO_commit-port-isp.md](PROTO_commit-port-isp.md)
- [PROTO_effect-sink-union-return.md](PROTO_effect-sink-union-return.md)
- [PROTO_graphpersistenceport-missing-configport.md](PROTO_graphpersistenceport-missing-configport.md)
- [PROTO_hookinstaller-ad-hoc-git-config-callback.md](PROTO_hookinstaller-ad-hoc-git-config-callback.md)
- [PROTO_persistence-port-instanceof.md](PROTO_persistence-port-instanceof.md)

### Ownership (`OWN`) — 31

- [CC_always-true-null-checks.md](CC_always-true-null-checks.md)
- [CC_bare-function-subscriber-type.md](CC_bare-function-subscriber-type.md)
- [CC_checkpoint-controller-mixed-concerns.md](CC_checkpoint-controller-mixed-concerns.md)
- [CC_comparison-controller-shadow-selectors.md](CC_comparison-controller-shadow-selectors.md)
- [CC_conflict-analyzer-god-object.md](CC_conflict-analyzer-god-object.md)
- [CC_dead-exports-182.md](CC_dead-exports-182.md)
- [CC_detached-graph-option-drift.md](CC_detached-graph-option-drift.md)
- [CC_duplicate-payload-too-large-error.md](CC_duplicate-payload-too-large-error.md)
- [CC_effect-pipeline-global-counter.md](CC_effect-pipeline-global-counter.md)
- [CC_graph-traversal-monolith.md](CC_graph-traversal-monolith.md)
- [CC_inmemory-adapter-global-state.md](CC_inmemory-adapter-global-state.md)
- [CC_joinreducer-coupling-hotspot.md](CC_joinreducer-coupling-hotspot.md)
- [CC_large-functions-48.md](CC_large-functions-48.md)
- [CC_logical-traversal-facade.md](CC_logical-traversal-facade.md)
- [CC_materialize-controller-god-object.md](CC_materialize-controller-god-object.md)
- [CC_materialized-view-service-verification.md](CC_materialized-view-service-verification.md)
- [CC_patchbuilder-churn-risk.md](CC_patchbuilder-churn-risk.md)
- [CC_query-controller-hasnode-p3-drift.md](CC_query-controller-hasnode-p3-drift.md)
- [CC_silent-catch-blocks-49.md](CC_silent-catch-blocks-49.md)
- [CC_warpruntime-delegation-boilerplate.md](CC_warpruntime-delegation-boilerplate.md)
- [DX_exact-optional-conditional-spread.md](DX_exact-optional-conditional-spread.md)
- [DX_materialize-requires-empty-options.md](DX_materialize-requires-empty-options.md)
- [DX_sorted-replacer-dry.md](DX_sorted-replacer-dry.md)
- [DX_warpruntime-delegation-dry.md](DX_warpruntime-delegation-dry.md)
- [INFRA_underused-ecosystem-packages.md](INFRA_underused-ecosystem-packages.md)
- [PROTO_conflict-analyzer-dead-branches.md](PROTO_conflict-analyzer-dead-branches.md)
- [PROTO_join-reducer-import-time-strategy-validation-residue.md](PROTO_join-reducer-import-time-strategy-validation-residue.md)
- [PROTO_patchbuilder-12-param-constructor.md](PROTO_patchbuilder-12-param-constructor.md)
- [PROTO_trust-record-service-unreachable-exhausted-tails.md](PROTO_trust-record-service-unreachable-exhausted-tails.md)
- [TRUST_trust-evaluator-coupling.md](TRUST_trust-evaluator-coupling.md)
- [TRUST_trust-record-service-smells.md](TRUST_trust-record-service-smells.md)

### Substrate (`SUB`) — 10

- [CC_bitmap-index-trio-coupling.md](CC_bitmap-index-trio-coupling.md)
- [CC_bitmap-reader-silent-corruption.md](CC_bitmap-reader-silent-corruption.md)
- [CC_cas-init-duplication.md](CC_cas-init-duplication.md)
- [CC_cbor-checkpoint-crdt-serialization.md](CC_cbor-checkpoint-crdt-serialization.md)
- [CC_p5-serialization-on-types.md](CC_p5-serialization-on-types.md)
- [PERF_toposort-full-adjacency.md](PERF_toposort-full-adjacency.md)
- [PROTO_bitmap-neighbor-provider-dead-false-branch.md](PROTO_bitmap-neighbor-provider-dead-false-branch.md)
- [PROTO_gc-stale-cache-invalidation.md](PROTO_gc-stale-cache-invalidation.md)
- [PROTO_incremental-index-updater-null-proto-rewrap-dead-branch.md](PROTO_incremental-index-updater-null-proto-rewrap-dead-branch.md)
- [PROTO_streaming-bitmap-index-builder-serialization-tail.md](PROTO_streaming-bitmap-index-builder-serialization-tail.md)

### Spec Honesty (`SPEC`) — 31

- [CC_audit-tests-vacuous-early-return.md](CC_audit-tests-vacuous-early-return.md)
- [CC_codec-module-untested.md](CC_codec-module-untested.md)
- [CC_dag-pathfinding-untested.md](CC_dag-pathfinding-untested.md)
- [CC_deno-adapter-tautology.md](CC_deno-adapter-tautology.md)
- [CC_eslint-relaxed-complexity-stale.md](CC_eslint-relaxed-complexity-stale.md)
- [CC_gc-tests-bless-silent-swallow.md](CC_gc-tests-bless-silent-swallow.md)
- [CC_http-port-test-misleading.md](CC_http-port-test-misleading.md)
- [CC_index-js-stale-jsdoc-example.md](CC_index-js-stale-jsdoc-example.md)
- [CC_index-rebuild-vacuous.md](CC_index-rebuild-vacuous.md)
- [CC_no-crdt-conflict-observability.md](CC_no-crdt-conflict-observability.md)
- [CC_patch-session-untested.md](CC_patch-session-untested.md)
- [CC_querybuilder-untested.md](CC_querybuilder-untested.md)
- [CC_readtreeoids-mock-returns-array.md](CC_readtreeoids-mock-returns-array.md)
- [CC_state-reader-untested.md](CC_state-reader-untested.md)
- [CC_sync-controller-over-mocked.md](CC_sync-controller-over-mocked.md)
- [CC_untested-controllers.md](CC_untested-controllers.md)
- [CC_untested-strand-services.md](CC_untested-strand-services.md)
- [CC_vacuous-assertions-pattern.md](CC_vacuous-assertions-pattern.md)
- [CC_visible-state-untested.md](CC_visible-state-untested.md)
- [DX_capability-interfaces-no-jsdoc.md](DX_capability-interfaces-no-jsdoc.md)
- [DX_claude-md-24-inaccuracies.md](DX_claude-md-24-inaccuracies.md)
- [DX_error-code-naming-inconsistency.md](DX_error-code-naming-inconsistency.md)
- [DX_index-dts-hand-maintained.md](DX_index-dts-hand-maintained.md)
- [DX_test-gods-30-over-800.md](DX_test-gods-30-over-800.md)
- [DX_test-helper-overlap.md](DX_test-helper-overlap.md)
- [DX_test-mock-persistence-incomplete.md](DX_test-mock-persistence-incomplete.md)
- [DX_undocumented-stream-architecture.md](DX_undocumented-stream-architecture.md)
- [DX_warpcore-jsdoc-block-style.md](DX_warpcore-jsdoc-block-style.md)
- [PROTO_inmemory-graph-adapter-default-hash-unavailable-branch.md](PROTO_inmemory-graph-adapter-default-hash-unavailable-branch.md)
- [PROTO_js-test-typecheck-drift.md](PROTO_js-test-typecheck-drift.md)
- [PROTO_state-diff-private-helper-residue.md](PROTO_state-diff-private-helper-residue.md)

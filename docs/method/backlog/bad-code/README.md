# bad-code

Historical filename prefixes in this lane are legacy identities from earlier legend systems (`CC`, `PROTO`, `DX`, `TRUST`, and others). The canonical legend system for reading and filing `bad-code/` is invariant-based.

Existing filenames stay stable unless there is a strong reason to rename them. This README is the canonical grouping.

## Canonical Legends

| Code | Invariant | Count |
|------|-----------|------:|
| [HEX](../../legends/HEX.md) | No host, infrastructure, raw Git, ambient time, or ambient entropy leaks into core. | 19 |
| [BND](../../legends/BOUNDARY.md) | Decode, validate, and schema-check at the boundary; raw transport shapes do not leak inward. | 8 |
| [MODEL](../../legends/MODEL.md) | Runtime truth wins: real classes, constructor invariants, and honest domain forms. | 22 |
| [CAST](../../legends/CAST.md) | No cast-cosplay, escape hatches, or type lies. | 9 |
| [PORT](../../legends/PORT.md) | Capability and port surfaces must tell the runtime truth. | 12 |
| [OWN](../../legends/OWNERSHIP.md) | One owner per behavior: no gods, no duplication corridors, no mixed-concern facades. | 32 |
| [SUB](../../legends/SUBSTRATE.md) | Substrate integrity: streaming, CAS, checkpoint, index, and versioned storage stay explicit. | 15 |
| [SPEC](../../legends/SPEC.md) | Tests, docs, mocks, and coverage residue must reflect the real contract. | 119 |

## Release Homes

`bad-code/` remains the debt ledger even when a note has an expected
release home. The note stays here so debt is still visibly debt;
`release_home` only answers which release should absorb, retire, or
otherwise burn it down.

Release-fit triage is tracked in
[RELEASE_TRIAGE.md](RELEASE_TRIAGE.md). Use that note before rewriting
card metadata or promoting bad-code into a release lane.

| Release Home | Count |
|--------------|------:|
| `v17.0.0` | 195 |
| `v18.0.0` | 13 |
| `v19.0.0` | 13 |
| `v20.0.0` | 15 |
| `v21.0.0` | 7 |

## Index

### Hex Boundary (`HEX`) — 19

- [HEX_btr-audit-ambient-timestamps.md](HEX_btr-audit-ambient-timestamps.md)
- [HEX_domain-hex-defaults.md](HEX_domain-hex-defaults.md)
- [HEX_domain-message-codec-wrapper-imports-infrastructure.md](HEX_domain-message-codec-wrapper-imports-infrastructure.md)
- [HEX_domain-utils-misplaced.md](HEX_domain-utils-misplaced.md)
- [HEX_index-rebuild-profiling-in-domain.md](HEX_index-rebuild-profiling-in-domain.md)
- [HEX_message-codec-hex.md](HEX_message-codec-hex.md)
- [HEX_sync-no-rate-limiting.md](HEX_sync-no-rate-limiting.md)
- [HEX_sync-response-paging-and-metrics.md](HEX_sync-response-paging-and-metrics.md)
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

### Boundary Decode (`BND`) — 8

- [BND_checkpoint-schema-contract-drift.md](BND_checkpoint-schema-contract-drift.md)
- [BND_cbor-no-depth-limits.md](BND_cbor-no-depth-limits.md)
- [BND_checkpoint-deserialize-null-silent.md](BND_checkpoint-deserialize-null-silent.md)
- [BND_logger-bridge-no-validation.md](BND_logger-bridge-no-validation.md)
- [BND_patch-session-message-parsing.md](BND_patch-session-message-parsing.md)
- [BND_trailer-codec-type-poison.md](BND_trailer-codec-type-poison.md)
- [BND_http-request-typedef.md](BND_http-request-typedef.md)
- [BND_schemas-refine-mutation.md](BND_schemas-refine-mutation.md)

### Runtime Model (`MODEL`) — 22

- [MODEL_coordinate-fact-typedefs.md](MODEL_coordinate-fact-typedefs.md)
- [MODEL_crdt-constructor-validation.md](MODEL_crdt-constructor-validation.md)
- [MODEL_frontier-typedef-to-class.md](MODEL_frontier-typedef-to-class.md)
- [MODEL_gc-policy-typedef.md](MODEL_gc-policy-typedef.md)
- [MODEL_joinreducer-accepts-empty-remove.md](MODEL_joinreducer-accepts-empty-remove.md)
- [MODEL_lwwmax-null-return-awkward.md](MODEL_lwwmax-null-return-awkward.md)
- [MODEL_op-wire-pojo-class-duality.md](MODEL_op-wire-pojo-class-duality.md)
- [MODEL_patchdiff-no-validation.md](MODEL_patchdiff-no-validation.md)
- [MODEL_patchv2-no-validation.md](MODEL_patchv2-no-validation.md)
- [MODEL_remove-nonexistent-entity-silent.md](MODEL_remove-nonexistent-entity-silent.md)
- [MODEL_versionvector-constructor-no-validation.md](MODEL_versionvector-constructor-no-validation.md)
- [MODEL_wormhole-edge-typedef.md](MODEL_wormhole-edge-typedef.md)
- [MODEL_bun-deno-phantom-types.md](MODEL_bun-deno-phantom-types.md)
- [MODEL_strand-public-shape-identity.md](MODEL_strand-public-shape-identity.md)
- [MODEL_warp-types-eventid-dual.md](MODEL_warp-types-eventid-dual.md)
- [MODEL_writer-error-inverted-params.md](MODEL_writer-error-inverted-params.md)
- [MODEL_incremental-index-updater-shape-sludge.md](MODEL_incremental-index-updater-shape-sludge.md)
- [MODEL_neighbor-edge-typedef.md](MODEL_neighbor-edge-typedef.md)
- [MODEL_strand-typedef-corridor.md](MODEL_strand-typedef-corridor.md)
- [MODEL_typedef-statediffresult-to-class.md](MODEL_typedef-statediffresult-to-class.md)
- [MODEL_trust-assessment-typedef.md](MODEL_trust-assessment-typedef.md)
- [MODEL_trust-state-validation.md](MODEL_trust-state-validation.md)

### Cast Honesty (`CAST`) — 9

- [CAST_call-internal-runtime-method.md](CAST_call-internal-runtime-method.md)
- [CAST_openWarpGraph-cast-cosplay.md](CAST_openWarpGraph-cast-cosplay.md)
- [CAST_reducer-silent-unknown-op-type.md](CAST_reducer-silent-unknown-op-type.md)
- [CAST_warpstate-prop-unknown-value.md](CAST_warpstate-prop-unknown-value.md)
- [CAST_worldline-detached-double-cast.md](CAST_worldline-detached-double-cast.md)
- [CAST_materialize-controller-seek-cache-error-opacity.md](CAST_materialize-controller-seek-cache-error-opacity.md)
- [CAST_roaring-loader-fallback-opacity.md](CAST_roaring-loader-fallback-opacity.md)
- [CAST_wormhole-service-defensive-tail-branches.md](CAST_wormhole-service-defensive-tail-branches.md)
- [CAST_callInternalRuntimeMethod-escape-hatch.md](CAST_callInternalRuntimeMethod-escape-hatch.md)

### Capability Surface (`PORT`) — 12

- [PORT_cbor-codec-triple-export.md](PORT_cbor-codec-triple-export.md)
- [PORT_git-adapter-encapsulation.md](PORT_git-adapter-encapsulation.md)
- [PORT_warpgraph-runtime-exposed.md](PORT_warpgraph-runtime-exposed.md)
- [PORT_worldline-encapsulation.md](PORT_worldline-encapsulation.md)
- [PORT_dual-export-pattern.md](PORT_dual-export-pattern.md)
- [PORT_cli-persistence-plumbing-leak.md](PORT_cli-persistence-plumbing-leak.md)
- [PORT_commit-port-isp.md](PORT_commit-port-isp.md)
- [PORT_effect-sink-union-return.md](PORT_effect-sink-union-return.md)
- [PORT_graphpersistenceport-missing-configport.md](PORT_graphpersistenceport-missing-configport.md)
- [PORT_hookinstaller-ad-hoc-git-config-callback.md](PORT_hookinstaller-ad-hoc-git-config-callback.md)
- [PORT_half-deleted-materialization-seam.md](PORT_half-deleted-materialization-seam.md)
- [PORT_persistence-port-instanceof.md](PORT_persistence-port-instanceof.md)

### Ownership (`OWN`) — 32

- [OWN_always-true-null-checks.md](OWN_always-true-null-checks.md)
- [OWN_bare-function-subscriber-type.md](OWN_bare-function-subscriber-type.md)
- [OWN_checkpoint-controller-mixed-concerns.md](OWN_checkpoint-controller-mixed-concerns.md)
- [OWN_comparison-controller-shadow-selectors.md](OWN_comparison-controller-shadow-selectors.md)
- [OWN_conflict-analyzer-god-object.md](OWN_conflict-analyzer-god-object.md)
- [OWN_dead-exports-182.md](OWN_dead-exports-182.md)
- [OWN_detached-graph-option-drift.md](OWN_detached-graph-option-drift.md)
- [OWN_duplicate-payload-too-large-error.md](OWN_duplicate-payload-too-large-error.md)
- [OWN_effect-pipeline-global-counter.md](OWN_effect-pipeline-global-counter.md)
- [OWN_graph-traversal-monolith.md](OWN_graph-traversal-monolith.md)
- [OWN_inmemory-adapter-global-state.md](OWN_inmemory-adapter-global-state.md)
- [OWN_joinreducer-coupling-hotspot.md](OWN_joinreducer-coupling-hotspot.md)
- [OWN_large-functions-48.md](OWN_large-functions-48.md)
- [OWN_logical-traversal-facade.md](OWN_logical-traversal-facade.md)
- [OWN_materialize-controller-god-object.md](OWN_materialize-controller-god-object.md)
- [OWN_materialized-view-service-verification.md](OWN_materialized-view-service-verification.md)
- [OWN_patchbuilder-churn-risk.md](OWN_patchbuilder-churn-risk.md)
- [OWN_query-controller-hasnode-p3-drift.md](OWN_query-controller-hasnode-p3-drift.md)
- [OWN_silent-catch-blocks-49.md](OWN_silent-catch-blocks-49.md)
- [OWN_warpruntime-delegation-boilerplate.md](OWN_warpruntime-delegation-boilerplate.md)
- [OWN_exact-optional-conditional-spread.md](OWN_exact-optional-conditional-spread.md)
- [OWN_materialize-requires-empty-options.md](OWN_materialize-requires-empty-options.md)
- [OWN_sorted-replacer-dry.md](OWN_sorted-replacer-dry.md)
- [OWN_runtimehost-500-loc-regression.md](OWN_runtimehost-500-loc-regression.md)
- [OWN_warpruntime-delegation-dry.md](OWN_warpruntime-delegation-dry.md)
- [OWN_underused-ecosystem-packages.md](OWN_underused-ecosystem-packages.md)
- [OWN_conflict-analyzer-dead-branches.md](OWN_conflict-analyzer-dead-branches.md)
- [OWN_join-reducer-import-time-strategy-validation-residue.md](OWN_join-reducer-import-time-strategy-validation-residue.md)
- [OWN_patchbuilder-12-param-constructor.md](OWN_patchbuilder-12-param-constructor.md)
- [OWN_trust-record-service-unreachable-exhausted-tails.md](OWN_trust-record-service-unreachable-exhausted-tails.md)
- [OWN_trust-evaluator-coupling.md](OWN_trust-evaluator-coupling.md)
- [OWN_trust-record-service-smells.md](OWN_trust-record-service-smells.md)

### Substrate (`SUB`) — 15

- [SUB_bitmap-index-trio-coupling.md](SUB_bitmap-index-trio-coupling.md)
- [SUB_bitmap-reader-silent-corruption.md](SUB_bitmap-reader-silent-corruption.md)
- [SUB_cas-init-duplication.md](SUB_cas-init-duplication.md)
- [SUB_cbor-checkpoint-crdt-serialization.md](SUB_cbor-checkpoint-crdt-serialization.md)
- [SUB_deno-runtime-smoke-timer-sanitizer.md](SUB_deno-runtime-smoke-timer-sanitizer.md)
- [SUB_p5-serialization-on-types.md](SUB_p5-serialization-on-types.md)
- [SUB_toposort-full-adjacency.md](SUB_toposort-full-adjacency.md)
- [SUB_bitmap-neighbor-provider-dead-false-branch.md](SUB_bitmap-neighbor-provider-dead-false-branch.md)
- [SUB_gc-stale-cache-invalidation.md](SUB_gc-stale-cache-invalidation.md)
- [SUB_incremental-index-updater-null-proto-rewrap-dead-branch.md](SUB_incremental-index-updater-null-proto-rewrap-dead-branch.md)
- [SUB_legacy-seek-cache-key-drops-frontier.md](SUB_legacy-seek-cache-key-drops-frontier.md)
- [SUB_querybuilder-match-full-scan.md](SUB_querybuilder-match-full-scan.md)
- [SUB_streaming-bitmap-index-builder-serialization-tail.md](SUB_streaming-bitmap-index-builder-serialization-tail.md)
- [SUB_trie-geometry-profile-contract-and-scale-gaps.md](SUB_trie-geometry-profile-contract-and-scale-gaps.md)

### Spec Honesty (`SPEC`) — 117

- [SPEC_audit-tests-vacuous-early-return.md](SPEC_audit-tests-vacuous-early-return.md)
- [SPEC_codec-module-untested.md](SPEC_codec-module-untested.md)
- [SPEC_consumer-typecheck-materialize-residue.md](SPEC_consumer-typecheck-materialize-residue.md)
- [SPEC_coverage-ratchet-baseline-drop.md](SPEC_coverage-ratchet-baseline-drop.md)
- [SPEC_dag-pathfinding-untested.md](SPEC_dag-pathfinding-untested.md)
- [SPEC_deno-adapter-tautology.md](SPEC_deno-adapter-tautology.md)
- [SPEC_eslint-relaxed-complexity-stale.md](SPEC_eslint-relaxed-complexity-stale.md)
- [SPEC_gc-tests-bless-silent-swallow.md](SPEC_gc-tests-bless-silent-swallow.md)
- [SPEC_http-port-test-misleading.md](SPEC_http-port-test-misleading.md)
- [SPEC_index-js-stale-jsdoc-example.md](SPEC_index-js-stale-jsdoc-example.md)
- [SPEC_index-rebuild-vacuous.md](SPEC_index-rebuild-vacuous.md)
- [SPEC_no-crdt-conflict-observability.md](SPEC_no-crdt-conflict-observability.md)
- [SPEC_patch-session-untested.md](SPEC_patch-session-untested.md)
- [SPEC_querybuilder-untested.md](SPEC_querybuilder-untested.md)
- [SPEC_readtreeoids-mock-returns-array.md](SPEC_readtreeoids-mock-returns-array.md)
- [SPEC_required-link-check-path-filter.md](SPEC_required-link-check-path-filter.md)
- [SPEC_state-reader-untested.md](SPEC_state-reader-untested.md)
- [SPEC_sync-controller-over-mocked.md](SPEC_sync-controller-over-mocked.md)
- [SPEC_untested-controllers.md](SPEC_untested-controllers.md)
- [SPEC_untested-strand-services.md](SPEC_untested-strand-services.md)
- [SPEC_vacuous-assertions-pattern.md](SPEC_vacuous-assertions-pattern.md)
- [SPEC_v17-release-self-review-blockers.md](SPEC_v17-release-self-review-blockers.md)
- [SPEC_visible-state-untested.md](SPEC_visible-state-untested.md)
- [SPEC_capability-interfaces-no-jsdoc.md](SPEC_capability-interfaces-no-jsdoc.md)
- [SPEC_claude-md-24-inaccuracies.md](SPEC_claude-md-24-inaccuracies.md)
- [SPEC_error-code-naming-inconsistency.md](SPEC_error-code-naming-inconsistency.md)
- [SPEC_index-dts-hand-maintained.md](SPEC_index-dts-hand-maintained.md)
- [SPEC_docs-materialize-frontdoor-drift.md](SPEC_docs-materialize-frontdoor-drift.md)
- [SPEC_test-gods-30-over-800.md](SPEC_test-gods-30-over-800.md)
- [SPEC_test-helper-overlap.md](SPEC_test-helper-overlap.md)
- [SPEC_test-mock-persistence-incomplete.md](SPEC_test-mock-persistence-incomplete.md)
- [SPEC_undocumented-stream-architecture.md](SPEC_undocumented-stream-architecture.md)
- [SPEC_warpcore-jsdoc-block-style.md](SPEC_warpcore-jsdoc-block-style.md)
- [SPEC_inmemory-graph-adapter-default-hash-unavailable-branch.md](SPEC_inmemory-graph-adapter-default-hash-unavailable-branch.md)
- [SPEC_js-test-typecheck-drift.md](SPEC_js-test-typecheck-drift.md)
- [SPEC_state-diff-private-helper-residue.md](SPEC_state-diff-private-helper-residue.md)
- [SPEC_static-text-test-sludge-architecture-doc-shape.md](SPEC_static-text-test-sludge-architecture-doc-shape.md)
- [SPEC_static-text-test-sludge-backlog-debt-release-home.md](SPEC_static-text-test-sludge-backlog-debt-release-home.md)
- [SPEC_static-text-test-sludge-backlog-feature-scope.md](SPEC_static-text-test-sludge-backlog-feature-scope.md)
- [SPEC_static-text-test-sludge-btr-provenance-boundary.md](SPEC_static-text-test-sludge-btr-provenance-boundary.md)
- [SPEC_static-text-test-sludge-btr-signing-bytes-ownership.md](SPEC_static-text-test-sludge-btr-signing-bytes-ownership.md)
- [SPEC_static-text-test-sludge-capability-consumer-migration-closeout.md](SPEC_static-text-test-sludge-capability-consumer-migration-closeout.md)
- [SPEC_static-text-test-sludge-capability-interfaces-closeout.md](SPEC_static-text-test-sludge-capability-interfaces-closeout.md)
- [SPEC_static-text-test-sludge-cast-quarantine-graduation.md](SPEC_static-text-test-sludge-cast-quarantine-graduation.md)
- [SPEC_static-text-test-sludge-changelog-config-extension-shape.md](SPEC_static-text-test-sludge-changelog-config-extension-shape.md)
- [SPEC_static-text-test-sludge-cli-guide-shape.md](SPEC_static-text-test-sludge-cli-guide-shape.md)
- [SPEC_static-text-test-sludge-comparison-live-coordinate-seam.md](SPEC_static-text-test-sludge-comparison-live-coordinate-seam.md)
- [SPEC_static-text-test-sludge-conflict-target-identity-fake-model-graduation.md](SPEC_static-text-test-sludge-conflict-target-identity-fake-model-graduation.md)
- [SPEC_static-text-test-sludge-contamination-dynamic-imports-shape.md](SPEC_static-text-test-sludge-contamination-dynamic-imports-shape.md)
- [SPEC_static-text-test-sludge-content-access-duplication-shape.md](SPEC_static-text-test-sludge-content-access-duplication-shape.md)
- [SPEC_static-text-test-sludge-dead-code-cleanup-shape.md](SPEC_static-text-test-sludge-dead-code-cleanup-shape.md)
- [SPEC_static-text-test-sludge-delete-warpruntime-class-split.md](SPEC_static-text-test-sludge-delete-warpruntime-class-split.md)
- [SPEC_static-text-test-sludge-documentation-corpus-shape.md](SPEC_static-text-test-sludge-documentation-corpus-shape.md)
- [SPEC_static-text-test-sludge-domain-purity.md](SPEC_static-text-test-sludge-domain-purity.md)
- [SPEC_static-text-test-sludge-factory-functions-in-tests-shape.md](SPEC_static-text-test-sludge-factory-functions-in-tests-shape.md)
- [SPEC_static-text-test-sludge-gitgraphadapter-git-cas-persistence.md](SPEC_static-text-test-sludge-gitgraphadapter-git-cas-persistence.md)
- [SPEC_static-text-test-sludge-glossary-shape.md](SPEC_static-text-test-sludge-glossary-shape.md)
- [SPEC_static-text-test-sludge-hook-installer.md](SPEC_static-text-test-sludge-hook-installer.md)
- [SPEC_static-text-test-sludge-hygiene-quarantine-graduation.md](SPEC_static-text-test-sludge-hygiene-quarantine-graduation.md)
- [SPEC_static-text-test-sludge-immutable-snapshot-builder.md](SPEC_static-text-test-sludge-immutable-snapshot-builder.md)
- [SPEC_static-text-test-sludge-incremental-index-updater-closeout-shape.md](SPEC_static-text-test-sludge-incremental-index-updater-closeout-shape.md)
- [SPEC_static-text-test-sludge-index-builder-on-git-cas-shape.md](SPEC_static-text-test-sludge-index-builder-on-git-cas-shape.md)
- [SPEC_static-text-test-sludge-internal-runtime-shim-closeout.md](SPEC_static-text-test-sludge-internal-runtime-shim-closeout.md)
- [SPEC_static-text-test-sludge-kill-warpruntime-split.md](SPEC_static-text-test-sludge-kill-warpruntime-split.md)
- [SPEC_static-text-test-sludge-markdownlint-config.md](SPEC_static-text-test-sludge-markdownlint-config.md)
- [SPEC_static-text-test-sludge-migrate-warpruntime-test-helper-split.md](SPEC_static-text-test-sludge-migrate-warpruntime-test-helper-split.md)
- [SPEC_static-text-test-sludge-non-ts-tail-shape.md](SPEC_static-text-test-sludge-non-ts-tail-shape.md)
- [SPEC_static-text-test-sludge-observer-capability-seam.md](SPEC_static-text-test-sludge-observer-capability-seam.md)
- [SPEC_static-text-test-sludge-observer-geometry-ladder-shape.md](SPEC_static-text-test-sludge-observer-geometry-ladder-shape.md)
- [SPEC_static-text-test-sludge-openwarpgraph-composition-root.md](SPEC_static-text-test-sludge-openwarpgraph-composition-root.md)
- [SPEC_static-text-test-sludge-openwarpruntime-bridge-closeout.md](SPEC_static-text-test-sludge-openwarpruntime-bridge-closeout.md)
- [SPEC_static-text-test-sludge-orsetlike-contract-closeout.md](SPEC_static-text-test-sludge-orsetlike-contract-closeout.md)
- [SPEC_static-text-test-sludge-patch-codec-tripwire.md](SPEC_static-text-test-sludge-patch-codec-tripwire.md)
- [SPEC_static-text-test-sludge-pre-push-hook.md](SPEC_static-text-test-sludge-pre-push-hook.md)
- [SPEC_static-text-test-sludge-public-api-advanced-guide-shape.md](SPEC_static-text-test-sludge-public-api-advanced-guide-shape.md)
- [SPEC_static-text-test-sludge-public-api-aperture-noun.md](SPEC_static-text-test-sludge-public-api-aperture-noun.md)
- [SPEC_static-text-test-sludge-public-api-cost-signaling.md](SPEC_static-text-test-sludge-public-api-cost-signaling.md)
- [SPEC_static-text-test-sludge-public-api-facade-split.md](SPEC_static-text-test-sludge-public-api-facade-split.md)
- [SPEC_static-text-test-sludge-public-api-getting-started-shape.md](SPEC_static-text-test-sludge-public-api-getting-started-shape.md)
- [SPEC_static-text-test-sludge-public-api-guide-shape.md](SPEC_static-text-test-sludge-public-api-guide-shape.md)
- [SPEC_static-text-test-sludge-public-api-observer-label.md](SPEC_static-text-test-sludge-public-api-observer-label.md)
- [SPEC_static-text-test-sludge-public-api-observer-noun.md](SPEC_static-text-test-sludge-public-api-observer-noun.md)
- [SPEC_static-text-test-sludge-public-api-readme-shape.md](SPEC_static-text-test-sludge-public-api-readme-shape.md)
- [SPEC_static-text-test-sludge-public-api-strand-noun.md](SPEC_static-text-test-sludge-public-api-strand-noun.md)
- [SPEC_static-text-test-sludge-query-builder-closeout.md](SPEC_static-text-test-sludge-query-builder-closeout.md)
- [SPEC_static-text-test-sludge-query-controller-capability-seam.md](SPEC_static-text-test-sludge-query-controller-capability-seam.md)
- [SPEC_static-text-test-sludge-query-read-model-seam.md](SPEC_static-text-test-sludge-query-read-model-seam.md)
- [SPEC_static-text-test-sludge-read-api-doc-consistency.md](SPEC_static-text-test-sludge-read-api-doc-consistency.md)
- [SPEC_static-text-test-sludge-release-policy-shape.md](SPEC_static-text-test-sludge-release-policy-shape.md)
- [SPEC_static-text-test-sludge-remaining-big-files-closeout-shape.md](SPEC_static-text-test-sludge-remaining-big-files-closeout-shape.md)
- [SPEC_static-text-test-sludge-runtime-controller-host-types.md](SPEC_static-text-test-sludge-runtime-controller-host-types.md)
- [SPEC_static-text-test-sludge-runtime-helper-wrapper-seams.md](SPEC_static-text-test-sludge-runtime-helper-wrapper-seams.md)
- [SPEC_static-text-test-sludge-runtime-host-product-seam.md](SPEC_static-text-test-sludge-runtime-host-product-seam.md)
- [SPEC_static-text-test-sludge-runtime-wiring-surface-closeout.md](SPEC_static-text-test-sludge-runtime-wiring-surface-closeout.md)
- [SPEC_static-text-test-sludge-sludge-atlas.md](SPEC_static-text-test-sludge-sludge-atlas.md)
- [SPEC_static-text-test-sludge-snapshot-prop-value-api-model.md](SPEC_static-text-test-sludge-snapshot-prop-value-api-model.md)
- [SPEC_static-text-test-sludge-streaming-memory-audit-closeout.md](SPEC_static-text-test-sludge-streaming-memory-audit-closeout.md)
- [SPEC_static-text-test-sludge-trie-store-port.md](SPEC_static-text-test-sludge-trie-store-port.md)
- [SPEC_static-text-test-sludge-type-import-hygiene-shape.md](SPEC_static-text-test-sludge-type-import-hygiene-shape.md)
- [SPEC_static-text-test-sludge-uniform-git-cas-closeout.md](SPEC_static-text-test-sludge-uniform-git-cas-closeout.md)
- [SPEC_standard-doc-discovery-gap.md](SPEC_standard-doc-discovery-gap.md)
- [SPEC_static-text-test-sludge-v17-checkpoint-tail-optic-read-basis.md](SPEC_static-text-test-sludge-v17-checkpoint-tail-optic-read-basis.md)
- [SPEC_static-text-test-sludge-v17-materialization-contract-docs.md](SPEC_static-text-test-sludge-v17-materialization-contract-docs.md)
- [SPEC_static-text-test-sludge-v17-migration-script-hygiene.md](SPEC_static-text-test-sludge-v17-migration-script-hygiene.md)
- [SPEC_static-text-test-sludge-v17-public-reading-surface.md](SPEC_static-text-test-sludge-v17-public-reading-surface.md)
- [SPEC_static-text-test-sludge-v17-worldline-reading-surface.md](SPEC_static-text-test-sludge-v17-worldline-reading-surface.md)
- [SPEC_uniform-git-cas-upgrade-contract-drift.md](SPEC_uniform-git-cas-upgrade-contract-drift.md)
- [SPEC_static-text-test-sludge-v7-guards.md](SPEC_static-text-test-sludge-v7-guards.md)
- [SPEC_static-text-test-sludge-warp-drift-crosslinks-shape.md](SPEC_static-text-test-sludge-warp-drift-crosslinks-shape.md)
- [SPEC_static-text-test-sludge-warp-drift-release-slotting-shape.md](SPEC_static-text-test-sludge-warp-drift-release-slotting-shape.md)
- [SPEC_static-text-test-sludge-warpapp-capability-bridge.md](SPEC_static-text-test-sludge-warpapp-capability-bridge.md)
- [SPEC_static-text-test-sludge-warpcore-runtime-bridge.md](SPEC_static-text-test-sludge-warpcore-runtime-bridge.md)
- [SPEC_static-text-test-sludge-warpgraph-capability-seam.md](SPEC_static-text-test-sludge-warpgraph-capability-seam.md)
- [SPEC_static-text-test-sludge-warpgraph-factory-closeout.md](SPEC_static-text-test-sludge-warpgraph-factory-closeout.md)
- [SPEC_static-text-test-sludge-warpgraph-runtime-bridge-closeout.md](SPEC_static-text-test-sludge-warpgraph-runtime-bridge-closeout.md)
- [SPEC_static-text-test-sludge-warpgraph-test-utils-structure.md](SPEC_static-text-test-sludge-warpgraph-test-utils-structure.md)
- [SPEC_static-text-test-sludge-warpruntime-helper-migration.md](SPEC_static-text-test-sludge-warpruntime-helper-migration.md)
- [SPEC_static-text-test-sludge-warpruntime-suite-migration.md](SPEC_static-text-test-sludge-warpruntime-suite-migration.md)
- [SPEC_static-text-test-sludge-worldline-detached-factory-seam.md](SPEC_static-text-test-sludge-worldline-detached-factory-seam.md)

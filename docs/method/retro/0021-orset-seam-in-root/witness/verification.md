---
title: "Verification Witness for Cycle 21"
---

# Verification Witness for Cycle 21

This witness proves that `Build the ORSet seam inside root (no code moves out of root)` now carries the required
behavior and adheres to the repo invariants.

## Test Results

```text

> @git-stunts/git-warp@17.0.0 test
> sh -c 'if [ "$GIT_STUNTS_DOCKER" = "1" ]; then vitest run test/unit "$@"; else docker compose run --build --rm test npm run test:local -- "$@"; fi' --

#1 [internal] load local bake definitions
#1 reading from stdin 528B done
#1 DONE 0.0s

#2 [internal] load build definition from Dockerfile.node22-slim
#2 transferring dockerfile: 872B done
#2 DONE 0.0s

#3 [auth] library/node:pull token for registry-1.docker.io
#3 DONE 0.0s

#4 [internal] load metadata for docker.io/library/node:22-slim
#4 DONE 0.8s

#5 [internal] load .dockerignore
#5 transferring context: 56B done
#5 DONE 0.0s

#6 [ 1/11] FROM docker.io/library/node:22-slim@sha256:f3a68cf41a855d227d1b0ab832bed9749469ef38cf4f58182fb8c893bc462383
#6 DONE 0.0s

#7 [internal] load build context
#7 transferring context: 3.34MB 1.8s done
#7 DONE 1.8s

#8 [ 2/11] RUN apt-get update && apt-get install -y     bats     git     python3     make     g++     && rm -rf /var/lib/apt/lists/*
#8 CACHED

#9 [ 3/11] WORKDIR /app
#9 CACHED

#10 [ 4/11] COPY git-warp/package*.json ./
#10 CACHED

#11 [ 5/11] COPY git-warp/scripts ./scripts
#11 CACHED

#12 [ 6/11] COPY git-warp/patches ./patches
#12 CACHED

#13 [ 7/11] RUN npm install
#13 CACHED

#14 [ 8/11] COPY git-warp .
#14 DONE 3.0s

#15 [ 9/11] RUN git init -q   && git config user.email "container@git-warp.local"   && git config user.name "Git Warp Container"   && git add -A   && git commit --allow-empty -m "seed git-warp" >/dev/null
#15 DONE 1.4s

#16 [10/11] RUN printf '%s\n' '#!/usr/bin/env bash' 'exec node /app/bin/warp-graph.js "$@"' > /usr/local/bin/warp-graph
#16 DONE 0.1s

#17 [11/11] RUN chmod +x /usr/local/bin/warp-graph   && install -m 0755 /app/bin/git-warp /usr/local/bin/git-warp
#17 DONE 0.2s

#18 exporting to image
#18 exporting layers
#18 exporting layers 1.4s done
#18 writing image sha256:aff14e3857010cc2287a59ef7bdb0f1099e9a8b8c6298a208a36e10908403dd2 done
#18 naming to docker.io/library/git-warp-test done
#18 DONE 1.4s

#19 resolving provenance for metadata file
#19 DONE 0.0s

> @git-stunts/git-warp@17.0.0 test:local
> vitest run test/unit


[1m[46m RUN [49m[22m [36mv4.1.2 [39m[90m/app[39m

 [32m✓[39m test/unit/domain/services/CommitDagTraversalService.test.ts [2m([22m[2m65 tests[22m[2m)[22m[32m 42[2mms[22m[39m
 [32m✓[39m test/unit/domain/services/AuditVerifierService.test.ts [2m([22m[2m62 tests[22m[2m)[22m[32m 106[2mms[22m[39m
 [32m✓[39m test/unit/domain/services/CheckpointService.test.ts [2m([22m[2m27 tests[22m[2m)[22m[32m 122[2mms[22m[39m
 [32m✓[39m test/unit/domain/services/controllers/PatchController.test.ts [2m([22m[2m66 tests[22m[2m)[22m[32m 146[2mms[22m[39m
 [32m✓[39m test/unit/domain/services/PatchBuilder.test.ts [2m([22m[2m71 tests[22m[2m)[22m[32m 59[2mms[22m[39m
 [32m✓[39m test/unit/domain/services/strand/StrandService.test.ts [2m([22m[2m164 tests[22m[2m)[22m[32m 147[2mms[22m[39m
 [32m✓[39m test/unit/domain/services/controllers/SyncController.test.ts [2m([22m[2m71 tests[22m[2m)[22m[32m 41[2mms[22m[39m
 [32m✓[39m test/unit/domain/services/MigrationService.test.ts [2m([22m[2m25 tests[22m[2m)[22m[32m 18[2mms[22m[39m
 [32m✓[39m test/unit/domain/services/JoinReducer.integration.test.ts [2m([22m[2m27 tests[22m[2m)[22m[32m 135[2mms[22m[39m
 [32m✓[39m test/unit/domain/services/strand/ConflictAnalyzerService.test.ts [2m([22m[2m78 tests[22m[2m)[22m[32m 93[2mms[22m[39m
 [32m✓[39m test/unit/domain/services/controllers/ComparisonController.test.ts [2m([22m[2m61 tests[22m[2m)[22m[32m 76[2mms[22m[39m
 [32m✓[39m test/unit/domain/services/GraphTraversal.test.ts [2m([22m[2m79 tests[22m[2m)[22m[32m 70[2mms[22m[39m
 [32m✓[39m test/unit/domain/services/controllers/MaterializeController.test.ts [2m([22m[2m59 tests[22m[2m)[22m[32m 43[2mms[22m[39m
 [32m✓[39m test/unit/domain/services/JoinReducer.test.ts [2m([22m[2m47 tests[22m[2m)[22m[32m 19[2mms[22m[39m
 [32m✓[39m test/unit/domain/services/SyncAuthService.test.ts [2m([22m[2m57 tests[22m[2m)[22m[32m 22[2mms[22m[39m
 [32m✓[39m test/unit/infrastructure/adapters/CasSeekCacheAdapter.test.ts [2m([22m[2m56 tests[22m[2m)[22m[32m 46[2mms[22m[39m
 [32m✓[39m test/unit/domain/services/SyncController.test.ts [2m([22m[2m40 tests[22m[2m)[22m[32m 28[2mms[22m[39m
 [32m✓[39m test/unit/domain/services/JoinReducer.edgeProps.test.ts [2m([22m[2m29 tests[22m[2m)[22m[32m 15[2mms[22m[39m
 [32m✓[39m test/unit/domain/services/CheckpointService.edgeCases.test.ts [2m([22m[2m25 tests[22m[2m)[22m[32m 32[2mms[22m[39m
 [32m✓[39m test/unit/domain/services/WormholeService.test.ts [2m([22m[2m27 tests[22m[2m)[22m[32m 42[2mms[22m[39m
 [32m✓[39m test/unit/domain/services/SyncProtocol.test.ts [2m([22m[2m32 tests[22m[2m)[22m[32m 30[2mms[22m[39m
 [32m✓[39m test/unit/specs/audit-receipt-vectors.test.ts [2m([22m[2m47 tests[22m[2m)[22m[32m 14[2mms[22m[39m
 [32m✓[39m test/unit/domain/services/PatchBuilder.content.test.ts [2m([22m[2m27 tests[22m[2m)[22m[32m 41[2mms[22m[39m
 [32m✓[39m test/unit/domain/services/IncrementalIndexUpdater.test.ts [2m([22m[2m24 tests[22m[2m)[22m[32m 35[2mms[22m[39m
 [32m✓[39m test/unit/domain/services/controllers/QueryController.test.ts [2m([22m[2m67 tests[22m[2m)[22m[32m 25[2mms[22m[39m
 [32m✓[39m test/unit/domain/services/ProvenancePayload.test.ts [2m([22m[2m50 tests[22m[2m)[22m[32m 26[2mms[22m[39m
 [32m✓[39m test/unit/domain/services/StateSerializer.test.ts [2m([22m[2m33 tests[22m[2m)[22m[32m 19[2mms[22m[39m
 [32m✓[39m test/unit/domain/services/controllers/SubscriptionController.test.ts [2m([22m[2m53 tests[22m[2m)[22m[32m 42[2mms[22m[39m
 [32m✓[39m test/unit/domain/WarpGraph.coverageGaps.test.ts [2m([22m[2m52 tests[22m[2m)[22m[32m 283[2mms[22m[39m
 [32m✓[39m test/unit/domain/warp/Writer.test.ts [2m([22m[2m35 tests[22m[2m)[22m[32m 43[2mms[22m[39m
 [32m✓[39m test/unit/domain/services/GitGraphAdapter.test.ts [2m([22m[2m62 tests[22m[2m)[22m[32m 156[2mms[22m[39m
 [32m✓[39m test/unit/domain/WarpGraph.strands.test.ts [2m([22m[2m26 tests[22m[2m)[22m[33m 532[2mms[22m[39m
 [32m✓[39m test/unit/domain/WarpGraph.test.ts [2m([22m[2m82 tests[22m[2m)[22m[33m 465[2mms[22m[39m
 [32m✓[39m test/unit/domain/services/WarpMessageCodec.test.ts [2m([22m[2m73 tests[22m[2m)[22m[32m 63[2mms[22m[39m
 [32m✓[39m test/unit/domain/WarpGraph.lazyMaterialize.test.ts [2m([22m[2m46 tests[22m[2m)[22m[32m 85[2mms[22m[39m
 [32m✓[39m test/unit/domain/crdt/ORSet.test.ts [2m([22m[2m49 tests[22m[2m)[22m[32m 44[2mms[22m[39m
 [32m✓[39m test/unit/domain/WarpGraph.materializeSlice.test.ts [2m([22m[2m13 tests[22m[2m)[22m[32m 161[2mms[22m[39m
 [32m✓[39m test/unit/domain/services/AuditReceiptService.test.ts [2m([22m[2m42 tests[22m[2m)[22m[32m 52[2mms[22m[39m
 [32m✓[39m test/unit/domain/utils/RefLayout.test.ts [2m([22m[2m69 tests[22m[2m)[22m[32m 34[2mms[22m[39m
 [32m✓[39m test/unit/domain/services/controllers/CheckpointController.test.ts [2m([22m[2m31 tests[22m[2m)[22m[32m 65[2mms[22m[39m
 [32m✓[39m test/unit/domain/services/JoinReducer.receipts.test.ts [2m([22m[2m31 tests[22m[2m)[22m[32m 22[2mms[22m[39m
 [32m✓[39m test/unit/domain/services/BoundaryTransitionRecord.test.ts [2m([22m[2m39 tests[22m[2m)[22m[32m 49[2mms[22m[39m
 [32m✓[39m test/unit/domain/services/BitmapIndexReader.test.ts [2m([22m[2m29 tests[22m[2m)[22m[32m 25[2mms[22m[39m
 [32m✓[39m test/unit/domain/services/TrustPayloadParity.test.ts [2m([22m[2m22 tests[22m[2m)[22m[32m 16[2mms[22m[39m
 [32m✓[39m test/unit/domain/services/Observer.test.ts [2m([22m[2m34 tests[22m[2m)[22m[32m 62[2mms[22m[39m
 [32m✓[39m test/unit/domain/services/StateDiff.test.ts [2m([22m[2m36 tests[22m[2m)[22m[32m 13[2mms[22m[39m
 [32m✓[39m test/unit/domain/services/TemporalQuery.test.ts [2m([22m[2m23 tests[22m[2m)[22m[32m 15[2mms[22m[39m
 [32m✓[39m test/unit/domain/services/JoinReducer.trackDiff.test.ts [2m([22m[2m21 tests[22m[2m)[22m[32m 20[2mms[22m[39m
 [32m✓[39m test/unit/domain/WarpGraph.patchesFor.test.ts [2m([22m[2m13 tests[22m[2m)[22m[33m 356[2mms[22m[39m
 [32m✓[39m test/unit/domain/WarpGraph.content.test.ts [2m([22m[2m29 tests[22m[2m)[22m[32m 121[2mms[22m[39m
 [32m✓[39m test/unit/domain/WarpGraph.traverse.test.ts [2m([22m[2m37 tests[22m[2m)[22m[32m 180[2mms[22m[39m
 [32m✓[39m test/unit/domain/WarpGraph.status.test.ts [2m([22m[2m25 tests[22m[2m)[22m[32m 147[2mms[22m[39m
 [32m✓[39m test/unit/domain/services/controllers/ForkController.test.ts [2m([22m[2m38 tests[22m[2m)[22m[32m 36[2mms[22m[39m
 [32m✓[39m test/unit/domain/types/ops/Op.test.ts [2m([22m[2m79 tests[22m[2m)[22m[32m 23[2mms[22m[39m
 [32m✓[39m test/unit/domain/services/CheckpointSerializer.test.ts [2m([22m[2m25 tests[22m[2m)[22m[32m 26[2mms[22m[39m
 [32m✓[39m test/unit/domain/WarpGraph.receipts.test.ts [2m([22m[2m19 tests[22m[2m)[22m[32m 84[2mms[22m[39m
 [32m✓[39m test/unit/infrastructure/adapters/CasBlobAdapter.test.ts [2m([22m[2m25 tests[22m[2m)[22m[32m 21[2mms[22m[39m
 [32m✓[39m test/unit/cli/commands/debug.test.ts [2m([22m[2m12 tests[22m[2m)[22m[32m 30[2mms[22m[39m
 [32m✓[39m test/unit/domain/services/controllers/ProvenanceController.test.ts [2m([22m[2m26 tests[22m[2m)[22m[32m 39[2mms[22m[39m
 [32m✓[39m test/unit/domain/WarpGraph.queryBuilder.compass.test.ts [2m([22m[2m31 tests[22m[2m)[22m[32m 65[2mms[22m[39m
 [32m✓[39m test/unit/domain/services/HttpSyncServer.auth.test.ts [2m([22m[2m20 tests[22m[2m)[22m[32m 28[2mms[22m[39m
 [32m✓[39m test/unit/domain/types/TickReceipt.test.ts [2m([22m[2m44 tests[22m[2m)[22m[32m 19[2mms[22m[39m
 [32m✓[39m test/unit/domain/services/TemporalQuery.checkpoint.test.ts [2m([22m[2m15 tests[22m[2m)[22m[32m 13[2mms[22m[39m
 [32m✓[39m test/unit/domain/services/LogicalIndexReader.test.ts [2m([22m[2m14 tests[22m[2m)[22m[32m 59[2mms[22m[39m
 [32m✓[39m test/unit/domain/WarpGraph.autoCheckpoint.test.ts [2m([22m[2m16 tests[22m[2m)[22m[32m 194[2mms[22m[39m
 [32m✓[39m test/unit/domain/services/StreamingBitmapIndexBuilder.test.ts [2m([22m[2m21 tests[22m[2m)[22m[32m 209[2mms[22m[39m
 [32m✓[39m test/unit/infrastructure/adapters/GitGraphAdapter.coverage.test.ts [2m([22m[2m76 tests[22m[2m)[22m[33m 1202[2mms[22m[39m
 [32m✓[39m test/unit/domain/services/JoinReducer.pathEquivalence.test.ts [2m([22m[2m15 tests[22m[2m)[22m[32m 26[2mms[22m[39m
 [32m✓[39m test/unit/domain/WarpGraph.fork.test.ts [2m([22m[2m20 tests[22m[2m)[22m[32m 50[2mms[22m[39m
 [32m✓[39m test/unit/infrastructure/adapters/DenoHttpAdapter.test.ts [2m([22m[2m27 tests[22m[2m)[22m[32m 152[2mms[22m[39m
 [32m✓[39m test/unit/domain/services/MaterializedView.equivalence.test.ts [2m([22m[2m42 tests[22m[2m)[22m[33m 511[2mms[22m[39m
 [32m✓[39m test/unit/infrastructure/adapters/BunHttpAdapter.test.ts [2m([22m[2m22 tests[22m[2m)[22m[32m 42[2mms[22m[39m
 [32m✓[39m test/unit/domain/WarpGraph.observerBoundary.test.ts [2m([22m[2m8 tests[22m[2m)[22m[32m 101[2mms[22m[39m
 [32m✓[39m test/unit/domain/stream/WarpStream.test.ts [2m([22m[2m42 tests[22m[2m)[22m[32m 15[2mms[22m[39m
 [32m✓[39m test/unit/domain/services/ProvenanceIndex.test.ts [2m([22m[2m45 tests[22m[2m)[22m[32m 45[2mms[22m[39m
 [32m✓[39m test/unit/domain/WarpApp.delegation.test.ts [2m([22m[2m36 tests[22m[2m)[22m[32m 38[2mms[22m[39m
 [32m✓[39m test/unit/domain/services/SchemaCompat.test.ts [2m([22m[2m34 tests[22m[2m)[22m[32m 12[2mms[22m[39m
 [32m✓[39m test/unit/domain/utils/cancellation.test.ts [2m([22m[2m30 tests[22m[2m)[22m[32m 208[2mms[22m[39m
 [32m✓[39m test/unit/domain/WarpGraph.queryBuilder.test.ts [2m([22m[2m22 tests[22m[2m)[22m[32m 68[2mms[22m[39m
 [32m✓[39m test/unit/domain/services/HookInstaller.test.ts [2m([22m[2m29 tests[22m[2m)[22m[32m 56[2mms[22m[39m
 [32m✓[39m test/unit/domain/seekCache.test.ts [2m([22m[2m18 tests[22m[2m)[22m[32m 174[2mms[22m[39m
 [32m✓[39m test/unit/domain/WarpGraph.watch.test.ts [2m([22m[2m45 tests[22m[2m)[22m[33m 4622[2mms[22m[39m
 [32m✓[39m test/unit/domain/services/GCPolicy.test.ts [2m([22m[2m19 tests[22m[2m)[22m[32m 27[2mms[22m[39m
 [32m✓[39m test/unit/domain/WarpGraph.seek.test.ts [2m([22m[2m15 tests[22m[2m)[22m[32m 211[2mms[22m[39m
 [32m✓[39m test/unit/domain/crdt/VersionVector.test.ts [2m([22m[2m43 tests[22m[2m)[22m[32m 16[2mms[22m[39m
 [32m✓[39m test/unit/domain/WarpGraph.worldline.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 118[2mms[22m[39m
 [32m✓[39m test/unit/domain/WarpGraph.errorCodes.test.ts [2m([22m[2m27 tests[22m[2m)[22m[32m 154[2mms[22m[39m
 [32m✓[39m test/unit/domain/properties/Join.property.test.ts [2m([22m[2m9 tests[22m[2m)[22m[33m 494[2mms[22m[39m
 [32m✓[39m test/unit/domain/utils/CachedValue.test.ts [2m([22m[2m29 tests[22m[2m)[22m[32m 13[2mms[22m[39m
 [32m✓[39m test/unit/domain/types/WorldlineSelector.test.ts [2m([22m[2m53 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m test/unit/cli/doctor.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 173[2mms[22m[39m
 [32m✓[39m test/unit/domain/services/EdgePropKey.test.ts [2m([22m[2m35 tests[22m[2m)[22m[33m 339[2mms[22m[39m
 [32m✓[39m test/unit/domain/services/SyncController.trustGate.test.ts [2m([22m[2m8 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m test/unit/infrastructure/adapters/CborPatchJournalAdapter.test.ts [2m([22m[2m14 tests[22m[2m)[22m[32m 33[2mms[22m[39m
 [32m✓[39m test/unit/domain/utils/EventId.test.ts [2m([22m[2m44 tests[22m[2m)[22m[32m 19[2mms[22m[39m
 [32m✓[39m test/unit/domain/utils/WriterId.test.ts [2m([22m[2m29 tests[22m[2m)[22m[32m 170[2mms[22m[39m
 [32m✓[39m test/unit/domain/trust/TrustStateBuilder.test.ts [2m([22m[2m18 tests[22m[2m)[22m[32m 13[2mms[22m[39m
 [32m✓[39m test/unit/domain/services/TranslationCost.test.ts [2m([22m[2m18 tests[22m[2m)[22m[32m 111[2mms[22m[39m
 [32m✓[39m test/unit/domain/services/SyncProtocol.stateCoherence.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 75[2mms[22m[39m
 [32m✓[39m test/unit/infrastructure/adapters/ConsoleLogger.test.ts [2m([22m[2m32 tests[22m[2m)[22m[32m 20[2mms[22m[39m
 [32m✓[39m test/unit/domain/services/HttpSyncServer.test.ts [2m([22m[2m24 tests[22m[2m)[22m[32m 21[2mms[22m[39m
 [32m✓[39m test/unit/domain/WarpGraph.subscribe.test.ts [2m([22m[2m30 tests[22m[2m)[22m[33m 4046[2mms[22m[39m
 [32m✓[39m test/unit/scripts/check-dts-surface.test.ts [2m([22m[2m42 tests[22m[2m)[22m[32m 14[2mms[22m[39m
 [32m✓[39m test/unit/infrastructure/adapters/InMemoryGraphAdapter.test.ts [2m([22m[2m57 tests[22m[2m)[22m[32m 23[2mms[22m[39m
 [32m✓[39m test/unit/infrastructure/CborIndexStoreAdapter.test.ts [2m([22m[2m15 tests[22m[2m)[22m[32m 20[2mms[22m[39m
 [32m✓[39m test/unit/infrastructure/adapters/CborCheckpointStoreAdapter.test.ts [2m([22m[2m12 tests[22m[2m)[22m[32m 21[2mms[22m[39m
 [32m✓[39m test/unit/domain/WarpGraph.query.test.ts [2m([22m[2m23 tests[22m[2m)[22m[32m 69[2mms[22m[39m
 [32m✓[39m test/unit/domain/crdt/LWW.test.ts [2m([22m[2m35 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m test/unit/infrastructure/codecs/CborCodec.test.ts [2m([22m[2m33 tests[22m[2m)[22m[32m 29[2mms[22m[39m
 [32m✓[39m test/unit/domain/services/Frontier.test.ts [2m([22m[2m26 tests[22m[2m)[22m[32m 13[2mms[22m[39m
 [32m✓[39m test/unit/domain/WarpGraph.conflicts.test.ts [2m([22m[2m8 tests[22m[2m)[22m[32m 93[2mms[22m[39m
 [32m✓[39m test/unit/domain/services/PatchBuilder.edgeProps.test.ts [2m([22m[2m15 tests[22m[2m)[22m[32m 13[2mms[22m[39m
 [32m✓[39m test/unit/domain/services/GraphTraversal.topoSort.test.ts [2m([22m[2m13 tests[22m[2m)[22m[32m 13[2mms[22m[39m
 [32m✓[39m test/unit/domain/utils/LRUCache.test.ts [2m([22m[2m31 tests[22m[2m)[22m[32m 14[2mms[22m[39m
 [32m✓[39m test/unit/domain/services/OpNormalizer.test.ts [2m([22m[2m23 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m test/unit/domain/services/HealthCheckService.test.ts [2m([22m[2m25 tests[22m[2m)[22m[32m 47[2mms[22m[39m
 [32m✓[39m test/unit/domain/WarpGraph.seekDiff.test.ts [2m([22m[2m9 tests[22m[2m)[22m[32m 89[2mms[22m[39m
 [32m✓[39m test/unit/domain/index.exports.test.ts [2m([22m[2m46 tests[22m[2m)[22m[32m 14[2mms[22m[39m
 [32m✓[39m test/unit/domain/WarpGraph.edgeProps.test.ts [2m([22m[2m13 tests[22m[2m)[22m[32m 34[2mms[22m[39m
 [32m✓[39m test/unit/domain/services/v3-compatibility.test.ts [2m([22m[2m34 tests[22m[2m)[22m[32m 14[2mms[22m[39m
 [32m✓[39m test/unit/domain/services/WarpMessageCodec.v3.test.ts [2m([22m[2m24 tests[22m[2m)[22m[32m 11[2mms[22m[39m
 [32m✓[39m test/unit/cli/schemas.test.ts [2m([22m[2m53 tests[22m[2m)[22m[32m 14[2mms[22m[39m
 [32m✓[39m test/unit/domain/services/JoinReducer.validation.test.ts [2m([22m[2m31 tests[22m[2m)[22m[32m 19[2mms[22m[39m
 [32m✓[39m test/unit/domain/services/WarpStateIndexBuilder.test.ts [2m([22m[2m13 tests[22m[2m)[22m[32m 78[2mms[22m[39m
 [32m✓[39m test/unit/domain/WarpGraph.deleteGuardEnforce.test.ts [2m([22m[2m13 tests[22m[2m)[22m[33m 1854[2mms[22m[39m
 [32m✓[39m test/unit/domain/services/IndexRebuildService.streaming.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 196[2mms[22m[39m
 [32m✓[39m test/unit/domain/services/GitLogParser.test.ts [2m([22m[2m29 tests[22m[2m)[22m[32m 26[2mms[22m[39m
 [32m✓[39m test/unit/domain/crdt/Dot.test.ts [2m([22m[2m36 tests[22m[2m)[22m[32m 12[2mms[22m[39m
 [32m✓[39m test/unit/domain/types/ops/reducer-integration.test.ts [2m([22m[2m11 tests[22m[2m)[22m[32m 14[2mms[22m[39m
 [32m✓[39m test/unit/domain/WarpGraph.cascadeDelete.test.ts [2m([22m[2m8 tests[22m[2m)[22m[33m 1432[2mms[22m[39m
 [32m✓[39m test/unit/infrastructure/adapters/GitGraphAdapter.commitNodeWithTree.test.ts [2m([22m[2m18 tests[22m[2m)[22m[32m 250[2mms[22m[39m
 [32m✓[39m test/unit/domain/types/ops/factory-integration.test.ts [2m([22m[2m15 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m test/unit/domain/WarpGraph.edgePropVisibility.test.ts [2m([22m[2m10 tests[22m[2m)[22m[32m 37[2mms[22m[39m
 [32m✓[39m test/unit/domain/services/MaterializedViewService.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 18[2mms[22m[39m
 [32m✓[39m test/unit/domain/services/PatchBuilder.cas.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 11[2mms[22m[39m
 [32m✓[39m test/unit/domain/WarpGraph.writerInvalidation.test.ts [2m([22m[2m10 tests[22m[2m)[22m[32m 62[2mms[22m[39m
 [32m✓[39m test/unit/domain/services/IndexStalenessChecker.test.ts [2m([22m[2m14 tests[22m[2m)[22m[32m 14[2mms[22m[39m
 [32m✓[39m test/unit/domain/WarpGraph.syncAuth.test.ts [2m([22m[2m8 tests[22m[2m)[22m[33m 347[2mms[22m[39m
 [32m✓[39m test/unit/domain/services/PropertyIndex.test.ts [2m([22m[2m9 tests[22m[2m)[22m[32m 14[2mms[22m[39m
 [32m✓[39m test/unit/domain/WarpGraph.encryption.test.ts [2m([22m[2m8 tests[22m[2m)[22m[32m 116[2mms[22m[39m
 [32m✓[39m test/unit/domain/services/EffectPipeline.test.ts [2m([22m[2m15 tests[22m[2m)[22m[32m 22[2mms[22m[39m
 [32m✓[39m test/unit/domain/WarpGraph.patchCount.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 55[2mms[22m[39m
 [32m✓[39m test/unit/domain/services/GraphTraversal.bfs.test.ts [2m([22m[2m19 tests[22m[2m)[22m[32m 11[2mms[22m[39m
 [32m✓[39m test/unit/domain/WarpCore.content.test.ts [2m([22m[2m17 tests[22m[2m)[22m[32m 25[2mms[22m[39m
 [32m✓[39m test/unit/domain/trust/TrustEvaluator.test.ts [2m([22m[2m11 tests[22m[2m)[22m[32m 26[2mms[22m[39m
 [32m✓[39m test/unit/infrastructure/requireCapabilities.test.ts [2m([22m[2m25 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m test/unit/domain/services/SyncPayloadSchema.test.ts [2m([22m[2m27 tests[22m[2m)[22m[32m 13[2mms[22m[39m
 [32m✓[39m test/unit/domain/types/conflict/ConflictAnchor.test.ts [2m([22m[2m25 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m test/unit/domain/services/VisibleStateTransferPlanner.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m test/unit/domain/services/GraphTraversal.transitiveClosure.test.ts [2m([22m[2m14 tests[22m[2m)[22m[32m 19[2mms[22m[39m
 [32m✓[39m test/unit/domain/utils/MinHeap.test.ts [2m([22m[2m22 tests[22m[2m)[22m[32m 25[2mms[22m[39m
 [32m✓[39m test/unit/domain/WarpGraph.noCoordination.test.ts [2m([22m[2m7 tests[22m[2m)[22m[33m 3787[2mms[22m[39m
     [33m[2m✓[22m[39m keeps writer refs linear after sync cycles [33m 491[2mms[22m[39m
     [33m[2m✓[22m[39m survives random sync/commit interleavings without merge commits [33m 1627[2mms[22m[39m
       [33m[2m✓[22m[39m cross-writer PropSet LWW: later writer override is not silently discarded [33m 976[2mms[22m[39m
 [32m✓[39m test/unit/domain/services/PatchHydrator.test.ts [2m([22m[2m16 tests[22m[2m)[22m[32m 12[2mms[22m[39m
 [32m✓[39m test/unit/domain/trust/TrustAdversarial.test.ts [2m([22m[2m8 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m test/unit/domain/properties/ORSet.property.test.ts [2m([22m[2m9 tests[22m[2m)[22m[32m 191[2mms[22m[39m
 [32m✓[39m test/unit/domain/services/SyncProtocol.divergence.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 13[2mms[22m[39m
 [32m✓[39m test/unit/domain/services/MaterializedViewService.verify.test.ts [2m([22m[2m8 tests[22m[2m)[22m[32m 26[2mms[22m[39m
 [32m✓[39m test/unit/domain/WarpRuntime.snapshotHashStability.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 89[2mms[22m[39m
 [32m✓[39m test/unit/domain/services/VisibleStateScope.test.ts [2m([22m[2m8 tests[22m[2m)[22m[32m 21[2mms[22m[39m
 [32m✓[39m test/unit/domain/services/BisectService.test.ts [2m([22m[2m9 tests[22m[2m)[22m[33m 2489[2mms[22m[39m
     [33m[2m✓[22m[39m vector 1: linear chain — finds first bad patch [33m 508[2mms[22m[39m
     [33m[2m✓[22m[39m vector 6: testFn receives candidate SHA [33m 684[2mms[22m[39m
     [33m[2m✓[22m[39m vector 7: all-bad — first candidate after good is the first bad patch [33m 354[2mms[22m[39m
 [32m✓[39m test/unit/domain/services/BitmapNeighborProvider.test.ts [2m([22m[2m18 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m test/unit/infrastructure/adapters/GitGraphAdapter.listRefs.test.ts [2m([22m[2m17 tests[22m[2m)[22m[32m 264[2mms[22m[39m
 [32m✓[39m test/unit/domain/WarpGraph.audit.test.ts [2m([22m[2m9 tests[22m[2m)[22m[32m 113[2mms[22m[39m
 [32m✓[39m test/unit/domain/services/LogicalIndexBuildService.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 26[2mms[22m[39m
 [32m✓[39m test/unit/domain/WarpGraph.frontierChanged.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 147[2mms[22m[39m
 [32m✓[39m test/unit/domain/types/conflict/ConflictTarget.test.ts [2m([22m[2m25 tests[22m[2m)[22m[32m 29[2mms[22m[39m
 [32m✓[39m test/unit/domain/services/GraphTraversal.transitiveReduction.test.ts [2m([22m[2m10 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m test/unit/domain/errors/WarpError.test.ts [2m([22m[2m47 tests[22m[2m)[22m[32m 25[2mms[22m[39m
 [32m✓[39m test/unit/domain/services/controllers/StrandController.test.ts [2m([22m[2m15 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m test/unit/domain/specCompliance.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m test/unit/domain/WarpCore.emit.test.ts [2m([22m[2m11 tests[22m[2m)[22m[32m 106[2mms[22m[39m
 [32m✓[39m test/unit/scripts/lint-markdown-code-samples.test.ts [2m([22m[2m14 tests[22m[2m)[22m[32m 25[2mms[22m[39m
 [32m✓[39m test/unit/domain/services/AdjacencyNeighborProvider.test.ts [2m([22m[2m12 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m test/unit/domain/services/logging.integration.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 13[2mms[22m[39m
 [32m✓[39m test/unit/domain/entities/GraphNode.test.ts [2m([22m[2m24 tests[22m[2m)[22m[32m 13[2mms[22m[39m
 [32m✓[39m test/unit/domain/services/LogicalIndexBuildService.determinism.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 17[2mms[22m[39m
 [32m✓[39m test/unit/domain/services/IndexRebuildService.test.ts [2m([22m[2m14 tests[22m[2m)[22m[32m 19[2mms[22m[39m
 [32m✓[39m test/unit/domain/services/SyncTrustGate.test.ts [2m([22m[2m12 tests[22m[2m)[22m[32m 11[2mms[22m[39m
 [32m✓[39m test/unit/domain/WarpGraph.invalidation.test.ts [2m([22m[2m11 tests[22m[2m)[22m[32m 53[2mms[22m[39m
 [32m✓[39m test/unit/domain/services/PatchBuilder.reservedBytes.test.ts [2m([22m[2m23 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m test/unit/infrastructure/adapters/InMemoryBlobStorageAdapter.test.ts [2m([22m[2m12 tests[22m[2m)[22m[32m 31[2mms[22m[39m
 [32m✓[39m test/unit/scripts/ratchet-telemetry.test.ts [2m([22m[2m12 tests[22m[2m)[22m[32m 39[2mms[22m[39m
 [32m✓[39m test/unit/domain/services/TreeConstruction.determinism.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 258[2mms[22m[39m
 [32m✓[39m test/unit/domain/warp/checkpoint.gc-isolation.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 18[2mms[22m[39m
 [32m✓[39m test/unit/scripts/pre-push-hook.test.ts [2m([22m[2m11 tests[22m[2m)[22m[32m 153[2mms[22m[39m
 [32m✓[39m test/unit/domain/services/GraphTraversal.crossProvider.test.ts [2m([22m[2m28 tests[22m[2m)[22m[32m 33[2mms[22m[39m
 [32m✓[39m test/unit/domain/services/JoinReducer.opSets.test.ts [2m([22m[2m15 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m test/unit/domain/types/EffectEmission.test.ts [2m([22m[2m15 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m test/unit/domain/utils/canonicalStringify.test.ts [2m([22m[2m26 tests[22m[2m)[22m[32m 11[2mms[22m[39m
 [32m✓[39m test/unit/domain/services/MultiplexSink.test.ts [2m([22m[2m11 tests[22m[2m)[22m[32m 38[2mms[22m[39m
 [32m✓[39m test/unit/domain/services/DagPathFinding.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 26[2mms[22m[39m
 [32m✓[39m test/unit/infrastructure/adapters/NodeHttpAdapter.error.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 109[2mms[22m[39m
 [32m✓[39m test/unit/infrastructure/adapters/httpAdapterUtils.test.ts [2m([22m[2m13 tests[22m[2m)[22m[32m 54[2mms[22m[39m
 [32m✓[39m test/unit/domain/types/DeliveryObservation.test.ts [2m([22m[2m14 tests[22m[2m)[22m[32m 14[2mms[22m[39m
 [32m✓[39m test/unit/domain/services/LogicalBitmapIndexBuilder.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m test/unit/domain/trust/TrustCrypto.test.ts [2m([22m[2m14 tests[22m[2m)[22m[32m 13[2mms[22m[39m
 [32m✓[39m test/unit/domain/types/PatchDiff.test.ts [2m([22m[2m9 tests[22m[2m)[22m[32m 13[2mms[22m[39m
 [32m✓[39m test/unit/domain/types/conflict/ConflictTrace.test.ts [2m([22m[2m15 tests[22m[2m)[22m[32m 15[2mms[22m[39m
 [32m✓[39m test/unit/domain/utils/streamUtils.test.ts [2m([22m[2m8 tests[22m[2m)[22m[32m 16[2mms[22m[39m
 [32m✓[39m test/unit/domain/utils/roaring.test.ts [2m([22m[2m9 tests[22m[2m)[22m[32m 42[2mms[22m[39m
 [32m✓[39m test/unit/domain/utils/bytes.test.ts [2m([22m[2m28 tests[22m[2m)[22m[32m 11[2mms[22m[39m
 [32m✓[39m test/unit/domain/WarpGraph.autoGC.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 74[2mms[22m[39m
 [31m❯[39m test/unit/scripts/documentation-corpus-shape.test.ts [2m([22m[2m5 tests[22m[2m | [22m[31m1 failed[39m[2m)[22m[32m 10[2mms[22m[39m
     [32m✓[39m exposes a docs index and links to it from the root README[32m 2[2mms[22m[39m
     [32m✓[39m keeps a maintainer-facing documentation guide for writing and information architecture[32m 0[2mms[22m[39m
     [32m✓[39m keeps an explicit archive index[32m 0[2mms[22m[39m
[31m     [31m×[31m moves obvious historical clutter out of top-level docs[39m[32m 5[2mms[22m[39m
     [32m✓[39m keeps superseded plans under docs/archive instead of the live docs surface[32m 0[2mms[22m[39m
 [32m✓[39m test/unit/domain/services/LogicalBitmapIndexBuilder.stability.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m test/unit/domain/artifacts/IndexShard.test.ts [2m([22m[2m12 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m test/unit/domain/trust/TrustCrypto.signVerify.test.ts [2m([22m[2m12 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m test/unit/domain/services/strand/ConflictAnalysisRequest.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 11[2mms[22m[39m
 [32m✓[39m test/unit/infrastructure/adapters/StreamPipeline.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 13[2mms[22m[39m
 [32m✓[39m test/unit/domain/types/conflict/validation.test.ts [2m([22m[2m25 tests[22m[2m)[22m[32m 12[2mms[22m[39m
 [32m✓[39m test/unit/domain/services/GraphTraversal.nodeWeight.test.ts [2m([22m[2m8 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m test/unit/domain/WarpCore.effectPipeline.test.ts [2m([22m[2m12 tests[22m[2m)[22m[32m 43[2mms[22m[39m
 [32m✓[39m test/unit/v7-guards.test.ts [2m([22m[2m16 tests[22m[2m)[22m[33m 989[2mms[22m[39m
       [33m[2m✓[22m[39m should export PatchBuilder (schema:2, renamed from PatchBuilderV2) [33m 982[2mms[22m[39m
 [32m✓[39m test/unit/ports/CryptoPort.test.ts [2m([22m[2m17 tests[22m[2m)[22m[32m 24[2mms[22m[39m
 [32m✓[39m test/unit/domain/services/BitmapIndexBuilder.frontier.test.ts [2m([22m[2m8 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m test/unit/domain/services/AuditReceiptService.coverage.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 15[2mms[22m[39m
 [32m✓[39m test/unit/domain/services/GraphTraversal.rootAncestors.test.ts [2m([22m[2m10 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m test/unit/cli/verify-index.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 23[2mms[22m[39m
 [32m✓[39m test/unit/boundary/patch-codec-tripwire.test.ts [2m([22m[2m99 tests[22m[2m)[22m[32m 17[2mms[22m[39m
 [32m✓[39m test/unit/security/protoPollution.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m test/unit/domain/WarpGraph.forkCryptoCodec.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 50[2mms[22m[39m
 [32m✓[39m test/unit/domain/stream/LogicalBitmapIndexBuilder.stream.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m test/unit/domain/trust/TrustAssessment.snapshot.test.ts [2m([22m[2m9 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m test/unit/cli/commands/strand.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m test/unit/domain/services/BitmapIndexBuilder.integrity.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 11[2mms[22m[39m
 [32m✓[39m test/unit/domain/services/SyncProtocol.wireGate.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m test/unit/domain/WarpGraph.patchMany.test.ts [2m([22m[2m6 tests[22m[2m)[22m[33m 906[2mms[22m[39m
 [32m✓[39m test/unit/ports/GraphPersistencePort.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m test/unit/scripts/public-api-strand-noun.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 4[2mms[22m[39m
 [32m✓[39m test/unit/domain/services/HttpSyncServer.authorize.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m test/unit/domain/warp/PatchSession.test.ts [2m([22m[2m8 tests[22m[2m)[22m[32m 13[2mms[22m[39m
 [32m✓[39m test/unit/cli/parseArgs.test.ts [2m([22m[2m25 tests[22m[2m)[22m[32m 27[2mms[22m[39m
 [32m✓[39m test/unit/domain/services/KeyCodec.test.ts [2m([22m[2m16 tests[22m[2m)[22m[32m 37[2mms[22m[39m
 [32m✓[39m test/unit/domain/services/strand/ConflictCandidate.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m test/unit/domain/trust/TrustEvaluator.crossMode.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m test/unit/domain/services/GraphTraversal.levels.test.ts [2m([22m[2m8 tests[22m[2m)[22m[32m 22[2mms[22m[39m
 [32m✓[39m test/unit/scripts/release-policy-shape.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 4[2mms[22m[39m
 [32m✓[39m test/unit/domain/WarpGraph.adjacencyCache.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 31[2mms[22m[39m
 [32m✓[39m test/unit/infrastructure/adapters/ChunkEffectSink.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 105[2mms[22m[39m
 [32m✓[39m test/unit/domain/WarpGraph.syncWith.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 106[2mms[22m[39m
 [32m✓[39m test/unit/domain/services/strand/OpRecord.test.ts [2m([22m[2m12 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m test/unit/infrastructure/adapters/NoOpLogger.test.ts [2m([22m[2m11 tests[22m[2m)[22m[32m 13[2mms[22m[39m
 [32m✓[39m test/unit/domain/trust/schemas.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m test/unit/domain/services/BitmapIndexBuilder.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m test/unit/domain/services/AuditMessageCodec.test.ts [2m([22m[2m8 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m test/unit/domain/services/IndexRebuildService.deep.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 295[2mms[22m[39m
 [32m✓[39m test/unit/domain/types/conflict/ConflictResolvedCoordinate.test.ts [2m([22m[2m8 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m test/unit/domain/artifacts/CheckpointArtifact.test.ts [2m([22m[2m9 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m test/unit/helpers/fixtureDsl.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 44[2mms[22m[39m
 [32m✓[39m test/unit/domain/trust/schemas.property.test.ts [2m([22m[2m1 test[22m[2m)[22m[32m 144[2mms[22m[39m
 [32m✓[39m test/unit/domain/trust/TrustCanonical.test.ts [2m([22m[2m10 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m test/unit/domain/types/conflict/ConflictResolution.test.ts [2m([22m[2m11 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m test/unit/domain/utils/defaultTrustCrypto.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m test/unit/infrastructure/adapters/LoggerObservabilityBridge.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m test/unit/domain/services/GitGraphAdapter.stress.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 13[2mms[22m[39m
 [32m✓[39m test/unit/domain/warp/readPatchBlob.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 19[2mms[22m[39m
 [32m✓[39m test/unit/domain/services/noBufferGlobal.test.ts [2m([22m[2m1 test[22m[2m)[22m[32m 16[2mms[22m[39m
 [32m✓[39m test/unit/domain/services/GraphTraversal.dijkstra.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 11[2mms[22m[39m
 [32m✓[39m test/unit/domain/types/conflict/ConflictAnalysis.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m test/unit/domain/utils/MinHeap.tieBreaker.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 4[2mms[22m[39m
 [32m✓[39m test/unit/cli/trust.exitcode.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m test/unit/domain/WarpGraph.checkpointPolicy.test.ts [2m([22m[2m9 tests[22m[2m)[22m[32m 70[2mms[22m[39m
 [32m✓[39m test/unit/domain/services/PatchBuilder.snapshot.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m test/unit/domain/types/conflict/ConflictParticipant.test.ts [2m([22m[2m9 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m test/unit/domain/WarpRuntime.blobAutoConstruct.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 48[2mms[22m[39m
 [32m✓[39m test/unit/scripts/public-api-guide-shape.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 15[2mms[22m[39m
 [32m✓[39m test/unit/domain/warp/hydrateCheckpointIndex.regression.test.ts [2m([22m[2m1 test[22m[2m)[22m[32m 14[2mms[22m[39m
 [32m✓[39m test/unit/scripts/read-api-doc-consistency.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m test/unit/domain/WarpGraph.syncMaterialize.test.ts [2m([22m[2m3 tests[22m[2m)[22m[33m 864[2mms[22m[39m
     [33m[2m✓[22m[39m syncWith(peer, { materialize: true }) returns fresh state in result [33m 338[2mms[22m[39m
     [33m[2m✓[22m[39m syncWith(peer) (default) does NOT auto-materialize — result has no state field [33m 339[2mms[22m[39m
 [32m✓[39m test/unit/domain/utils/defaultCrypto.test.ts [2m([22m[2m10 tests[22m[2m)[22m[32m 21[2mms[22m[39m
 [32m✓[39m test/unit/scripts/dx-script-hygiene.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 47[2mms[22m[39m
 [32m✓[39m test/unit/domain/types/ExternalizationPolicy.test.ts [2m([22m[2m8 tests[22m[2m)[22m[32m 4[2mms[22m[39m
 [32m✓[39m test/unit/domain/types/ops/validate.test.ts [2m([22m[2m10 tests[22m[2m)[22m[32m 17[2mms[22m[39m
 [32m✓[39m test/unit/domain/services/GraphTraversal.shortestPath.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 11[2mms[22m[39m
 [32m✓[39m test/unit/domain/services/GraphTraversal.astar.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m test/unit/domain/WarpGraph.autoMaterializeRemove.test.ts [2m([22m[2m3 tests[22m[2m)[22m[33m 806[2mms[22m[39m
     [33m[2m✓[22m[39m removeNode works without explicit materialize when autoMaterialize is true [33m 366[2mms[22m[39m
 [32m✓[39m test/unit/domain/services/state/StateHashService.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 19[2mms[22m[39m
 [32m✓[39m test/unit/domain/parseCursorBlob.test.ts [2m([22m[2m11 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m test/unit/domain/services/GraphTraversal.dfs.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m test/unit/domain/utils/shardKey.test.ts [2m([22m[2m8 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m test/unit/infrastructure/adapters/lazyCasInit.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 15[2mms[22m[39m
 [32m✓[39m test/unit/domain/WarpGraph.serve.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 158[2mms[22m[39m
 [32m✓[39m test/unit/domain/trust/canonical.freeze.test.ts [2m([22m[2m8 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m test/unit/domain/WarpApp.facade.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 85[2mms[22m[39m
 [32m✓[39m test/unit/domain/WarpGraph.autoMaterialize.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 37[2mms[22m[39m
 [32m✓[39m test/unit/scripts/public-api-getting-started-shape.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m test/unit/helpers/stateBuilder.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m test/unit/infrastructure/adapters/sha1sync.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 17[2mms[22m[39m
 [32m✓[39m test/unit/ports/RefPort.compareAndSwapRef.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m test/unit/infrastructure/adapters/ConsoleEffectSink.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m test/unit/domain/artifacts/PatchEntry.test.ts [2m([22m[2m8 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m test/unit/scripts/public-api-cost-signaling.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 3[2mms[22m[39m
 [32m✓[39m test/unit/scripts/public-api-advanced-guide-shape.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 4[2mms[22m[39m
 [32m✓[39m test/unit/domain/errors/WriterError.test.ts [2m([22m[2m10 tests[22m[2m)[22m[32m 226[2mms[22m[39m
 [32m✓[39m test/unit/scripts/public-api-readme-shape.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 4[2mms[22m[39m
 [32m✓[39m test/unit/ports/PatchJournalPort.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 3[2mms[22m[39m
 [32m✓[39m test/unit/domain/types/conflict/ConflictDiagnostic.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m test/unit/benchmark/detachedReadBenchmark.fixture.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 183[2mms[22m[39m
 [32m✓[39m test/unit/ports/HttpServerPort.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m test/unit/ports/CommitPort.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m test/unit/domain/utils/validateShardOid.test.ts [2m([22m[2m13 tests[22m[2m)[22m[32m 4[2mms[22m[39m
 [32m✓[39m test/unit/scripts/cli-guide-shape.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m test/unit/infrastructure/adapters/InMemoryGraphAdapter.browser.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 47[2mms[22m[39m
 [32m✓[39m test/unit/domain/WarpRuntime.apiSurface.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 11[2mms[22m[39m
 [32m✓[39m test/unit/domain/WarpGraph.deleteGuard.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 46[2mms[22m[39m
 [32m✓[39m test/unit/infrastructure/adapters/NoOpEffectSink.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 11[2mms[22m[39m
 [32m✓[39m test/unit/domain/utils/defaultCodec.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 19[2mms[22m[39m
 [32m✓[39m test/unit/scripts/public-api-aperture-noun.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 3[2mms[22m[39m
 [32m✓[39m test/unit/domain/warp/buildView.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 14[2mms[22m[39m
 [32m✓[39m test/unit/ports/CodecPort.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m test/unit/domain/trust/domainPurity.test.ts [2m([22m[2m41 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m test/unit/domain/types/WarpErrors.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m test/unit/scripts/ts-policy-check.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 3[2mms[22m[39m
[90mstdout[2m | check (/app/scripts/ts-policy-check.ts:221:15)
[22m[39mIRONCLAD M9 — ratchet: 0/0 wildcards (holding)

[90mstdout[2m | check (/app/scripts/ts-policy-check.ts:231:11)
[22m[39mIRONCLAD M9 — type policy gate passed.

 [32m✓[39m test/unit/domain/trust/canonical.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 12[2mms[22m[39m
 [32m✓[39m test/unit/ports/NeighborProviderPort.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m test/unit/domain/utils/callInternalRuntimeMethod.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m test/unit/domain/utils/defaultCrypto.unavailable.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 104[2mms[22m[39m
 [32m✓[39m test/unit/domain/WarpGraph.writerApi.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 29[2mms[22m[39m
 [32m✓[39m test/unit/domain/utils/defaultTrustCrypto.unavailable.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 35[2mms[22m[39m
 [32m✓[39m test/unit/domain/types/conflict/ConflictWinner.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m test/unit/ports/SeekCachePort.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 3[2mms[22m[39m
 [32m✓[39m test/unit/ports/IndexStorePort.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 3[2mms[22m[39m
 [32m✓[39m test/unit/cli/verify-audit-args.test.ts [2m([22m[2m10 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m test/unit/domain/errors/TrustError.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 3[2mms[22m[39m
 [32m✓[39m test/unit/domain/errors/ForkError.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m test/unit/domain/utils/matchGlob.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 55[2mms[22m[39m
 [32m✓[39m test/unit/scripts/architecture-doc-shape.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 3[2mms[22m[39m
 [32m✓[39m test/unit/ports/EffectSinkPort.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m test/unit/ports/CheckpointStorePort.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 3[2mms[22m[39m
 [32m✓[39m test/unit/ports/TreePort.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 3[2mms[22m[39m
 [32m✓[39m test/unit/ports/LoggerPort.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m test/unit/ports/BlobStoragePort.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m test/unit/scripts/public-api-observer-label.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 2[2mms[22m[39m
 [32m✓[39m test/unit/ports/RefPort.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 3[2mms[22m[39m
 [32m✓[39m test/unit/infrastructure/adapters/InMemoryGraphAdapter.integration.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 67[2mms[22m[39m
 [32m✓[39m test/unit/domain/trust/verdict.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 3[2mms[22m[39m
 [32m✓[39m test/unit/domain/utils/nullLogger.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 11[2mms[22m[39m
 [32m✓[39m test/unit/domain/utils/toBytes.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 4[2mms[22m[39m
 [32m✓[39m test/unit/domain/utils/canonicalStringify.property.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 89[2mms[22m[39m
 [32m✓[39m test/unit/scripts/cli-help-shape.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 3[2mms[22m[39m
 [32m✓[39m test/unit/ports/BlobPort.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 3[2mms[22m[39m
 [32m✓[39m test/unit/scripts/public-api-facade-split.test.ts [2m([22m[2m3 tests[22m[2m)[22m[33m 1063[2mms[22m[39m
     [33m[2m✓[22m[39m exports WarpApp as the default product-facing entrypoint [33m 1061[2mms[22m[39m
 [32m✓[39m test/unit/scripts/public-api-observer-noun.test.ts [2m([22m[2m2 tests[22m[2m)[22m[33m 998[2mms[22m[39m
     [33m[2m✓[22m[39m exports Observer as the public read-handle noun at runtime [33m 996[2mms[22m[39m
 [32m✓[39m test/unit/ports/ConfigPort.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 3[2mms[22m[39m
 [32m✓[39m test/unit/domain/errors/index.test.ts [2m([22m[2m1 test[22m[2m)[22m[32m 41[2mms[22m[39m
 [32m✓[39m test/unit/domain/utils/RefLayout.audit.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m test/unit/scripts/coverage-ratchet.test.ts [2m([22m[2m1 test[22m[2m)[22m[32m 3[2mms[22m[39m
 [32m✓[39m test/unit/scripts/markdownlint-config.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 3[2mms[22m[39m
 [32m✓[39m test/unit/domain/types/WarpPersistence.test.ts [2m([22m[2m1 test[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m test/unit/domain/types/WarpOptions.test.ts [2m([22m[2m1 test[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m test/unit/cli/trust.pin.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m test/unit/index.exports.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 2[2mms[22m[39m

[2m Test Files [22m [1m[31m1 failed[39m[22m[2m | [22m[1m[32m350 passed[39m[22m[90m (351)[39m
[2m      Tests [22m [1m[31m1 failed[39m[22m[2m | [22m[1m[32m6293 passed[39m[22m[90m (6294)[39m
[2m   Start at [22m 07:44:23
[2m   Duration [22m 26.48s[2m (transform 35.09s, setup 0ms, import 137.08s, tests 41.45s, environment 30ms)[22m

 Image git-warp-test Building 
 Image git-warp-test Built 
 Container git-warp-test-run-8753f1cb9871 Creating 
 Container git-warp-test-run-8753f1cb9871 Created 

[31m⎯⎯⎯⎯⎯⎯⎯[39m[1m[41m Failed Tests 1 [49m[22m[31m⎯⎯⎯⎯⎯⎯⎯[39m

[41m[1m FAIL [22m[49m test/unit/scripts/documentation-corpus-shape.test.ts[2m > [22mdocumentation corpus taxonomy[2m > [22mmoves obvious historical clutter out of top-level docs
[31m[1mAssertionError[22m: expected true to be false // Object.is equality[39m

[32m- Expected[39m
[31m+ Received[39m

[32m- false[39m
[31m+ true[39m

[36m [2m❯[22m test/unit/scripts/documentation-corpus-shape.test.ts:[2m82:39[22m[39m
    [90m 80|[39m     [34mexpect[39m([34mhasFile[39m([32m'docs/TRUST_MIGRATION.md'[39m))[33m.[39m[34mtoBe[39m([35mfalse[39m)[33m;[39m
    [90m 81|[39m     [34mexpect[39m([34mhasFile[39m([32m'docs/TRUST_OPERATOR_RUNBOOK.md'[39m))[33m.[39m[34mtoBe[39m([35mfalse[39m)[33m;[39m
    [90m 82|[39m     [34mexpect[39m([34mhasFile[39m([32m'docs/.DS_Store'[39m))[33m.[39m[34mtoBe[39m([35mfalse[39m)[33m;[39m
    [90m   |[39m                                       [31m^[39m
    [90m 83|[39m
    [90m 84|[39m     expect(hasFile('docs/archive/audits/HEX_AUDIT.convo.txt')).toBe(tr…

[31m[2m⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯[22m[39m



```

## Drift Results

```text
Playback-question drift found.
Scanned 1 active cycle, 2 playback questions, 0 test descriptions.
Search basis: exact normalized match in tests/**/*.test.* and tests/**/*.spec.* descriptions.

docs/design/0021-orset-seam-in-root/orset-seam-in-root.md
- Human: TBD
  No exact normalized test description match found.
- Agent: TBD
  No exact normalized test description match found.

```

## Manual Verification

- [x] Automated capture completed successfully.

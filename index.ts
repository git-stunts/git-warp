/**
 * @module
 *
 * Deterministic WARP graph over Git: graph-native storage, traversal,
 * and tooling. All graph state lives as Git commits pointing to the
 * well-known empty tree — invisible to normal Git workflows, but
 * inheriting content-addressing, cryptographic integrity, and
 * distributed replication.
 *
 * @example
 * ```ts
 * import GitPlumbing from "@git-stunts/plumbing";
 * import WarpApp from "@git-stunts/git-warp";
 * import { GitGraphAdapter } from "@git-stunts/git-warp";
 *
 * const plumbing = new GitPlumbing({ cwd: "." });
 * const persistence = new GitGraphAdapter({ plumbing });
 *
 * const app = await WarpApp.open({
 *   persistence,
 *   graphName: "myGraph",
 *   writerId: "writer-1",
 * });
 *
 * const patch = await app.createPatch();
 * patch.addNode("user:alice").setProperty("user:alice", "name", "Alice");
 * await patch.commit();
 * const worldline = app.worldline();
 * const node = await worldline.getNodeProps("user:alice");
 * ```
 */

import GitGraphAdapter from './src/infrastructure/adapters/GitGraphAdapter.ts';
import GraphNode from './src/domain/entities/GraphNode.ts';
import BitmapIndexBuilder from './src/domain/services/index/BitmapIndexBuilder.ts';
import BitmapIndexReader from './src/domain/services/index/BitmapIndexReader.ts';
import IndexRebuildService from './src/domain/services/index/IndexRebuildService.ts';
import HealthCheckService, { HealthStatus } from './src/domain/services/HealthCheckService.ts';
import CommitDagTraversalService from './src/domain/services/dag/CommitDagTraversalService.ts';
import GraphPersistencePort from './src/ports/GraphPersistencePort.ts';
import IndexStoragePort from './src/ports/IndexStoragePort.ts';
import LoggerPort from './src/ports/LoggerPort.ts';
import SeekCachePort from './src/ports/SeekCachePort.ts';
import InMemoryGraphAdapter from './src/infrastructure/adapters/InMemoryGraphAdapter.ts';
import NoOpLogger from './src/infrastructure/adapters/NoOpLogger.ts';
import ConsoleLogger, { LogLevel } from './src/infrastructure/adapters/ConsoleLogger.ts';
import {
  AuditError,
  ContinuumArtifactAuthorityError,
  EncryptionError,
  ForkError,
  IndexError,
  QueryError,
  PatchError,
  SchemaUnsupportedError,
  ShardLoadError,
  ShardCorruptionError,
  ShardValidationError,
  StorageError,
  TraversalError,
  OperationAbortedError,
  SyncError,
  StrandError,
  WormholeError,
} from './src/domain/errors/index.ts';
import WriterError from './src/domain/errors/WriterError.ts';
import BlobStoragePort from './src/ports/BlobStoragePort.ts';
import InMemoryBlobStorageAdapter from './src/domain/utils/defaultBlobStorage.ts';
import CryptoPort from './src/ports/CryptoPort.ts';
import HttpServerPort from './src/ports/HttpServerPort.ts';
import NodeCryptoAdapter from './src/infrastructure/adapters/NodeCryptoAdapter.ts';
import WebCryptoAdapter from './src/infrastructure/adapters/WebCryptoAdapter.ts';
import BunHttpAdapter from './src/infrastructure/adapters/BunHttpAdapter.ts';
import DenoHttpAdapter from './src/infrastructure/adapters/DenoHttpAdapter.ts';
import { checkAborted, createTimeoutSignal } from './src/domain/utils/cancellation.ts';

// Multi-writer graph support (WARP)
import WarpCore from './src/domain/WarpCore.ts';
import WarpApp from './src/domain/WarpApp.ts';
// V1 op factories — inlined after WarpTypes.ts deletion (deprecated, kept for backward compat)
function createNodeAdd(node: string): { type: 'NodeAdd'; node: string } {
  return { type: 'NodeAdd' as const, node };
}

function createNodeTombstone(node: string): { type: 'NodeTombstone'; node: string } {
  return { type: 'NodeTombstone' as const, node };
}

function createEdgeAdd(
  from: string,
  to: string,
  label: string,
): { type: 'EdgeAdd'; from: string; to: string; label: string } {
  return { type: 'EdgeAdd' as const, from, to, label };
}

function createEdgeTombstone(
  from: string,
  to: string,
  label: string,
): { type: 'EdgeTombstone'; from: string; to: string; label: string } {
  return { type: 'EdgeTombstone' as const, from, to, label };
}

type PropSetValue = { type: 'inline'; value: PropValue } | { type: 'blob'; oid: string };

function createPropSet(
  node: string,
  key: string,
  value: PropSetValue,
): { type: 'PropSet'; node: string; key: string; value: PropSetValue } {
  return { type: 'PropSet' as const, node, key, value };
}

function createInlineValue(value: PropValue): { type: 'inline'; value: PropValue } {
  return { type: 'inline' as const, value };
}

function createBlobValue(oid: string): { type: 'blob'; oid: string } {
  return { type: 'blob' as const, oid };
}
import QueryBuilder from './src/domain/services/query/QueryBuilder.ts';
import Observer from './src/domain/services/query/Observer.ts';
import Worldline from './src/domain/services/Worldline.ts';
import WorldlineSelector from './src/domain/types/WorldlineSelector.ts';
import LiveSelector from './src/domain/types/LiveSelector.ts';
import CoordinateSelector from './src/domain/types/CoordinateSelector.ts';
import StrandSelector from './src/domain/types/StrandSelector.ts';
import { computeTranslationCost } from './src/domain/services/TranslationCost.ts';
import {
  encodeEdgePropKey,
  decodeEdgePropKey,
  isEdgePropKey,
  CONTENT_PROPERTY_KEY,
} from './src/domain/services/KeyCodec.ts';
import {
  createTickReceipt,
  canonicalJson as tickReceiptCanonicalJson,
  OP_TYPES as TICK_RECEIPT_OP_TYPES,
  RESULT_TYPES as TICK_RECEIPT_RESULT_TYPES,
} from './src/domain/types/TickReceipt.ts';

// Provenance payload (HOLOGRAM)
import ProvenancePayload from './src/domain/services/provenance/ProvenancePayload.ts';

// Boundary Transition Records (HOLOGRAM)
import {
  createBTR,
  verifyBTR,
  replayBTR,
} from './src/application/provenance/BtrOperations.ts';
import { BTR } from './src/domain/services/provenance/BTR.ts';

// Wormhole compression (HOLOGRAM)
import {
  createWormhole,
  composeWormholes,
  replayWormhole,
  serializeWormhole,
  deserializeWormhole,
} from './src/domain/services/WormholeService.ts';

import BisectService from './src/domain/services/BisectService.ts';
import EffectSinkPort from './src/ports/EffectSinkPort.ts';
import { MultiplexSink } from './src/domain/services/MultiplexSink.ts';
import { EffectPipeline } from './src/domain/services/EffectPipeline.ts';
import {
  createEffectEmission,
  canonicalEmissionJson,
  DELIVERY_MODES,
  DELIVERY_OUTCOMES,
} from './src/domain/types/EffectEmission.ts';
import {
  createDeliveryObservation,
  canonicalObservationJson,
} from './src/domain/types/DeliveryObservation.ts';
import {
  createExternalizationPolicy,
  LIVE_LENS,
  REPLAY_LENS,
  INSPECT_LENS,
} from './src/domain/types/ExternalizationPolicy.ts';
import { NoOpEffectSink } from './src/infrastructure/adapters/NoOpEffectSink.ts';
import { ConsoleEffectSink } from './src/infrastructure/adapters/ConsoleEffectSink.ts';
import { ChunkEffectSink } from './src/infrastructure/adapters/ChunkEffectSink.ts';
import SyncSecret from './src/domain/services/sync/SyncSecret.ts';
import { openWarpGraph } from './src/domain/WarpGraph.ts';
import { PatchBuilder } from './src/domain/services/PatchBuilder.ts';
import { PatchSession } from './src/domain/warp/PatchSession.ts';
import { Writer } from './src/domain/warp/Writer.ts';
import { ProvenanceIndex } from './src/domain/services/provenance/ProvenanceIndex.ts';
import WarpStateIndexBuilder, { buildWarpStateIndex } from './src/domain/services/index/WarpStateIndexBuilder.ts';
import { computeStateHash, projectState } from './src/domain/services/state/StateSerializer.ts';
import { createStateReader } from './src/domain/services/state/StateReader.ts';
import { compareVisibleState } from './src/domain/services/comparison/VisibleStateComparison.ts';
import ImmutableBytes from './src/domain/services/snapshot/ImmutableBytes.ts';
import SnapshotORSet from './src/domain/services/snapshot/SnapshotORSet.ts';
import SnapshotVersionVector from './src/domain/services/snapshot/SnapshotVersionVector.ts';
import SnapshotWarpState from './src/domain/services/snapshot/SnapshotWarpState.ts';
import type { PropValue } from './src/domain/types/PropValue.ts';
import type { SnapshotPropValue } from './src/domain/services/snapshot/SnapshotPropValue.ts';
import type { SyncRateLimitConfig } from './src/domain/services/sync/SyncRateLimiter.ts';
import {
  normalizeVisibleStateScope,
  scopeMaterializedState,
} from './src/domain/services/VisibleStateScope.ts';
import {
  exportCoordinateComparisonFact,
  exportCoordinateTransferPlanFact,
} from './src/domain/services/CoordinateFactExport.ts';
import ContinuumArtifactAuthority from './src/domain/continuum/ContinuumArtifactAuthority.ts';
import ContinuumArtifactDescriptor from './src/domain/continuum/ContinuumArtifactDescriptor.ts';
import ContinuumArtifactIngestionPolicy from './src/domain/continuum/ContinuumArtifactIngestionPolicy.ts';
import ContinuumEvidenceClaim from './src/domain/continuum/ContinuumEvidenceClaim.ts';
import ContinuumEvidencePosture from './src/domain/continuum/ContinuumEvidencePosture.ts';
import ContinuumFamilyId from './src/domain/continuum/ContinuumFamilyId.ts';
import ContinuumGeneratedFamilyInventory from './src/domain/continuum/ContinuumGeneratedFamilyInventory.ts';
import ContinuumGeneratedFamilyInventoryEntry
  from './src/domain/continuum/ContinuumGeneratedFamilyInventoryEntry.ts';
import ContinuumGeneratedFamilyStatus from './src/domain/continuum/ContinuumGeneratedFamilyStatus.ts';
import ContinuumReceiptFamilyProjection from './src/domain/continuum/ContinuumReceiptFamilyProjection.ts';
import GitWarpTickPatchReplayCore from './src/domain/continuum/GitWarpTickPatchReplayCore.ts';
import GitWarpReadingEnvelopePayloadFact from './src/domain/continuum/GitWarpReadingEnvelopePayloadFact.ts';
import GitWarpReadingEnvelopeSourceFacts from './src/domain/continuum/GitWarpReadingEnvelopeSourceFacts.ts';
import GitWarpTickReceiptShell from './src/domain/continuum/GitWarpTickReceiptShell.ts';
import GitWarpTickReceiptWitnessCore from './src/domain/continuum/GitWarpTickReceiptWitnessCore.ts';
import GitWarpTickWitnessLadder from './src/domain/continuum/GitWarpTickWitnessLadder.ts';
import GitWarpWitnessedSuffixPatchFact from './src/domain/continuum/GitWarpWitnessedSuffixPatchFact.ts';
import GitWarpWitnessedSuffixSourceFacts from './src/domain/continuum/GitWarpWitnessedSuffixSourceFacts.ts';
import GitWarpReceiptSourceFacts from './src/domain/continuum/GitWarpReceiptSourceFacts.ts';
import createCurrentContinuumGeneratedFamilyInventory
  from './src/domain/continuum/createCurrentContinuumGeneratedFamilyInventory.ts';
import ContinuumArtifactJsonFileAdapter from './src/infrastructure/adapters/ContinuumArtifactJsonFileAdapter.ts';
import type { ContinuumArtifactAuthorityValue } from './src/domain/continuum/ContinuumArtifactAuthority.ts';
import type { ContinuumArtifactDescriptorFields } from './src/domain/continuum/ContinuumArtifactDescriptor.ts';
import type { ContinuumEvidenceClaimFields } from './src/domain/continuum/ContinuumEvidenceClaim.ts';
import type { ContinuumEvidencePostureValue } from './src/domain/continuum/ContinuumEvidencePosture.ts';
import type { ContinuumFamilyIdValue } from './src/domain/continuum/ContinuumFamilyId.ts';
import type {
  ContinuumGeneratedFamilyInventoryEntryFields,
} from './src/domain/continuum/ContinuumGeneratedFamilyInventoryEntry.ts';
import type {
  ContinuumGeneratedFamilyStatusValue,
} from './src/domain/continuum/ContinuumGeneratedFamilyStatus.ts';
import type {
  ContinuumDeliveryObservationFact,
  ContinuumReceiptFact,
  ContinuumReceiptFamilyProjectionFields,
  ContinuumReceiptOpFact,
  ContinuumReceiptWitnessFact,
} from './src/domain/continuum/ContinuumReceiptFamilyProjection.ts';
import type { GitWarpReceiptSourceFactsFields } from './src/domain/continuum/GitWarpReceiptSourceFacts.ts';
import type {
  GitWarpReadingEnvelopePayloadFactFields,
} from './src/domain/continuum/GitWarpReadingEnvelopePayloadFact.ts';
import type {
  GitWarpReadingEnvelopeSourceFactsFields,
} from './src/domain/continuum/GitWarpReadingEnvelopeSourceFacts.ts';
import type {
  GitWarpTickPatchReplayCoreFields,
} from './src/domain/continuum/GitWarpTickPatchReplayCore.ts';
import type {
  GitWarpTickReceiptShellFields,
} from './src/domain/continuum/GitWarpTickReceiptShell.ts';
import type {
  GitWarpTickReceiptWitnessCoreFields,
} from './src/domain/continuum/GitWarpTickReceiptWitnessCore.ts';
import type {
  GitWarpTickWitnessLadderFields,
} from './src/domain/continuum/GitWarpTickWitnessLadder.ts';
import type {
  GitWarpWitnessedSuffixPatchFactFields,
} from './src/domain/continuum/GitWarpWitnessedSuffixPatchFact.ts';
import type {
  GitWarpWitnessedSuffixSourceFactsFields,
} from './src/domain/continuum/GitWarpWitnessedSuffixSourceFacts.ts';
import type { ContinuumArtifactJsonLoadContext } from './src/infrastructure/adapters/ContinuumArtifactJsonFileAdapter.ts';

export {
  GitGraphAdapter,
  InMemoryGraphAdapter,
  GraphNode,
  BitmapIndexBuilder,
  BitmapIndexReader,
  IndexRebuildService,
  HealthCheckService,
  HealthStatus,
  CommitDagTraversalService,
  BisectService,
  GraphPersistencePort,
  IndexStoragePort,

  // Logging infrastructure
  LoggerPort,
  NoOpLogger,
  ConsoleLogger,
  LogLevel,

  // Seek cache (RECALL)
  SeekCachePort,

  // Port contracts
  BlobStoragePort,
  InMemoryBlobStorageAdapter,
  CryptoPort,
  HttpServerPort,

  // Crypto adapters
  NodeCryptoAdapter,
  WebCryptoAdapter,

  // HTTP adapters
  BunHttpAdapter,
  DenoHttpAdapter,

  // Error types for integrity failure handling
  AuditError,
  ContinuumArtifactAuthorityError,
  EncryptionError,
  PatchError,
  ForkError,
  IndexError,
  QueryError,
  SchemaUnsupportedError,
  ShardLoadError,
  ShardCorruptionError,
  ShardValidationError,
  StorageError,
  TraversalError,
  OperationAbortedError,
  SyncError,
  StrandError,
  WormholeError,
  WriterError,

  // Cancellation utilities
  checkAborted,
  createTimeoutSignal,

  // Multi-writer graph — admission architecture entry point
  openWarpGraph,

  // Multi-writer graph support (legacy — prefer openWarpGraph)
  WarpApp,
  WarpCore,
  Worldline,
  WorldlineSelector,
  LiveSelector,
  CoordinateSelector,
  StrandSelector,
  QueryBuilder,
  Observer,
  PatchBuilder,
  PatchSession,
  Writer,
  ProvenanceIndex,
  computeTranslationCost,

  // WARP type creators
  createNodeAdd,
  createNodeTombstone,
  createEdgeAdd,
  createEdgeTombstone,
  createPropSet,
  createInlineValue,
  createBlobValue,

  // Key codec utilities (BULKHEAD)
  encodeEdgePropKey,
  decodeEdgePropKey,
  isEdgePropKey,
  CONTENT_PROPERTY_KEY,

  // State indexing & hashing
  WarpStateIndexBuilder,
  buildWarpStateIndex,
  computeStateHash,
  projectState,
  createStateReader,
  compareVisibleState,
  ImmutableBytes,
  SnapshotORSet,
  SnapshotVersionVector,
  SnapshotWarpState,
  normalizeVisibleStateScope,
  scopeMaterializedState,
  exportCoordinateComparisonFact,
  exportCoordinateTransferPlanFact,

  // Continuum compatibility artifacts
  ContinuumArtifactAuthority,
  ContinuumArtifactDescriptor,
  ContinuumArtifactIngestionPolicy,
  ContinuumEvidenceClaim,
  ContinuumEvidencePosture,
  ContinuumFamilyId,
  ContinuumGeneratedFamilyInventory,
  ContinuumGeneratedFamilyInventoryEntry,
  ContinuumGeneratedFamilyStatus,
  ContinuumReceiptFamilyProjection,
  GitWarpReadingEnvelopePayloadFact,
  GitWarpReadingEnvelopeSourceFacts,
  GitWarpTickPatchReplayCore,
  GitWarpTickReceiptShell,
  GitWarpTickReceiptWitnessCore,
  GitWarpTickWitnessLadder,
  GitWarpWitnessedSuffixPatchFact,
  GitWarpWitnessedSuffixSourceFacts,
  GitWarpReceiptSourceFacts,
  createCurrentContinuumGeneratedFamilyInventory,
  ContinuumArtifactJsonFileAdapter,

  // Tick receipts (LIGHTHOUSE)
  createTickReceipt,
  tickReceiptCanonicalJson,
  TICK_RECEIPT_OP_TYPES,
  TICK_RECEIPT_RESULT_TYPES,

  // Provenance payload (HOLOGRAM)
  ProvenancePayload,

  // Boundary Transition Records (HOLOGRAM)
  BTR,
  createBTR,
  verifyBTR,
  replayBTR,

  // Wormhole compression (HOLOGRAM)
  createWormhole,
  composeWormholes,
  replayWormhole,
  serializeWormhole,
  deserializeWormhole,

  // Effect emission & delivery observation
  EffectSinkPort,
  MultiplexSink,
  EffectPipeline,
  createEffectEmission,
  canonicalEmissionJson,
  createDeliveryObservation,
  canonicalObservationJson,
  createExternalizationPolicy,
  DELIVERY_MODES,
  DELIVERY_OUTCOMES,
  LIVE_LENS,
  REPLAY_LENS,
  INSPECT_LENS,
  NoOpEffectSink,
  ConsoleEffectSink,
  ChunkEffectSink,
  SyncSecret,
};

export type {
  PropValue,
  SnapshotPropValue,
  SyncRateLimitConfig,
  ContinuumArtifactAuthorityValue,
  ContinuumArtifactDescriptorFields,
  ContinuumEvidenceClaimFields,
  ContinuumEvidencePostureValue,
  ContinuumGeneratedFamilyInventoryEntryFields,
  ContinuumGeneratedFamilyStatusValue,
  ContinuumDeliveryObservationFact,
  ContinuumReceiptFact,
  ContinuumReceiptFamilyProjectionFields,
  ContinuumReceiptOpFact,
  ContinuumReceiptWitnessFact,
  GitWarpReceiptSourceFactsFields,
  GitWarpReadingEnvelopePayloadFactFields,
  GitWarpReadingEnvelopeSourceFactsFields,
  GitWarpTickPatchReplayCoreFields,
  GitWarpTickReceiptShellFields,
  GitWarpTickReceiptWitnessCoreFields,
  GitWarpTickWitnessLadderFields,
  GitWarpWitnessedSuffixPatchFactFields,
  GitWarpWitnessedSuffixSourceFactsFields,
  ContinuumArtifactJsonLoadContext,
  ContinuumFamilyIdValue,
};

// WarpApp is the primary product-facing API for v15.
export default WarpApp;

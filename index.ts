/**
 * @module
 *
 * Deterministic WARP graph over Git: graph-native storage, traversal,
 * and tooling. Graph history lives under WARP refs, where patch and
 * checkpoint commits can carry Git trees for payloads, content, and
 * folded state while staying outside normal branch refs.
 *
 * First-use application code should open a named worldline with
 * `openWarpWorldline()`. `WarpApp`, `WarpCore`, and `openWarpGraph()` remain
 * supported compatibility and diagnostic surfaces for graph-first code.
 *
 * @example
 * ```typescript
 * import { GitGraphAdapter, openWarpWorldline } from '@git-stunts/git-warp';
 * import GitPlumbing from '@git-stunts/plumbing';
 *
 * const persistence = new GitGraphAdapter({
 *   plumbing: new GitPlumbing({ cwd: '.' }),
 * });
 *
 * const events = await openWarpWorldline({
 *   persistence,
 *   worldlineName: 'events',
 *   writerId: 'agent-1',
 * });
 *
 * await events.commit((patch) => {
 *   patch.addNode('user:alice');
 * });
 *
 * const props = await events.live().getNodeProps('user:alice');
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
import type WarpKernelPort from './src/ports/WarpKernelPort.ts';
import IndexStoragePort from './src/ports/IndexStoragePort.ts';
import LoggerPort from './src/ports/LoggerPort.ts';
import SeekCachePort from './src/ports/SeekCachePort.ts';
import InMemoryGraphAdapter from './src/infrastructure/adapters/InMemoryGraphAdapter.ts';
import NoOpLogger from './src/infrastructure/adapters/NoOpLogger.ts';
import ConsoleLogger, { LogLevel } from './src/infrastructure/adapters/ConsoleLogger.ts';
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
import {
  createNodeAdd,
  createNodeTombstone,
  createEdgeAdd,
  createEdgeTombstone,
  createPropSet,
  createInlineValue,
  createBlobValue,
  createV18BoundedMemoryCapabilityReport,
} from './rootCompatibility.ts';
import QueryBuilder from './src/domain/services/query/QueryBuilder.ts';
import BoundedSupportRule from './src/domain/services/query/BoundedSupportRule.ts';
import CausalIndexPlan from './src/domain/services/query/CausalIndexPlan.ts';
import SupportFragmentPlan from './src/domain/services/query/SupportFragmentPlan.ts';
import Observer from './src/domain/services/query/Observer.ts';
import ObserverAccumulation from './src/domain/services/query/ObserverAccumulation.ts';
import ObserverBasis from './src/domain/services/query/ObserverBasis.ts';
import ObserverEmission from './src/domain/services/query/ObserverEmission.ts';
import ObserverPlan from './src/domain/services/query/ObserverPlan.ts';
import ObserverReadingEnvelope from './src/domain/services/query/ObserverReadingEnvelope.ts';
import ProjectionHandle from './src/domain/services/ProjectionHandle.ts';
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
} from './src/application/WormholeServiceDefaults.ts';
import ApertureOpeningProof from './src/domain/services/wormhole/ApertureOpeningProof.ts';
import RejectedApertureOpening from './src/domain/services/wormhole/RejectedApertureOpening.ts';
import RejectedZKWormhole from './src/domain/services/wormhole/RejectedZKWormhole.ts';
import VerifiedApertureOpening from './src/domain/services/wormhole/VerifiedApertureOpening.ts';
import VerifiedZKWormhole from './src/domain/services/wormhole/VerifiedZKWormhole.ts';
import ZKWormholeEdge from './src/domain/services/wormhole/ZKWormholeEdge.ts';
import { openAperture, verifyZKWormhole } from './src/domain/services/wormhole/ZKWormholeService.ts';

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
import ZKWormholeProofVerifierPort from './src/ports/ZKWormholeProofVerifierPort.ts';
import ContentAttachmentProjection from './src/domain/services/ContentAttachmentProjection.ts';
import GraphOpAlgebraProjection from './src/domain/services/GraphOpAlgebraProjection.ts';
import { openWarpGraph } from './src/domain/WarpGraph.ts';
import WarpWorldline, { openWarpWorldline } from './src/domain/WarpWorldline.ts';
import { WarpOpenOptions } from './src/domain/warp/RuntimeHostBoot.ts';
import WarpWorldlineCoordinate from './src/domain/WarpWorldlineCoordinate.ts';
import WarpWorldlineOpticBasis from './src/domain/WarpWorldlineOpticBasis.ts';
import Optic from './src/domain/services/optic/Optic.ts';
import OpticAperturePosture from './src/domain/services/optic/OpticAperturePosture.ts';
import OpticBasisPosture from './src/domain/services/optic/OpticBasisPosture.ts';
import OpticCoordinatePosture from './src/domain/services/optic/OpticCoordinatePosture.ts';
import OpticSupportRule from './src/domain/services/optic/OpticSupportRule.ts';
import { PatchBuilder } from './src/domain/services/PatchBuilder.ts';
import { PatchSession } from './src/domain/warp/PatchSession.ts';
import { Writer } from './src/domain/warp/Writer.ts';
import { ProvenanceIndex } from './src/domain/services/provenance/ProvenanceIndex.ts';
import WarpStateIndexBuilder, { buildWarpStateIndex } from './src/domain/services/index/WarpStateIndexBuilder.ts';
import { computeStateHash, projectState } from './src/domain/services/state/StateSerializer.ts';
import { createStateReader } from './src/domain/services/state/StateReader.ts';
import { compareVisibleState } from './src/domain/services/comparison/VisibleStateComparison.ts';
import GraphDiff from './src/domain/services/comparison/GraphDiff.ts';
import TtdMergeBranch from './src/domain/services/merge/TtdMergeBranch.ts';
import TtdMergeFootprint from './src/domain/services/merge/TtdMergeFootprint.ts';
import TtdMergeInspection from './src/domain/services/merge/TtdMergeInspection.ts';
import TtdMergeInspector from './src/domain/services/merge/TtdMergeInspector.ts';
import TtdMergeLoweringWitness from './src/domain/services/merge/TtdMergeLoweringWitness.ts';
import TtdMergeObstructionWitness from './src/domain/services/merge/TtdMergeObstructionWitness.ts';
import TtdMergePolicyRequirement from './src/domain/services/merge/TtdMergePolicyRequirement.ts';
import ImmutableBytes from './src/domain/services/snapshot/ImmutableBytes.ts';
import SnapshotORSet from './src/domain/services/snapshot/SnapshotORSet.ts';
import SnapshotVersionVector from './src/domain/services/snapshot/SnapshotVersionVector.ts';
import SnapshotWarpState from './src/domain/services/snapshot/SnapshotWarpState.ts';
import type { PropValue } from './src/domain/types/PropValue.ts';
import type { Aperture, ObserverConfig } from './src/domain/types/Aperture.ts';
import type { SnapshotPropValue } from './src/domain/services/snapshot/SnapshotPropValue.ts';
import type { SyncRateLimitConfig } from './src/domain/services/sync/SyncRateLimiter.ts';
import type { WarpWorldlineOpenOptions, WarpWorldlinePatchBuild } from './src/domain/WarpWorldline.ts';
import type {
  OpticContextValue,
  OpticFields,
  OpticPostureFields,
} from './src/domain/services/optic/Optic.ts';
import type { OpticAperturePostureValue } from './src/domain/services/optic/OpticAperturePosture.ts';
import type { OpticBasisPostureValue } from './src/domain/services/optic/OpticBasisPosture.ts';
import type { OpticCoordinatePostureValue } from './src/domain/services/optic/OpticCoordinatePosture.ts';
import type { OpticSupportRuleValue } from './src/domain/services/optic/OpticSupportRule.ts';
import type { ApertureOpeningProofFields } from './src/domain/services/wormhole/ApertureOpeningProof.ts';
import type { ZKWormholeEdgeFields } from './src/domain/services/wormhole/ZKWormholeEdge.ts';
import type { ApertureOpeningVerificationResult, ZKWormholeVerificationResult } from './src/domain/services/wormhole/ZKWormholeVerificationResult.ts';
import type { WarpWorldlineCoordinateFrontierEntry } from './src/domain/WarpWorldlineCoordinate.ts';
import type { GraphDiffOptions } from './src/domain/capabilities/ComparisonCapability.ts';
import type { GraphDiffFields } from './src/domain/services/comparison/GraphDiff.ts';
import type { ObserverPlanFields } from './src/domain/services/query/ObserverPlan.ts';
import type {
  ObserverReadingEnvelopeBudget,
  ObserverReadingEnvelopeFields,
} from './src/domain/services/query/ObserverReadingEnvelope.ts';
import type {
  BoundedSupportDirection,
  BoundedSupportKind,
  BoundedSupportRuleFields,
  BoundedSupportSurface,
} from './src/domain/services/query/BoundedSupportRule.ts';
import type {
  CausalIndexFamily,
  CausalIndexPlanFields,
  CausalIndexPlanPosture,
} from './src/domain/services/query/CausalIndexPlan.ts';
import type {
  SupportFragmentMaterializationPosture,
  SupportFragmentPlanFields,
} from './src/domain/services/query/SupportFragmentPlan.ts';
import {
  normalizeVisibleStateScope,
  scopeMaterializedState,
} from './src/domain/services/VisibleStateScope.ts';
import {
  exportCoordinateComparisonFact,
  exportCoordinateTransferPlanFact,
} from './src/domain/services/CoordinateFactExport.ts';
import { installDefaultRuntimeHostNodePorts } from './src/application/RuntimeHostNodeDefaults.ts';

installDefaultRuntimeHostNodePorts();

export * from './src/domain/graph/publicGraphSubstrate.ts';
export * from './src/domain/memory/index.ts';
export * from './src/continuumExports.ts';
export { default as OperationPolicyPort } from './src/ports/OperationPolicyPort.ts';
export type { OperationPolicyExecuteOptions, OperationRetryDecision, OperationRetryObserver } from './src/ports/OperationPolicyPort.ts';
export { default as CasContentEncryptionPolicy } from './src/infrastructure/adapters/CasContentEncryptionPolicy.ts';
export type { CasContentEncryptionDiagnostics, CasContentEncryptionScheme, CasResolvedVaultKeyOptions, CasVaultResolutionWitness } from './src/infrastructure/adapters/CasContentEncryptionPolicy.ts';
export { default as AlfredOperationPolicyAdapter } from './src/infrastructure/adapters/AlfredOperationPolicyAdapter.ts';
export { default as NoopOperationPolicyAdapter } from './src/infrastructure/adapters/NoopOperationPolicyAdapter.ts';
export { OperationPolicyExhaustedError, OperationPolicyTimeoutError } from './src/domain/errors/index.ts';
export {
  AuditError,
  ContinuumArtifactAuthorityError,
  EncryptionError,
  ForkError,
  IndexError,
  MemoryBudgetError,
  OperationAbortedError,
  PatchError,
  QueryError,
  SchemaUnsupportedError,
  ShardCorruptionError,
  ShardLoadError,
  ShardValidationError,
  StorageError,
  StrandError,
  SyncError,
  TraversalError,
  WormholeError,
} from './src/domain/errors/index.ts';

import type { TtdMergeBranchFields } from './src/domain/services/merge/TtdMergeBranch.ts';
import type { TtdMergeFootprintFields } from './src/domain/services/merge/TtdMergeFootprint.ts';
import type { TtdMergeInspectionFields } from './src/domain/services/merge/TtdMergeInspection.ts';
import type { TtdMergeInspectionDomain } from './src/domain/services/merge/TtdMergeInspectionDomain.ts';
import type { TtdMergeLoweringSurface } from './src/domain/services/merge/TtdMergeLoweringSurface.ts';
import type { TtdMergeLoweringWitnessFields } from './src/domain/services/merge/TtdMergeLoweringWitness.ts';
import type { TtdMergeObjectBranchInput, TtdMergeObjectInspectionInput } from './src/domain/services/merge/TtdMergeInspector.ts';
import type { TtdMergeObstructionWitnessFields } from './src/domain/services/merge/TtdMergeObstructionWitness.ts';
import type { TtdMergePolicyRequirementFields } from './src/domain/services/merge/TtdMergePolicyRequirement.ts';

export {
  GitGraphAdapter,
  InMemoryGraphAdapter,
  GraphNode,
  GraphOpAlgebraProjection,
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
  WriterError,

  // Cancellation utilities
  checkAborted,
  createTimeoutSignal,

  // Multi-writer graph — advanced compatibility composition root
  WarpOpenOptions,
  openWarpGraph,

  // Worldline-first public handle
  openWarpWorldline,
  WarpWorldline,
  WarpWorldlineCoordinate,
  WarpWorldlineOpticBasis,
  Optic,
  OpticAperturePosture,
  OpticBasisPosture,
  OpticCoordinatePosture,
  OpticSupportRule,
  ProjectionHandle,

  // Multi-writer graph support (legacy/diagnostic — prefer openWarpWorldline)
  WarpApp,
  WarpCore,
  WorldlineSelector,
  LiveSelector,
  CoordinateSelector,
  StrandSelector,
  BoundedSupportRule,
  CausalIndexPlan,
  SupportFragmentPlan,
  QueryBuilder,
  Observer,
  ObserverAccumulation,
  ObserverBasis,
  ObserverEmission,
  ObserverPlan,
  ObserverReadingEnvelope,
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
  GraphDiff,
  TtdMergeBranch,
  TtdMergeFootprint,
  TtdMergeInspection,
  TtdMergeInspector,
  TtdMergeLoweringWitness,
  TtdMergeObstructionWitness,
  TtdMergePolicyRequirement,
  ImmutableBytes,
  SnapshotORSet,
  SnapshotVersionVector,
  SnapshotWarpState,
  normalizeVisibleStateScope,
  scopeMaterializedState,
  exportCoordinateComparisonFact,
  exportCoordinateTransferPlanFact,
  createV18BoundedMemoryCapabilityReport,

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
  ApertureOpeningProof, RejectedApertureOpening, RejectedZKWormhole,
  VerifiedApertureOpening, VerifiedZKWormhole, ZKWormholeEdge,
  openAperture, verifyZKWormhole, ZKWormholeProofVerifierPort,

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
  ContentAttachmentProjection,
};

export type {
  Aperture,
  ObserverConfig,
  PropValue,
  SnapshotPropValue,
  SyncRateLimitConfig,
  WarpKernelPort,
  WarpWorldlineOpenOptions,
  WarpWorldlinePatchBuild,
  OpticAperturePostureValue,
  OpticBasisPostureValue,
  OpticContextValue,
  OpticCoordinatePostureValue,
  OpticFields,
  OpticPostureFields,
  OpticSupportRuleValue,
  BoundedSupportDirection,
  BoundedSupportKind,
  BoundedSupportRuleFields,
  BoundedSupportSurface,
  CausalIndexFamily,
  CausalIndexPlanFields,
  CausalIndexPlanPosture,
  SupportFragmentMaterializationPosture,
  SupportFragmentPlanFields,
  GraphDiffOptions,
  GraphDiffFields,
  ObserverPlanFields,
  ObserverReadingEnvelopeBudget,
  ObserverReadingEnvelopeFields,
  ApertureOpeningProofFields, ApertureOpeningVerificationResult,
  ZKWormholeEdgeFields, ZKWormholeVerificationResult,
  WarpWorldlineCoordinateFrontierEntry,
  TtdMergeBranchFields,
  TtdMergeFootprintFields,
  TtdMergeInspectionDomain,
  TtdMergeInspectionFields,
  TtdMergeLoweringSurface,
  TtdMergeLoweringWitnessFields,
  TtdMergeObjectBranchInput,
  TtdMergeObjectInspectionInput,
  TtdMergeObstructionWitnessFields,
  TtdMergePolicyRequirementFields,
};

// WarpApp remains the compatibility default export for v15-era consumers.
export default WarpApp;

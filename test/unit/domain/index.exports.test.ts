/**
 * Tests for the main index.ts exports.
 *
 * Verifies that all expected exports are available from the package entry point,
 * supporting both ESM and CommonJS import styles.
 */

import { describe, it, expect } from 'vitest';

// Import everything from the main entry point
import WarpAppDefault, {
  WarpApp,
  WarpCore,
  // Core classes
  GitGraphAdapter,
  AttachmentKey,
  AttachmentRecord,
  AttachmentSchemaVersion,
  ContentAttachmentMime,
  ContentAttachmentOid,
  ContentAttachmentPayload,
  ContentAttachmentProjection,
  ContentAttachmentRecord,
  ContentAttachmentSize,
  EdgeId,
  EdgeRecord,
  EdgeTypeId,
  GraphAttachmentSetOp,
  GraphEdgeRecordSetOp,
  GraphNodeRecordSetOp,
  GraphOpAlgebra,
  GraphOpAlgebraProjection,
  GraphNode,
  NodeId,
  NodeRecord,
  NodeTypeId,
  BitmapIndexBuilder,
  BitmapIndexReader,
  IndexRebuildService,
  HealthCheckService,
  HealthStatus,
  CommitDagTraversalService,
  GraphPersistencePort,
  IndexStoragePort,

  // Logging infrastructure
  LoggerPort,
  NoOpLogger,
  ConsoleLogger,
  LogLevel,

  // Error types
  ForkError,
  WormholeError,
  IndexError,
  ShardLoadError,
  ShardCorruptionError,
  ShardValidationError,
  StorageError,
  TraversalError,
  OperationAbortedError,
  Observer,
  ContinuumArtifactAuthorityError,

  // Cancellation utilities
  checkAborted,
  createTimeoutSignal,

  // WARP type creators
  createNodeAdd,
  createNodeTombstone,
  createEdgeAdd,
  createEdgeTombstone,
  createPropSet,
  createInlineValue,
  createBlobValue,
  createStateReader,
  compareVisibleState,
  normalizeVisibleStateScope,
  scopeMaterializedState,
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
} from '../../../index.ts';

const { WarpGraph, WarpRuntime, Worldline, ObserverView } = (await import('../../../index.ts') as any);

describe('index.ts exports', () => {
  describe('default export', () => {
    it('exports WarpApp as default', () => {
      expect(WarpAppDefault).toBeDefined();
      expect(typeof WarpAppDefault).toBe('function');
      expect(WarpAppDefault).toBe(WarpApp);
      expect(WarpAppDefault.name).toBe('WarpApp');
    });
  });

  describe('runtime exports', () => {
    it('exports WarpApp as a named export', () => {
      expect(WarpApp).toBeDefined();
      expect(typeof WarpApp).toBe('function');
      expect(WarpApp).toBe(WarpAppDefault);
    });

    it('exports WarpCore as the full plumbing-facing surface', () => {
      expect(WarpCore).toBeDefined();
      expect(typeof WarpCore).toBe('function');
      expect(WarpCore.name).toBe('WarpCore');
    });

    it('does not export WarpRuntime from the public entry point', () => {
      expect(WarpRuntime).toBeUndefined();
    });

    it('does not export WarpGraph as a public compatibility alias', () => {
      expect(WarpGraph).toBeUndefined();
    });
  });

  describe('visible-state helpers', () => {
    it('exports normalizeVisibleStateScope', () => {
      expect(normalizeVisibleStateScope).toBeDefined();
      expect(typeof normalizeVisibleStateScope).toBe('function');
    });

    it('exports scopeMaterializedState', () => {
      expect(scopeMaterializedState).toBeDefined();
      expect(typeof scopeMaterializedState).toBe('function');
    });
  });

  describe('core classes', () => {
    it('exports Worldline', () => {
      expect(Worldline).toBeDefined();
      expect(typeof Worldline).toBe('function');
    });

    it('exports Observer', () => {
      expect(Observer).toBeDefined();
      expect(typeof Observer).toBe('function');
      expect(Observer.name).toBe('Observer');
      expect(ObserverView).toBeUndefined();
    });

    it('exports GitGraphAdapter', () => {
      expect(GitGraphAdapter).toBeDefined();
      expect(typeof GitGraphAdapter).toBe('function');
    });

    it('exports GraphNode', () => {
      expect(GraphNode).toBeDefined();
      expect(typeof GraphNode).toBe('function');
    });

    it('exports graph attachment substrate nouns', () => {
      expect(AttachmentKey).toBeDefined();
      expect(typeof AttachmentKey).toBe('function');
      expect(AttachmentRecord).toBeDefined();
      expect(typeof AttachmentRecord).toBe('function');
      expect(AttachmentSchemaVersion).toBeDefined();
      expect(typeof AttachmentSchemaVersion).toBe('function');
    });

    it('exports content attachment payload nouns', () => {
      expect(ContentAttachmentMime).toBeDefined();
      expect(typeof ContentAttachmentMime).toBe('function');
      expect(ContentAttachmentOid).toBeDefined();
      expect(typeof ContentAttachmentOid).toBe('function');
      expect(ContentAttachmentPayload).toBeDefined();
      expect(typeof ContentAttachmentPayload).toBe('function');
      expect(ContentAttachmentProjection).toBeDefined();
      expect(typeof ContentAttachmentProjection).toBe('function');
      expect(ContentAttachmentRecord).toBeDefined();
      expect(typeof ContentAttachmentRecord).toBe('function');
      expect(ContentAttachmentSize).toBeDefined();
      expect(typeof ContentAttachmentSize).toBe('function');
    });

    it('exports graph-op algebra substrate nouns', () => {
      expect(GraphAttachmentSetOp).toBeDefined();
      expect(typeof GraphAttachmentSetOp).toBe('function');
      expect(GraphEdgeRecordSetOp).toBeDefined();
      expect(typeof GraphEdgeRecordSetOp).toBe('function');
      expect(GraphNodeRecordSetOp).toBeDefined();
      expect(typeof GraphNodeRecordSetOp).toBe('function');
      expect(GraphOpAlgebra).toBeDefined();
      expect(typeof GraphOpAlgebra).toBe('function');
      expect(GraphOpAlgebraProjection).toBeDefined();
      expect(typeof GraphOpAlgebraProjection).toBe('function');
    });

    it('exports graph edge substrate nouns', () => {
      expect(EdgeId).toBeDefined();
      expect(typeof EdgeId).toBe('function');
      expect(EdgeRecord).toBeDefined();
      expect(typeof EdgeRecord).toBe('function');
      expect(EdgeTypeId).toBeDefined();
      expect(typeof EdgeTypeId).toBe('function');
    });

    it('exports graph node substrate nouns', () => {
      expect(NodeId).toBeDefined();
      expect(typeof NodeId).toBe('function');
      expect(NodeRecord).toBeDefined();
      expect(typeof NodeRecord).toBe('function');
      expect(NodeTypeId).toBeDefined();
      expect(typeof NodeTypeId).toBe('function');
    });

    it('exports BitmapIndexBuilder', () => {
      expect(BitmapIndexBuilder).toBeDefined();
      expect(typeof BitmapIndexBuilder).toBe('function');
    });

    it('exports BitmapIndexReader', () => {
      expect(BitmapIndexReader).toBeDefined();
      expect(typeof BitmapIndexReader).toBe('function');
    });

    it('exports IndexRebuildService', () => {
      expect(IndexRebuildService).toBeDefined();
      expect(typeof IndexRebuildService).toBe('function');
    });

    it('exports HealthCheckService', () => {
      expect(HealthCheckService).toBeDefined();
      expect(typeof HealthCheckService).toBe('function');
    });

    it('exports HealthStatus enum', () => {
      expect(HealthStatus).toBeDefined();
      expect(HealthStatus.HEALTHY).toBe('healthy');
      expect(HealthStatus.DEGRADED).toBe('degraded');
      expect(HealthStatus.UNHEALTHY).toBe('unhealthy');
    });

    it('exports CommitDagTraversalService', () => {
      expect(CommitDagTraversalService).toBeDefined();
      expect(typeof CommitDagTraversalService).toBe('function');
    });

  });

  describe('port interfaces', () => {
    it('exports GraphPersistencePort', () => {
      expect(GraphPersistencePort).toBeDefined();
      expect(typeof GraphPersistencePort).toBe('function');
    });

    it('exports IndexStoragePort', () => {
      expect(IndexStoragePort).toBeDefined();
      expect(typeof IndexStoragePort).toBe('function');
    });
  });

  describe('logging infrastructure', () => {
    it('exports LoggerPort', () => {
      expect(LoggerPort).toBeDefined();
      expect(typeof LoggerPort).toBe('function');
    });

    it('exports NoOpLogger', () => {
      expect(NoOpLogger).toBeDefined();
      expect(typeof NoOpLogger).toBe('function');
    });

    it('exports ConsoleLogger', () => {
      expect(ConsoleLogger).toBeDefined();
      expect(typeof ConsoleLogger).toBe('function');
    });

    it('exports LogLevel enum', () => {
      expect(LogLevel).toBeDefined();
      expect(LogLevel.DEBUG).toBeDefined();
      expect(LogLevel.INFO).toBeDefined();
      expect(LogLevel.WARN).toBeDefined();
      expect(LogLevel.ERROR).toBeDefined();
    });
  });

  describe('error types', () => {
    it('exports ForkError', () => {
      expect(ForkError).toBeDefined();
      expect(typeof ForkError).toBe('function');
    });

    it('exports WormholeError', () => {
      expect(WormholeError).toBeDefined();
      expect(typeof WormholeError).toBe('function');
    });

    it('exports IndexError', () => {
      expect(IndexError).toBeDefined();
      expect(typeof IndexError).toBe('function');
    });

    it('exports ShardLoadError', () => {
      expect(ShardLoadError).toBeDefined();
      expect(typeof ShardLoadError).toBe('function');
    });

    it('exports ShardCorruptionError', () => {
      expect(ShardCorruptionError).toBeDefined();
      expect(typeof ShardCorruptionError).toBe('function');
    });

    it('exports ShardValidationError', () => {
      expect(ShardValidationError).toBeDefined();
      expect(typeof ShardValidationError).toBe('function');
    });

    it('exports StorageError', () => {
      expect(StorageError).toBeDefined();
      expect(typeof StorageError).toBe('function');
    });

    it('exports TraversalError', () => {
      expect(TraversalError).toBeDefined();
      expect(typeof TraversalError).toBe('function');
    });

    it('exports OperationAbortedError', () => {
      expect(OperationAbortedError).toBeDefined();
      expect(typeof OperationAbortedError).toBe('function');
    });

    it('exports ContinuumArtifactAuthorityError', () => {
      expect(ContinuumArtifactAuthorityError).toBeDefined();
      expect(typeof ContinuumArtifactAuthorityError).toBe('function');
    });
  });

  describe('Continuum compatibility artifacts', () => {
    it('exports the artifact descriptor classes', () => {
      expect(ContinuumArtifactAuthority).toBeDefined();
      expect(ContinuumArtifactDescriptor).toBeDefined();
      expect(ContinuumArtifactIngestionPolicy).toBeDefined();
      expect(ContinuumEvidenceClaim).toBeDefined();
      expect(ContinuumEvidencePosture).toBeDefined();
      expect(ContinuumFamilyId).toBeDefined();
      expect(ContinuumGeneratedFamilyInventory).toBeDefined();
      expect(ContinuumGeneratedFamilyInventoryEntry).toBeDefined();
      expect(ContinuumGeneratedFamilyStatus).toBeDefined();
      expect(ContinuumReceiptFamilyProjection).toBeDefined();
      expect(GitWarpReadingEnvelopePayloadFact).toBeDefined();
      expect(GitWarpReadingEnvelopeSourceFacts).toBeDefined();
      expect(GitWarpTickPatchReplayCore).toBeDefined();
      expect(GitWarpTickReceiptShell).toBeDefined();
      expect(GitWarpTickReceiptWitnessCore).toBeDefined();
      expect(GitWarpTickWitnessLadder).toBeDefined();
      expect(GitWarpWitnessedSuffixPatchFact).toBeDefined();
      expect(GitWarpWitnessedSuffixSourceFacts).toBeDefined();
      expect(GitWarpReceiptSourceFacts).toBeDefined();
      expect(createCurrentContinuumGeneratedFamilyInventory).toBeDefined();
      expect(ContinuumArtifactJsonFileAdapter).toBeDefined();
    });

    it('constructs a generated receipt-family descriptor from public exports', () => {
      const descriptor = new ContinuumArtifactDescriptor({
        familyId: 'receipt-family',
        version: '0.1.0',
        sourceSchemaPath: '~/git/continuum/schemas/continuum-receipt-family.graphql',
        generatedBy: 'wesley witness-continuum --scope receipt-family',
        artifactKind: 'continuum.family.fixture',
        authority: 'generated-fixture',
        targets: ['typescript'],
      });

      expect(descriptor.familyId).toBeInstanceOf(ContinuumFamilyId);
      expect(descriptor.hasGeneratedAuthority()).toBe(true);
    });

    it('exports explicit Continuum evidence posture claims', () => {
      const descriptor = new ContinuumArtifactDescriptor({
        familyId: 'receipt-family',
        version: '0.1.0',
        sourceSchemaPath: '~/git/continuum/schemas/continuum-receipt-family.graphql',
        generatedBy: 'wesley witness-continuum --scope receipt-family',
        artifactKind: 'continuum.family.fixture',
        authority: 'generated-fixture',
        targets: ['typescript'],
      });
      const claim = new ContinuumEvidenceClaim({
        descriptor,
        posture: 'translated-git-warp-evidence',
      });

      expect(claim.posture).toBeInstanceOf(ContinuumEvidencePosture);
      expect(claim.isTranslatedGitWarpEvidence()).toBe(true);
      expect(claim.isNativeContinuumEvidence()).toBe(false);
    });

    it('exports the current generated-family readiness inventory', () => {
      const inventory = createCurrentContinuumGeneratedFamilyInventory();

      expect(inventory).toBeInstanceOf(ContinuumGeneratedFamilyInventory);
      expect(inventory.requireEntry('receipt-family')).toBeInstanceOf(ContinuumGeneratedFamilyInventoryEntry);
      expect(inventory.requireEntry('receipt-family').status).toBeInstanceOf(ContinuumGeneratedFamilyStatus);
      expect(inventory.requireEntry('receipt-family').status.isProjectionReady()).toBe(true);
      expect(inventory.requireEntry('runtime-boundary-family').status.isProjectionReady()).toBe(false);
    });
  });

  describe('cancellation utilities', () => {
    it('exports checkAborted', () => {
      expect(checkAborted).toBeDefined();
      expect(typeof checkAborted).toBe('function');
    });

    it('exports createTimeoutSignal', () => {
      expect(createTimeoutSignal).toBeDefined();
      expect(typeof createTimeoutSignal).toBe('function');
    });
  });

  describe('multi-writer graph support (WARP)', () => {
    it('exports WarpCore as the public plumbing surface from the main entry point', () => {
      expect(WarpCore).toBeDefined();
      expect(typeof WarpCore.open).toBe('function');
    });
  });

  describe('WARP type creators', () => {
    it('exports createNodeAdd', () => {
      expect(createNodeAdd).toBeDefined();
      expect(typeof createNodeAdd).toBe('function');
      const op = createNodeAdd('user:alice');
      expect(op).toEqual({ type: 'NodeAdd', node: 'user:alice' });
    });

    it('exports createNodeTombstone', () => {
      expect(createNodeTombstone).toBeDefined();
      expect(typeof createNodeTombstone).toBe('function');
      const op = createNodeTombstone('user:alice');
      expect(op).toEqual({ type: 'NodeTombstone', node: 'user:alice' });
    });

    it('exports createEdgeAdd', () => {
      expect(createEdgeAdd).toBeDefined();
      expect(typeof createEdgeAdd).toBe('function');
      const op = createEdgeAdd('user:alice', 'user:bob', 'follows');
      expect(op).toEqual({ type: 'EdgeAdd', from: 'user:alice', to: 'user:bob', label: 'follows' });
    });

    it('exports createEdgeTombstone', () => {
      expect(createEdgeTombstone).toBeDefined();
      expect(typeof createEdgeTombstone).toBe('function');
      const op = createEdgeTombstone('user:alice', 'user:bob', 'follows');
      expect(op).toEqual({ type: 'EdgeTombstone', from: 'user:alice', to: 'user:bob', label: 'follows' });
    });

    it('exports createPropSet', () => {
      expect(createPropSet).toBeDefined();
      expect(typeof createPropSet).toBe('function');
      const value = createInlineValue('Alice');
      const op = createPropSet('user:alice', 'name', value);
      expect(op).toEqual({ type: 'PropSet', node: 'user:alice', key: 'name', value: { type: 'inline', value: 'Alice' } });
    });

    // Note: createPatch (schema:1) has been removed - use Patch constructor directly

    it('exports createInlineValue', () => {
      expect(createInlineValue).toBeDefined();
      expect(typeof createInlineValue).toBe('function');
      const ref = createInlineValue('hello');
      expect(ref).toEqual({ type: 'inline', value: 'hello' });
    });

    it('exports createBlobValue', () => {
      expect(createBlobValue).toBeDefined();
      expect(typeof createBlobValue).toBe('function');
      const ref = createBlobValue('abc123def456');
      expect(ref).toEqual({ type: 'blob', oid: 'abc123def456' });
    });

    it('exports createStateReader', () => {
      expect(createStateReader).toBeDefined();
      expect(typeof createStateReader).toBe('function');
    });

    it('exports compareVisibleState', () => {
      expect(compareVisibleState).toBeDefined();
      expect(typeof compareVisibleState).toBe('function');
    });
  });

  describe('usage patterns', () => {
    it('supports ESM default and named imports for WarpApp/WarpCore', () => {
      // This test verifies the import syntax works
      // import WarpApp, { WarpCore } from 'warp';
      expect(WarpAppDefault).toBeDefined();
      expect(WarpApp).toBeDefined();
      expect(WarpCore).toBeDefined();
      expect(WarpAppDefault).toBe(WarpApp);
    });

    it('supports importing all WARP utilities together', () => {
      // Verify all the pieces needed for WARP usage are available
      expect(WarpApp).toBeDefined();
      expect(WarpCore).toBeDefined();
      expect(createNodeAdd).toBeDefined();
      // Note: createPatch (schema:1) removed - use Patch constructor directly
    });
  });
});

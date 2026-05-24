import { describe, expect, it } from 'vitest';

import DryRunGraphModelMigrationPlan
  from '../../../../src/domain/migrations/DryRunGraphModelMigrationPlan.ts';
import DryRunGraphModelMigrationPlanRequest
  from '../../../../src/domain/migrations/DryRunGraphModelMigrationPlanRequest.ts';
import GraphModelMigrationArchiveRef
  from '../../../../src/domain/migrations/GraphModelMigrationArchiveRef.ts';
import GraphModelMigrationBasis from '../../../../src/domain/migrations/GraphModelMigrationBasis.ts';
import GraphModelMigrationContentMapping
  from '../../../../src/domain/migrations/GraphModelMigrationContentMapping.ts';
import GraphModelMigrationContentSource
  from '../../../../src/domain/migrations/GraphModelMigrationContentSource.ts';
import GraphModelMigrationEdgeMapping
  from '../../../../src/domain/migrations/GraphModelMigrationEdgeMapping.ts';
import GraphModelMigrationHistoryPatchInput
  from '../../../../src/domain/migrations/GraphModelMigrationHistoryPatchInput.ts';
import GraphModelMigrationHistorySegment
  from '../../../../src/domain/migrations/GraphModelMigrationHistorySegment.ts';
import GraphModelMigrationFinalizationResult, {
  GRAPH_MODEL_MIGRATION_FINALIZATION_BLOCKED,
  GRAPH_MODEL_MIGRATION_FINALIZATION_COMPLETED,
} from '../../../../src/domain/migrations/GraphModelMigrationFinalizationResult.ts';
import GraphModelMigrationLoweredOperation
  from '../../../../src/domain/migrations/GraphModelMigrationLoweredOperation.ts';
import GraphModelMigrationLoweredPatchPlan
  from '../../../../src/domain/migrations/GraphModelMigrationLoweredPatchPlan.ts';
import GraphModelMigrationManifest
  from '../../../../src/domain/migrations/GraphModelMigrationManifest.ts';
import GraphModelMigrationManifestVersion
  from '../../../../src/domain/migrations/GraphModelMigrationManifestVersion.ts';
import GraphModelMigrationNodeMapping
  from '../../../../src/domain/migrations/GraphModelMigrationNodeMapping.ts';
import GraphModelMigrationNotice from '../../../../src/domain/migrations/GraphModelMigrationNotice.ts';
import GraphModelMigrationPatchDescriptor
  from '../../../../src/domain/migrations/GraphModelMigrationPatchDescriptor.ts';
import GraphModelMigrationPatchFrontierEvidence
  from '../../../../src/domain/migrations/GraphModelMigrationPatchFrontierEvidence.ts';
import GraphModelMigrationPatchOperationFact
  from '../../../../src/domain/migrations/GraphModelMigrationPatchOperationFact.ts';
import GraphModelMigrationPlannedGraphOperation
  from '../../../../src/domain/migrations/GraphModelMigrationPlannedGraphOperation.ts';
import GraphModelMigrationOperationLoweringResult
  from '../../../../src/domain/migrations/GraphModelMigrationOperationLoweringResult.ts';
import GraphModelMigrationPropertyMapping
  from '../../../../src/domain/migrations/GraphModelMigrationPropertyMapping.ts';
import GraphModelMigrationRuntimeConformanceResult, {
  GRAPH_MODEL_MIGRATION_RUNTIME_CONFORMANCE_FAILED,
  GRAPH_MODEL_MIGRATION_RUNTIME_CONFORMANCE_PASSED,
} from '../../../../src/domain/migrations/GraphModelMigrationRuntimeConformanceResult.ts';
import GraphModelMigrationScratchRef
  from '../../../../src/domain/migrations/GraphModelMigrationScratchRef.ts';
import GraphModelMigrationScratchWriteResult
  from '../../../../src/domain/migrations/GraphModelMigrationScratchWriteResult.ts';
import GraphModelMigrationScratchWrittenPatch
  from '../../../../src/domain/migrations/GraphModelMigrationScratchWrittenPatch.ts';
import GraphModelMigrationSourceInventory
  from '../../../../src/domain/migrations/GraphModelMigrationSourceInventory.ts';
import GraphModelMigrationStateSnapshotReference
  from '../../../../src/domain/migrations/GraphModelMigrationStateSnapshotReference.ts';
import GraphModelMigrationWriterChainDescriptor
  from '../../../../src/domain/migrations/GraphModelMigrationWriterChainDescriptor.ts';
import V17GoldenGraphFixtureManifest, {
  V17GoldenGraphFixtureVisibleFact,
  V17GoldenGraphFixtureWriterChain,
  v17GoldenGraphFixtureFactKindFromString,
} from '../../../../src/domain/migrations/V17GoldenGraphFixtureManifest.ts';

describe('graph model migration constructor guards', () => {
  it('rejects invalid scalar fields on leaf nouns', () => {
    expect(() => {
      // @ts-expect-error exercising runtime validation
      new GraphModelMigrationBasis(null);
    }).toThrow(/fields/);
    expect(() => new GraphModelMigrationBasis({
      graphId: '',
      basisId: 'basis:one',
    })).toThrow(/graphId/);
    expect(() => new GraphModelMigrationManifestVersion(2)).toThrow(/version/);
    expect(() => new GraphModelMigrationNotice({
      // @ts-expect-error exercising runtime validation
      kind: 'info',
      code: 'I_BAD_KIND',
      message: 'bad kind',
    })).toThrow(/kind/);
    expect(() => new GraphModelMigrationPatchDescriptor({
      patchId: 'patch:a',
      writerId: 'writer:a',
      writerSequence: -1,
    })).toThrow(/writerSequence/);
    expect(() => new GraphModelMigrationPatchOperationFact({
      operationIndex: -1,
      operationKind: 'node:set',
      operationKey: 'node:a',
    })).toThrow(/operationIndex/);
    expect(() => new GraphModelMigrationWriterChainDescriptor({
      writerId: 'writer:a',
      patchIds: ['patch:a', 'patch:a'],
    })).toThrow(/duplicates writer chain patch id/);
  });

  it('covers stable keys and factory constructors', () => {
    expect(sourceBasis().toKey()).toBe('graph:source\0basis:source');
    expect(GraphModelMigrationNotice.fatal('E_FATAL', 'fatal').isFatal()).toBe(true);
    expect(GraphModelMigrationPlannedGraphOperation.edgeRecord('legacy:edge', 'edge:a').kind)
      .toBe('edge-record');
    expect(GraphModelMigrationPlannedGraphOperation.contentAttachment('legacy:content', 'attachment:a').kind)
      .toBe('content-attachment');
    expect(() => new GraphModelMigrationPlannedGraphOperation({
      // @ts-expect-error exercising runtime validation
      kind: 'write-now',
      sourceKey: 'source',
      targetKey: 'target',
    })).toThrow(/kind/);
  });

  it('rejects invalid mapping and source fact envelopes', () => {
    expect(() => {
      // @ts-expect-error exercising runtime validation
      new GraphModelMigrationManifest(null);
    }).toThrow(/fields/);
    expect(() => new GraphModelMigrationManifest({
      version: GraphModelMigrationManifestVersion.current(),
      // @ts-expect-error exercising runtime validation
      sourceBasis: { graphId: 'graph:source', basisId: 'basis:source' },
      targetBasis: targetBasis(),
      nodeMappings: [],
      edgeMappings: [],
      propertyMappings: [],
      contentMappings: [],
      warnings: [],
      fatalErrors: [],
    })).toThrow(/sourceBasis/);
    expect(() => new GraphModelMigrationManifest({
      version: GraphModelMigrationManifestVersion.current(),
      sourceBasis: sourceBasis(),
      targetBasis: targetBasis(),
      nodeMappings: [],
      edgeMappings: [],
      propertyMappings: [],
      contentMappings: [{ legacyContentKey: 'node:a', targetAttachmentKey: 'attachment:a' }],
      warnings: [],
      fatalErrors: [],
    })).toThrow(/contentMappings/);
    expect(() => new GraphModelMigrationNodeMapping({
      legacyNodeId: '',
      targetNodeId: 'node:a',
    })).toThrow(/legacyNodeId/);
    expect(() => new GraphModelMigrationEdgeMapping({
      legacyEdgeId: 'edge:a',
      targetEdgeId: '',
    })).toThrow(/targetEdgeId/);
    expect(() => new GraphModelMigrationPropertyMapping({
      legacyOwnerId: 'node:a',
      legacyPropertyKey: '',
      targetOwnerId: 'node:a',
      targetPropertyKey: 'title',
    })).toThrow(/legacyPropertyKey/);
    expect(() => new GraphModelMigrationContentMapping({
      legacyContentKey: '',
      targetAttachmentKey: 'content-attachment:a',
    })).toThrow(/legacyContentKey/);
    expect(() => new GraphModelMigrationContentSource({
      legacyContentKey: 'node:a\0_content',
      contentOid: '',
    })).toThrow(/contentOid/);
    expect(() => new GraphModelMigrationStateSnapshotReference({
      snapshotId: '',
    })).toThrow(/snapshotId/);
  });

  it('rejects ambiguous frontier and history ordering facts', () => {
    expect(() => {
      // @ts-expect-error exercising runtime validation
      new GraphModelMigrationPatchFrontierEvidence(null);
    }).toThrow(/fields/);
    expect(() => new GraphModelMigrationPatchFrontierEvidence({
      frontierKey: 'frontier:a',
      parentPatchIds: ['patch:a', 'patch:a'],
    })).toThrow(/duplicates parent patch id/);
    expect(new GraphModelMigrationPatchFrontierEvidence({
      frontierKey: 'frontier:a',
      parentPatchIds: ['patch:b', 'patch:a'],
    }).parentPatchIds).toEqual(['patch:a', 'patch:b']);
    expect(() => new GraphModelMigrationHistorySegment({
      writerId: 'writer:a',
      patches: [historyPatch('writer:b', 'patch:b', 0)],
    })).toThrow(/wrong writer/);
    expect(() => new GraphModelMigrationHistorySegment({
      writerId: 'writer:a',
      patches: [historyPatch('writer:a', 'patch:a:1', 1)],
    })).toThrow(/contiguous per writer/);
    expect(() => new GraphModelMigrationHistoryPatchInput({
      writerId: 'writer:a',
      patchId: 'patch:a',
      writerSequence: 0,
      frontierEvidence: { frontierKey: 'frontier:a', parentPatchIds: [] },
      operations: [],
    })).toThrow(/frontierEvidence/);
    expect(() => new GraphModelMigrationHistoryPatchInput({
      writerId: 'writer:a',
      patchId: 'patch:a',
      writerSequence: 0,
      frontierEvidence: null,
      operations: [{ operationIndex: 0, operationKind: 'node:set', operationKey: 'node:a' }],
    })).toThrow(/operation facts/);
  });

  it('rejects boolean-trap notice inversions through explicit helpers', () => {
    expect(() => new DryRunGraphModelMigrationPlan({
      manifest: null,
      plannedOperations: [],
      warnings: [GraphModelMigrationNotice.fatal('E_IN_WARNING', 'fatal in warning slot')],
      fatalErrors: [GraphModelMigrationNotice.fatal('E_FATAL', 'fatal')],
    })).toThrow(/warnings contains the wrong notice kind/);
    expect(() => new DryRunGraphModelMigrationPlan({
      manifest: null,
      plannedOperations: [],
      warnings: [],
      fatalErrors: [GraphModelMigrationNotice.warning('W_IN_FATAL', 'warning in fatal slot')],
    })).toThrow(/fatalErrors contains the wrong notice kind/);
    expect(() => createInventory({
      warnings: [GraphModelMigrationNotice.fatal('E_IN_WARNING', 'fatal in warning slot')],
    })).toThrow(/warnings contains the wrong notice kind/);
    expect(() => createInventory({
      fatalErrors: [GraphModelMigrationNotice.warning('W_IN_FATAL', 'warning in fatal slot')],
    })).toThrow(/fatalErrors contains the wrong notice kind/);
  });

  it('rejects cross-field plan invariants and request duplicates', () => {
    expect(() => {
      // @ts-expect-error exercising runtime validation
      new DryRunGraphModelMigrationPlan(null);
    }).toThrow(/fields/);
    expect(() => new DryRunGraphModelMigrationPlan({
      // @ts-expect-error exercising runtime validation
      manifest: GraphModelMigrationNotice.warning('W_NOT_MANIFEST', 'not a manifest'),
      plannedOperations: [],
      warnings: [],
      fatalErrors: [],
    })).toThrow(/manifest/);
    expect(() => new DryRunGraphModelMigrationPlan({
      manifest: emptyManifest(),
      // @ts-expect-error exercising runtime validation
      plannedOperations: [{ kind: 'node-record', sourceKey: 'node:a', targetKey: 'node:a' }],
      warnings: [],
      fatalErrors: [],
    })).toThrow(/planned graph operations/);
    expect(() => new DryRunGraphModelMigrationPlan({
      manifest: null,
      plannedOperations: [],
      warnings: [],
      fatalErrors: [],
    })).toThrow(/successful dry-run plans/);
    expect(() => new DryRunGraphModelMigrationPlan({
      manifest: emptyManifest(),
      plannedOperations: [],
      warnings: [],
      fatalErrors: [GraphModelMigrationNotice.fatal('E_FATAL', 'fatal')],
    })).toThrow(/fatal dry-run plans/);
    expect(() => new DryRunGraphModelMigrationPlanRequest({
      inventory: createInventory({}),
      requiredContentKeys: ['content:a', 'content:a'],
      nodeMappings: [],
      edgeMappings: [],
      propertyMappings: [],
    })).toThrow(/duplicates required content key/);
    expect(() => new DryRunGraphModelMigrationPlanRequest({
      // @ts-expect-error exercising runtime validation
      inventory: emptyManifest(),
      requiredContentKeys: [],
      nodeMappings: [],
      edgeMappings: [],
      propertyMappings: [],
    })).toThrow(/inventory/);
    expect(() => new DryRunGraphModelMigrationPlanRequest({
      inventory: createInventory({}),
      // @ts-expect-error exercising runtime validation
      requiredContentKeys: [1],
      nodeMappings: [],
      edgeMappings: [],
      propertyMappings: [],
    })).toThrow(/contentKey/);
  });

  it('rejects invalid source inventory carrier shapes', () => {
    expect(() => {
      // @ts-expect-error exercising runtime validation
      new GraphModelMigrationSourceInventory(null);
    }).toThrow(/fields/);
    expect(() => new GraphModelMigrationSourceInventory({
      graphId: 'graph:source',
      // @ts-expect-error exercising runtime validation
      sourceBasis: { graphId: 'graph:source', basisId: 'basis:source' },
      writerChains: [],
      patchDescriptors: [],
      stateSnapshot: null,
      contentSources: [],
      warnings: [],
      fatalErrors: [],
    })).toThrow(/sourceBasis/);
    expect(() => new GraphModelMigrationSourceInventory({
      graphId: 'graph:source',
      sourceBasis: sourceBasis(),
      writerChains: [{ writerId: 'writer:a', patchIds: [] }],
      patchDescriptors: [],
      stateSnapshot: null,
      contentSources: [],
      warnings: [],
      fatalErrors: [],
    })).toThrow(/writerChains/);
    expect(() => new GraphModelMigrationSourceInventory({
      graphId: 'graph:source',
      sourceBasis: sourceBasis(),
      writerChains: [
        new GraphModelMigrationWriterChainDescriptor({
          writerId: 'writer:a',
          patchIds: ['patch:a'],
        }),
      ],
      patchDescriptors: [],
      stateSnapshot: null,
      contentSources: [],
      warnings: [],
      fatalErrors: [],
    })).toThrow(/uncollected patch/);
  });

  it('rejects invalid archive refs and scratch write results', () => {
    expect(new GraphModelMigrationArchiveRef({
      refName: 'refs/warp-migration-archive/graph/writers/alice',
    }).refName).toBe('refs/warp-migration-archive/graph/writers/alice');
    expect(GraphModelMigrationArchiveRef.validateRefName(null)?.code)
      .toBe('E_MISSING_ARCHIVE_REF');
    expect(GraphModelMigrationArchiveRef.validateRefName('refs/warp/graph/writers/alice')?.code)
      .toBe('E_LIVE_ARCHIVE_REF_TARGET');
    expect(GraphModelMigrationArchiveRef.validateRefName('refs/not-archive/graph')?.code)
      .toBe('E_INVALID_ARCHIVE_REF');
    expect(GraphModelMigrationArchiveRef.validateRefName('refs/warp-migration-archive/bad~name')?.code)
      .toBe('E_INVALID_ARCHIVE_REF');
    expect(() => {
      // @ts-expect-error exercising runtime validation
      new GraphModelMigrationArchiveRef(null);
    }).toThrow(/fields/);
    expect(() => new GraphModelMigrationScratchWriteResult({
      scratchRef: scratchRef(),
      scratchHead: 'scratch-head',
      writtenPatches: [writtenPatch(0), writtenPatch(1)],
      warnings: [],
      fatalErrors: [],
    })).toThrow(/duplicate scratch written operation/);
    expect(() => new GraphModelMigrationScratchWriteResult({
      scratchRef: scratchRef(),
      scratchHead: 'scratch-head',
      writtenPatches: [],
      warnings: [],
      fatalErrors: [GraphModelMigrationNotice.fatal('E_FATAL', 'fatal')],
    })).toThrow(/fatal scratch write results/);
    expect(() => new GraphModelMigrationScratchWriteResult({
      // @ts-expect-error exercising runtime validation
      scratchRef: 'refs/warp-migration-scratch/graph',
      scratchHead: null,
      writtenPatches: [],
      warnings: [],
      fatalErrors: [],
    })).toThrow(/scratchRef/);
    expect(() => new GraphModelMigrationScratchWriteResult({
      scratchRef: null,
      scratchHead: '',
      writtenPatches: [],
      warnings: [],
      fatalErrors: [],
    })).toThrow(/scratchHead/);
    expect(() => new GraphModelMigrationScratchWriteResult({
      scratchRef: null,
      scratchHead: null,
      // @ts-expect-error exercising runtime validation
      writtenPatches: 'nope',
      warnings: [],
      fatalErrors: [],
    })).toThrow(/writtenPatches/);
    expect(() => new GraphModelMigrationScratchWriteResult({
      scratchRef: null,
      scratchHead: null,
      // @ts-expect-error exercising runtime validation
      writtenPatches: [{ commitId: 'commit', operation: loweredOperation(), sequence: 0 }],
      warnings: [],
      fatalErrors: [],
    })).toThrow(/written patches/);
    expect(() => new GraphModelMigrationScratchWriteResult({
      scratchRef: null,
      scratchHead: null,
      writtenPatches: [],
      warnings: [GraphModelMigrationNotice.fatal('E_FATAL', 'fatal')],
      fatalErrors: [],
    })).toThrow(/warnings/);
    expect(() => new GraphModelMigrationScratchWriteResult({
      scratchRef: null,
      scratchHead: null,
      writtenPatches: [],
      warnings: [],
      fatalErrors: [GraphModelMigrationNotice.warning('W_WARNING', 'warning')],
    })).toThrow(/fatalErrors/);
  });

  it('rejects invalid finalization and runtime conformance evidence', () => {
    expect(() => {
      // @ts-expect-error exercising runtime validation
      new GraphModelMigrationFinalizationResult(null);
    }).toThrow(/fields/);
    expect(() => new GraphModelMigrationFinalizationResult({
      // @ts-expect-error exercising runtime validation
      status: 'done',
      liveRefName: 'refs/warp/graph',
      archiveRefName: null,
      previousLiveHead: null,
      finalizedLiveHead: null,
      fatalErrors: [GraphModelMigrationNotice.fatal('E_FATAL', 'fatal')],
    })).toThrow(/status/);
    expect(() => new GraphModelMigrationFinalizationResult({
      status: GRAPH_MODEL_MIGRATION_FINALIZATION_BLOCKED,
      liveRefName: '',
      archiveRefName: null,
      previousLiveHead: null,
      finalizedLiveHead: null,
      fatalErrors: [GraphModelMigrationNotice.fatal('E_FATAL', 'fatal')],
    })).toThrow(/liveRefName/);
    expect(() => new GraphModelMigrationFinalizationResult({
      status: GRAPH_MODEL_MIGRATION_FINALIZATION_BLOCKED,
      liveRefName: 'refs/warp/graph',
      archiveRefName: '',
      previousLiveHead: null,
      finalizedLiveHead: null,
      fatalErrors: [GraphModelMigrationNotice.fatal('E_FATAL', 'fatal')],
    })).toThrow(/archiveRefName/);
    expect(() => new GraphModelMigrationFinalizationResult({
      status: GRAPH_MODEL_MIGRATION_FINALIZATION_BLOCKED,
      liveRefName: 'refs/warp/graph',
      archiveRefName: null,
      previousLiveHead: null,
      finalizedLiveHead: null,
      fatalErrors: [],
    })).toThrow(/non-completed/);
    expect(() => new GraphModelMigrationFinalizationResult({
      status: GRAPH_MODEL_MIGRATION_FINALIZATION_COMPLETED,
      liveRefName: 'refs/warp/graph',
      archiveRefName: null,
      previousLiveHead: 'old',
      finalizedLiveHead: 'new',
      fatalErrors: [],
    })).toThrow(/archive and head/);
    expect(() => new GraphModelMigrationRuntimeConformanceResult({
      scratchRef: scratchRef(),
      scratchHead: 'scratch-head',
      status: GRAPH_MODEL_MIGRATION_RUNTIME_CONFORMANCE_PASSED,
      witness: 'witness',
      fatalErrors: [GraphModelMigrationNotice.fatal('E_FATAL', 'fatal')],
    })).toThrow(/passed runtime conformance/);
    expect(() => new GraphModelMigrationRuntimeConformanceResult({
      scratchRef: scratchRef(),
      scratchHead: 'scratch-head',
      status: GRAPH_MODEL_MIGRATION_RUNTIME_CONFORMANCE_FAILED,
      witness: 'witness',
      fatalErrors: [],
    })).toThrow(/failed runtime conformance/);
    expect(() => new GraphModelMigrationRuntimeConformanceResult({
      // @ts-expect-error exercising runtime validation
      scratchRef: 'refs/warp-migration-scratch/graph',
      scratchHead: 'scratch-head',
      status: GRAPH_MODEL_MIGRATION_RUNTIME_CONFORMANCE_FAILED,
      witness: 'witness',
      fatalErrors: [GraphModelMigrationNotice.fatal('E_FATAL', 'fatal')],
    })).toThrow(/scratchRef/);
  });

  it('rejects invalid lowering result and fixture manifest evidence', () => {
    expect(() => {
      // @ts-expect-error exercising runtime validation
      new GraphModelMigrationOperationLoweringResult(null);
    }).toThrow(/fields/);
    expect(() => new GraphModelMigrationOperationLoweringResult({
      // @ts-expect-error exercising runtime validation
      patchPlan: { operations: [] },
      warnings: [],
      fatalErrors: [],
    })).toThrow(/patchPlan/);
    expect(() => new GraphModelMigrationOperationLoweringResult({
      patchPlan: null,
      warnings: [GraphModelMigrationNotice.fatal('E_FATAL', 'fatal')],
      fatalErrors: [],
    })).toThrow(/warnings/);
    expect(() => new GraphModelMigrationOperationLoweringResult({
      patchPlan: null,
      warnings: [],
      fatalErrors: [GraphModelMigrationNotice.warning('W_WARNING', 'warning')],
    })).toThrow(/fatalErrors/);
    expect(() => new GraphModelMigrationOperationLoweringResult({
      patchPlan: loweredPatchPlan(),
      warnings: [],
      fatalErrors: [GraphModelMigrationNotice.fatal('E_FATAL', 'fatal')],
    })).toThrow(/fatal lowering/);
    expect(() => new GraphModelMigrationOperationLoweringResult({
      patchPlan: null,
      warnings: [],
      fatalErrors: [],
    })).toThrow(/successful lowering/);
    expect(() => v17GoldenGraphFixtureFactKindFromString('not-a-fact'))
      .toThrow(/fact kind/);
    expect(() => {
      // @ts-expect-error exercising runtime validation
      new V17GoldenGraphFixtureManifest(null);
    }).toThrow(/fields/);
    expect(() => new V17GoldenGraphFixtureManifest({
      fixtureId: 'fixture',
      graphId: 'graph',
      sourceVersion: '17.0.1',
      generator: 'test',
      bundlePath: 'bundle',
      writerChains: [fixtureWriter('alice'), fixtureWriter('alice')],
      visibleFacts: completeFixtureFacts(),
    })).toThrow(/duplicates writer/);
    expect(() => new V17GoldenGraphFixtureManifest({
      fixtureId: 'fixture',
      graphId: 'graph',
      sourceVersion: '17.0.1',
      generator: 'test',
      bundlePath: 'bundle',
      writerChains: [fixtureWriter('alice')],
      visibleFacts: [fixtureFact('node', 'node:a')],
    })).toThrow(/visibleFacts must include edge/);
  });
});

type InventoryOverrides = {
  readonly warnings?: readonly GraphModelMigrationNotice[];
  readonly fatalErrors?: readonly GraphModelMigrationNotice[];
};

function sourceBasis(): GraphModelMigrationBasis {
  return new GraphModelMigrationBasis({
    graphId: 'graph:source',
    basisId: 'basis:source',
  });
}

function targetBasis(): GraphModelMigrationBasis {
  return new GraphModelMigrationBasis({
    graphId: 'graph:target',
    basisId: 'basis:target',
  });
}

function emptyManifest(): GraphModelMigrationManifest {
  return new GraphModelMigrationManifest({
    version: GraphModelMigrationManifestVersion.current(),
    sourceBasis: sourceBasis(),
    targetBasis: targetBasis(),
    nodeMappings: [],
    edgeMappings: [],
    propertyMappings: [],
    contentMappings: [],
    warnings: [],
    fatalErrors: [],
  });
}

function createInventory(overrides: InventoryOverrides): GraphModelMigrationSourceInventory {
  return new GraphModelMigrationSourceInventory({
    graphId: 'graph:source',
    sourceBasis: sourceBasis(),
    writerChains: [
      new GraphModelMigrationWriterChainDescriptor({
        writerId: 'writer:a',
        patchIds: ['patch:a:0'],
      }),
    ],
    patchDescriptors: [
      new GraphModelMigrationPatchDescriptor({
        patchId: 'patch:a:0',
        writerId: 'writer:a',
        writerSequence: 0,
      }),
    ],
    stateSnapshot: new GraphModelMigrationStateSnapshotReference({
      snapshotId: 'snapshot:source',
    }),
    contentSources: [],
    warnings: overrides.warnings ?? [],
    fatalErrors: overrides.fatalErrors ?? [],
  });
}

function historyPatch(
  writerId: string,
  patchId: string,
  writerSequence: number,
): GraphModelMigrationHistoryPatchInput {
  return new GraphModelMigrationHistoryPatchInput({
    writerId,
    patchId,
    writerSequence,
    frontierEvidence: new GraphModelMigrationPatchFrontierEvidence({
      frontierKey: `${patchId}:frontier`,
      parentPatchIds: [],
    }),
    operations: [
      new GraphModelMigrationPatchOperationFact({
        operationIndex: 0,
        operationKind: 'node:set',
        operationKey: `${patchId}:node`,
      }),
    ],
  });
}

function scratchRef(): GraphModelMigrationScratchRef {
  return new GraphModelMigrationScratchRef({
    refName: 'refs/warp-migration-scratch/graph/migration',
  });
}

function loweredOperation(): GraphModelMigrationLoweredOperation {
  return new GraphModelMigrationLoweredOperation({
    kind: 'node-record',
    sourceKey: 'node:a',
    targetKey: 'node:a',
  });
}

function loweredPatchPlan(): GraphModelMigrationLoweredPatchPlan {
  return new GraphModelMigrationLoweredPatchPlan({
    sourceBasis: sourceBasis(),
    targetBasis: targetBasis(),
    operations: [loweredOperation()],
  });
}

function writtenPatch(sequence: number): GraphModelMigrationScratchWrittenPatch {
  return new GraphModelMigrationScratchWrittenPatch({
    commitId: `commit:${sequence}`,
    operation: loweredOperation(),
    sequence,
  });
}

function fixtureWriter(writerId: string): V17GoldenGraphFixtureWriterChain {
  return new V17GoldenGraphFixtureWriterChain({
    writerId,
    refName: `refs/warp/graph/writers/${writerId}`,
    expectedHead: '1111111111111111111111111111111111111111',
    patchCount: 1,
  });
}

function fixtureFact(
  kind: 'node' | 'edge' | 'property' | 'content' | 'removal' | 'multi-writer',
  key: string,
): V17GoldenGraphFixtureVisibleFact {
  return new V17GoldenGraphFixtureVisibleFact({
    kind,
    key,
    description: `${kind}:${key}`,
  });
}

function completeFixtureFacts(): readonly V17GoldenGraphFixtureVisibleFact[] {
  return Object.freeze([
    fixtureFact('node', 'node:a'),
    fixtureFact('edge', 'edge:a'),
    fixtureFact('property', 'property:a'),
    fixtureFact('content', 'content:a'),
    fixtureFact('removal', 'node:removed'),
    fixtureFact('multi-writer', 'writers:a+b'),
  ]);
}

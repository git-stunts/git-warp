import { describe, expect, it } from 'vitest';

import DryRunGraphModelMigrationPlanRequest
  from '../../../../src/domain/migrations/DryRunGraphModelMigrationPlanRequest.ts';
import DryRunGraphModelMigrationPlanner
  from '../../../../src/domain/migrations/DryRunGraphModelMigrationPlanner.ts';
import GraphModelMigrationBasis from '../../../../src/domain/migrations/GraphModelMigrationBasis.ts';
import GraphModelMigrationContentSource
  from '../../../../src/domain/migrations/GraphModelMigrationContentSource.ts';
import GraphModelMigrationNodeMapping
  from '../../../../src/domain/migrations/GraphModelMigrationNodeMapping.ts';
import GraphModelMigrationPatchDescriptor
  from '../../../../src/domain/migrations/GraphModelMigrationPatchDescriptor.ts';
import GraphModelMigrationPropertyMapping
  from '../../../../src/domain/migrations/GraphModelMigrationPropertyMapping.ts';
import GraphModelMigrationSourceInventory
  from '../../../../src/domain/migrations/GraphModelMigrationSourceInventory.ts';
import GraphModelMigrationStateSnapshotReference
  from '../../../../src/domain/migrations/GraphModelMigrationStateSnapshotReference.ts';
import GraphModelMigrationWriterChainDescriptor
  from '../../../../src/domain/migrations/GraphModelMigrationWriterChainDescriptor.ts';

describe('DryRunGraphModelMigrationPlanner', () => {
  it('emits a manifest and planned graph-operation facts for complete inventory', () => {
    const result = planner().plan(createRequest({
      contentSources: [
        contentSource('node:b\0_content', 'oid:b'),
        contentSource('node:a\0_content', 'oid:a'),
      ],
      nodeMappings: [
        new GraphModelMigrationNodeMapping({
          legacyNodeId: 'node:a',
          targetNodeId: 'node:a',
        }),
      ],
      propertyMappings: [
        new GraphModelMigrationPropertyMapping({
          legacyOwnerId: 'node:a',
          legacyPropertyKey: 'title',
          targetOwnerId: 'node:a',
          targetPropertyKey: 'title',
        }),
      ],
      requiredContentKeys: ['node:a\0_content'],
    }));

    expect(result.hasFatalErrors()).toBe(false);
    expect(result.manifest?.sourceBasis.basisId).toBe('basis:source');
    expect(result.manifest?.targetBasis.basisId).toBe('basis:source:dry-run');
    expect(result.manifest?.contentMappings.map((mapping) => mapping.legacyContentKey)).toEqual([
      'node:a\0_content',
      'node:b\0_content',
    ]);
    expect(result.plannedOperations.map((operation) => operation.kind)).toEqual([
      'content-attachment',
      'content-attachment',
      'node-record',
      'property',
    ]);
    const propertyOperation = result.plannedOperations.find((operation) => operation.kind === 'property');
    expect(propertyOperation?.targetKey).toBe('property-target-key:length-prefixed-v1:6:node:a:5:title');
  });

  it('fails closed when source inventory is incomplete', () => {
    const result = planner().plan(createRequest({ sourceBasis: null }));

    expect(result.manifest).toBeNull();
    expect(result.plannedOperations).toEqual([]);
    expect(result.hasFatalErrors()).toBe(true);
    expect(result.fatalErrors.map((notice) => notice.code)).toContain('E_MISSING_SOURCE_BASIS');
  });

  it('fails closed when required content sources are missing', () => {
    const result = planner().plan(createRequest({
      requiredContentKeys: ['node:missing\0_content'],
    }));

    expect(result.manifest).toBeNull();
    expect(result.plannedOperations).toEqual([]);
    expect(result.fatalErrors.map((notice) => notice.code)).toEqual(['E_MISSING_CONTENT_SOURCE']);
  });

  it('does not admit malformed property facts into planned output', () => {
    expect(() => new DryRunGraphModelMigrationPlanRequest({
      inventory: sourceInventory({}),
      requiredContentKeys: [],
      nodeMappings: [],
      edgeMappings: [],
      // @ts-expect-error exercising runtime validation
      propertyMappings: [{ legacyOwnerId: 'node:a', legacyPropertyKey: 'title' }],
    })).toThrow(/propertyMappings must contain property mappings/);
  });

  it('emits deterministic output across repeated runs', () => {
    const request = createRequest({
      contentSources: [
        contentSource('node:b\0_content', 'oid:b'),
        contentSource('node:a\0_content', 'oid:a'),
      ],
    });
    const first = planner().plan(request);
    const second = planner().plan(request);

    expect(first.plannedOperations.map((operation) => operation.toKey())).toEqual(
      second.plannedOperations.map((operation) => operation.toKey()),
    );
    expect(first.manifest?.contentMappings).toEqual(second.manifest?.contentMappings);
  });
});

type RequestOverrides = {
  readonly sourceBasis?: GraphModelMigrationBasis | null;
  readonly contentSources?: readonly GraphModelMigrationContentSource[];
  readonly requiredContentKeys?: readonly string[];
  readonly nodeMappings?: readonly GraphModelMigrationNodeMapping[];
  readonly propertyMappings?: readonly GraphModelMigrationPropertyMapping[];
};

function planner(): DryRunGraphModelMigrationPlanner {
  return new DryRunGraphModelMigrationPlanner();
}

function createRequest(overrides: RequestOverrides): DryRunGraphModelMigrationPlanRequest {
  return new DryRunGraphModelMigrationPlanRequest({
    inventory: sourceInventory(overrides),
    requiredContentKeys: overrides.requiredContentKeys ?? [],
    nodeMappings: overrides.nodeMappings ?? [],
    edgeMappings: [],
    propertyMappings: overrides.propertyMappings ?? [],
  });
}

function sourceInventory(overrides: RequestOverrides): GraphModelMigrationSourceInventory {
  return new GraphModelMigrationSourceInventory({
    graphId: 'graph:source',
    sourceBasis: 'sourceBasis' in overrides ? overrides.sourceBasis : sourceBasis(),
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
    contentSources: overrides.contentSources ?? [],
    warnings: [],
    fatalErrors: [],
  });
}

function sourceBasis(): GraphModelMigrationBasis {
  return new GraphModelMigrationBasis({
    graphId: 'graph:source',
    basisId: 'basis:source',
  });
}

function contentSource(
  legacyContentKey: string,
  contentHandle: string,
): GraphModelMigrationContentSource {
  return new GraphModelMigrationContentSource({ legacyContentKey, contentHandle });
}

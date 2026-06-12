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
import GraphModelMigrationNotice from '../../../../src/domain/migrations/GraphModelMigrationNotice.ts';
import GraphModelMigrationOperationLowerer
  from '../../../../src/domain/migrations/GraphModelMigrationOperationLowerer.ts';
import GraphModelMigrationPatchDescriptor
  from '../../../../src/domain/migrations/GraphModelMigrationPatchDescriptor.ts';
import GraphModelMigrationPropertyMapping
  from '../../../../src/domain/migrations/GraphModelMigrationPropertyMapping.ts';
import GraphModelMigrationSourceInventory
  from '../../../../src/domain/migrations/GraphModelMigrationSourceInventory.ts';
import GraphModelMigrationWriterChainDescriptor
  from '../../../../src/domain/migrations/GraphModelMigrationWriterChainDescriptor.ts';

describe('GraphModelMigrationOperationLowerer', () => {
  it('lowers successful dry-run plans into deterministic write-ready facts', () => {
    const result = lowerer().lower(planner().plan(completeRequest()));

    expect(result.hasFatalErrors()).toBe(false);
    expect(result.patchPlan?.sourceBasis.basisId).toBe('basis:source');
    expect(result.patchPlan?.targetBasis.basisId).toBe('basis:source:dry-run');
    expect(result.patchPlan?.operations.map((operation) => operation.toKey())).toEqual([
      'lowered\0content-attachment\0node:a\0_content\0content-attachment:node:a\0_content',
      'lowered\0node-record\0node:a\0node:a',
      'lowered\0property\0node:a\0title\0property-target-key:length-prefixed-v1:6:node:a:5:title',
    ]);
  });

  it('preserves property target key identity through lowering', () => {
    const result = lowerer().lower(planner().plan(completeRequest()));
    const propertyOperation = result.patchPlan?.operations.find((operation) => operation.kind === 'property');

    expect(propertyOperation?.targetKey).toBe('property-target-key:length-prefixed-v1:6:node:a:5:title');
  });

  it('fails closed instead of lowering fatal dry-run plans', () => {
    const result = lowerer().lower(planner().plan(new DryRunGraphModelMigrationPlanRequest({
      inventory: sourceInventory({
        sourceBasis: null,
        fatalErrors: [],
      }),
      requiredContentKeys: [],
      nodeMappings: [],
      edgeMappings: [],
      propertyMappings: [],
    })));

    expect(result.patchPlan).toBeNull();
    expect(result.hasFatalErrors()).toBe(true);
    expect(result.fatalErrors.map((notice) => notice.code)).toContain('E_MISSING_SOURCE_BASIS');
  });

  it('requires lowered operation facts in patch plans', () => {
    const plan = lowerer().lower(planner().plan(completeRequest())).patchPlan;

    expect(plan?.hasOperations()).toBe(true);
    expect(() => new GraphModelMigrationOperationLowerer().lower(
      // @ts-expect-error exercising runtime validation
      { plannedOperations: [] },
    )).toThrow(/DryRunGraphModelMigrationPlan/);
  });
});

function planner(): DryRunGraphModelMigrationPlanner {
  return new DryRunGraphModelMigrationPlanner();
}

function lowerer(): GraphModelMigrationOperationLowerer {
  return new GraphModelMigrationOperationLowerer();
}

function completeRequest(): DryRunGraphModelMigrationPlanRequest {
  return new DryRunGraphModelMigrationPlanRequest({
    inventory: sourceInventory({
      sourceBasis: new GraphModelMigrationBasis({
        graphId: 'graph:source',
        basisId: 'basis:source',
      }),
      fatalErrors: [],
    }),
    requiredContentKeys: ['node:a\0_content'],
    nodeMappings: [
      new GraphModelMigrationNodeMapping({
        legacyNodeId: 'node:a',
        targetNodeId: 'node:a',
      }),
    ],
    edgeMappings: [],
    propertyMappings: [
      new GraphModelMigrationPropertyMapping({
        legacyOwnerId: 'node:a',
        legacyPropertyKey: 'title',
        targetOwnerId: 'node:a',
        targetPropertyKey: 'title',
      }),
    ],
  });
}

function sourceInventory(options: {
  readonly sourceBasis: GraphModelMigrationBasis | null;
  readonly fatalErrors: readonly GraphModelMigrationNotice[];
}): GraphModelMigrationSourceInventory {
  return new GraphModelMigrationSourceInventory({
    graphId: 'graph:source',
    sourceBasis: options.sourceBasis,
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
    stateSnapshot: null,
    contentSources: [
      new GraphModelMigrationContentSource({
        legacyContentKey: 'node:a\0_content',
        contentOid: 'oid:a',
      }),
    ],
    warnings: [],
    fatalErrors: options.fatalErrors,
  });
}

import { describe, expect, it } from 'vitest';

import DryRunGraphModelMigrationPlanRequest
  from '../../../../src/domain/migrations/DryRunGraphModelMigrationPlanRequest.ts';
import {
  parseGraphModelMigrationDryRunRequest,
} from '../../../../src/infrastructure/adapters/GraphModelMigrationDryRunRequestJsonAdapter.ts';

type FixtureJsonValue =
  | string
  | number
  | boolean
  | null
  | readonly FixtureJsonValue[]
  | { readonly [key: string]: FixtureJsonValue };

type RequestOverrides = {
  readonly inventory?: FixtureJsonValue;
  readonly requiredContentKeys?: FixtureJsonValue;
  readonly nodeMappings?: FixtureJsonValue;
  readonly edgeMappings?: FixtureJsonValue;
  readonly propertyMappings?: FixtureJsonValue;
  readonly extraRoot?: boolean;
};

type InventoryOverrides = {
  readonly graphId?: FixtureJsonValue;
  readonly sourceBasis?: FixtureJsonValue;
  readonly writerChains?: FixtureJsonValue;
  readonly patchDescriptors?: FixtureJsonValue;
  readonly stateSnapshot?: FixtureJsonValue;
  readonly contentSources?: FixtureJsonValue;
  readonly warnings?: FixtureJsonValue;
  readonly fatalErrors?: FixtureJsonValue;
  readonly extraInventory?: boolean;
};

describe('GraphModelMigrationDryRunRequestJsonAdapter', () => {
  it('parses a complete dry-run request into runtime-backed migration nouns', () => {
    const request = parseGraphModelMigrationDryRunRequest(requestJson());

    expect(request).toBeInstanceOf(DryRunGraphModelMigrationPlanRequest);
    expect(request.inventory.graphId).toBe('v17-golden-graph');
    expect(request.inventory.stateSnapshot?.snapshotId).toBe('snapshot:source');
    expect(request.inventory.warnings.map((notice) => notice.kind)).toEqual(['warning']);
    expect(request.inventory.fatalErrors.map((notice) => notice.kind)).toEqual(['fatal']);
    expect(request.requiredContentKeys).toEqual(['node:alpha:_content']);
  });

  it('rejects malformed JSON without leaking a platform SyntaxError', () => {
    expect(() => parseGraphModelMigrationDryRunRequest('{')).toThrow(/valid JSON/);
  });

  it('rejects malformed request envelopes at the JSON boundary', () => {
    const cases = Object.freeze([
      {
        raw: requestJson({ extraRoot: true }),
        message: /dryRunRequest\.extra/,
      },
      {
        raw: requestJson({ inventory: [] }),
        message: /inventory.*object/,
      },
      {
        raw: requestJson({ requiredContentKeys: 'node:alpha:_content' }),
        message: /requiredContentKeys.*array/,
      },
      {
        raw: requestJson({ requiredContentKeys: ['node:alpha:_content', ''] }),
        message: /requiredContentKeys\[1\]/,
      },
      {
        raw: requestJson({ nodeMappings: [null] }),
        message: /nodeMappings\[0\].*object/,
      },
    ]);

    for (const candidate of cases) {
      expect(() => parseGraphModelMigrationDryRunRequest(candidate.raw))
        .toThrow(candidate.message);
    }
  });

  it('rejects malformed inventory payloads at the JSON boundary', () => {
    const cases = Object.freeze([
      {
        raw: requestJson({ inventory: inventoryJson({ extraInventory: true }) }),
        message: /inventory\.extra/,
      },
      {
        raw: requestJson({ inventory: inventoryJson({ graphId: '' }) }),
        message: /inventory\.graphId/,
      },
      {
        raw: requestJson({ inventory: inventoryJson({ writerChains: 'alice' }) }),
        message: /writerChains.*array/,
      },
      {
        raw: requestJson({ inventory: inventoryJson({ patchDescriptors: [null] }) }),
        message: /patchDescriptors\[0\].*object/,
      },
      {
        raw: requestJson({
          inventory: inventoryJson({
            patchDescriptors: [
              {
                patchId: 'patch:alice:0',
                writerId: 'alice',
                writerSequence: '0',
              },
            ],
          }),
        }),
        message: /writerSequence.*finite number/,
      },
      {
        raw: requestJson({
          inventory: inventoryJson({
            warnings: [
              {
                kind: 'info',
                code: 'W_SOURCE',
                message: 'unsupported notice kind',
              },
            ],
          }),
        }),
        message: /warnings\[0\]\.kind.*warning or fatal/,
      },
      {
        raw: requestJson({
          inventory: inventoryJson({
            contentSources: [
              {
                legacyContentKey: 'node:alpha:_content',
              },
            ],
          }),
        }),
        message: /contentHandle.*required/,
      },
    ]);

    for (const candidate of cases) {
      expect(() => parseGraphModelMigrationDryRunRequest(candidate.raw))
        .toThrow(candidate.message);
    }
  });
});

function requestJson(overrides: RequestOverrides = {}): string {
  const request = {
    inventory: overrides.inventory ?? inventoryJson(),
    requiredContentKeys: overrides.requiredContentKeys ?? ['node:alpha:_content'],
    nodeMappings: overrides.nodeMappings ?? [
      {
        legacyNodeId: 'node:alpha',
        targetNodeId: 'node:alpha',
      },
    ],
    edgeMappings: overrides.edgeMappings ?? [
      {
        legacyEdgeId: 'edge:alpha-beta',
        targetEdgeId: 'edge:alpha-beta',
      },
    ],
    propertyMappings: overrides.propertyMappings ?? [
      {
        legacyOwnerId: 'node:alpha',
        legacyPropertyKey: 'title',
        targetOwnerId: 'node:alpha',
        targetPropertyKey: 'title',
      },
    ],
    ...(overrides.extraRoot === true ? { extra: true } : {}),
  };
  return JSON.stringify(request);
}

function inventoryJson(overrides: InventoryOverrides = {}) {
  return {
    graphId: overrides.graphId ?? 'v17-golden-graph',
    sourceBasis: overrides.sourceBasis ?? {
      graphId: 'v17-golden-graph',
      basisId: 'basis:source',
    },
    writerChains: overrides.writerChains ?? [
      {
        writerId: 'alice',
        patchIds: ['patch:alice:0'],
      },
    ],
    patchDescriptors: overrides.patchDescriptors ?? [
      {
        patchId: 'patch:alice:0',
        writerId: 'alice',
        writerSequence: 0,
      },
    ],
    stateSnapshot: overrides.stateSnapshot ?? {
      snapshotId: 'snapshot:source',
    },
    contentSources: overrides.contentSources ?? [
      {
        legacyContentKey: 'node:alpha:_content',
        contentOid: 'fixture-content:node:alpha:_content',
      },
    ],
    warnings: overrides.warnings ?? [
      {
        kind: 'warning',
        code: 'W_SOURCE',
        message: 'source warning',
      },
    ],
    fatalErrors: overrides.fatalErrors ?? [
      {
        kind: 'fatal',
        code: 'E_SOURCE',
        message: 'source fatal',
      },
    ],
    ...(overrides.extraInventory === true ? { extra: true } : {}),
  };
}

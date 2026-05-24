import { describe, expect, it } from 'vitest';

import GraphModelMigrationBasis from '../../../../src/domain/migrations/GraphModelMigrationBasis.ts';
import GraphModelMigrationContentMapping
  from '../../../../src/domain/migrations/GraphModelMigrationContentMapping.ts';
import GraphModelMigrationEdgeMapping
  from '../../../../src/domain/migrations/GraphModelMigrationEdgeMapping.ts';
import GraphModelMigrationManifest
  from '../../../../src/domain/migrations/GraphModelMigrationManifest.ts';
import GraphModelMigrationManifestVersion
  from '../../../../src/domain/migrations/GraphModelMigrationManifestVersion.ts';
import GraphModelMigrationNodeMapping
  from '../../../../src/domain/migrations/GraphModelMigrationNodeMapping.ts';
import GraphModelMigrationNotice from '../../../../src/domain/migrations/GraphModelMigrationNotice.ts';
import GraphModelMigrationPropertyMapping
  from '../../../../src/domain/migrations/GraphModelMigrationPropertyMapping.ts';
import {
  parseGraphModelMigrationManifest,
  serializeGraphModelMigrationManifest,
} from '../../../../src/infrastructure/adapters/GraphModelMigrationManifestJsonAdapter.ts';

describe('GraphModelMigrationManifestJsonAdapter', () => {
  it('round-trips a valid manifest through JSON', () => {
    const manifest = fixtureManifest();
    const parsed = parseGraphModelMigrationManifest(serializeGraphModelMigrationManifest(manifest));

    expect(parsed.version.value).toBe(1);
    expect(parsed.sourceBasis.graphId).toBe('graph:source');
    expect(parsed.nodeMappings[0]?.targetNodeId).toBe('node:a');
    expect(parsed.warnings[0]?.code).toBe('W_DRY_RUN');
  });

  it('fails closed for malformed version fields', () => {
    expect(() => parseGraphModelMigrationManifest(`{
      "version": "1",
      "sourceBasis": { "graphId": "graph:source", "basisId": "basis:source" },
      "targetBasis": { "graphId": "graph:target", "basisId": "basis:target" },
      "nodeMappings": [],
      "edgeMappings": [],
      "propertyMappings": [],
      "contentMappings": [],
      "warnings": [],
      "fatalErrors": []
    }`)).toThrow(/version/);
  });

  it('lets domain construction reject duplicate mapping entries', () => {
    const duplicatedNodeMapping = `{
      "version": 1,
      "sourceBasis": { "graphId": "graph:source", "basisId": "basis:source" },
      "targetBasis": { "graphId": "graph:target", "basisId": "basis:target" },
      "nodeMappings": [
        { "legacyNodeId": "node:a", "targetNodeId": "node:a" },
        { "legacyNodeId": "node:a", "targetNodeId": "node:a-copy" }
      ],
      "edgeMappings": [],
      "propertyMappings": [],
      "contentMappings": [],
      "warnings": [],
      "fatalErrors": []
    }`;

    expect(() => parseGraphModelMigrationManifest(duplicatedNodeMapping))
      .toThrow(/duplicates legacy node mapping/);
  });

  it('serializes deterministically for a fixture manifest', () => {
    expect(serializeGraphModelMigrationManifest(fixtureManifest())).toBe(`{
  "version": 1,
  "sourceBasis": {
    "graphId": "graph:source",
    "basisId": "basis:source"
  },
  "targetBasis": {
    "graphId": "graph:target",
    "basisId": "basis:target"
  },
  "nodeMappings": [
    {
      "legacyNodeId": "node:a",
      "targetNodeId": "node:a"
    }
  ],
  "edgeMappings": [
    {
      "legacyEdgeId": "node:a\\u0000node:b\\u0000knows",
      "targetEdgeId": "edge:a"
    }
  ],
  "propertyMappings": [
    {
      "legacyOwnerId": "node:a",
      "legacyPropertyKey": "title",
      "targetOwnerId": "node:a",
      "targetPropertyKey": "title"
    }
  ],
  "contentMappings": [
    {
      "legacyContentKey": "node:a\\u0000_content",
      "targetAttachmentKey": "content-attachment:node:a\\u0000_content"
    }
  ],
  "warnings": [
    {
      "kind": "warning",
      "code": "W_DRY_RUN",
      "message": "dry-run only"
    }
  ],
  "fatalErrors": []
}
`);
  });

  it('identifies the failing field for malformed mapping entries', () => {
    const malformedNodeMapping = `{
      "version": 1,
      "sourceBasis": { "graphId": "graph:source", "basisId": "basis:source" },
      "targetBasis": { "graphId": "graph:target", "basisId": "basis:target" },
      "nodeMappings": [{ "targetNodeId": "node:a" }],
      "edgeMappings": [],
      "propertyMappings": [],
      "contentMappings": [],
      "warnings": [],
      "fatalErrors": []
    }`;

    expect(() => parseGraphModelMigrationManifest(malformedNodeMapping))
      .toThrow(/nodeMappings\[0\]\.legacyNodeId/);
  });
});

function fixtureManifest(): GraphModelMigrationManifest {
  return new GraphModelMigrationManifest({
    version: GraphModelMigrationManifestVersion.current(),
    sourceBasis: new GraphModelMigrationBasis({
      graphId: 'graph:source',
      basisId: 'basis:source',
    }),
    targetBasis: new GraphModelMigrationBasis({
      graphId: 'graph:target',
      basisId: 'basis:target',
    }),
    nodeMappings: [
      new GraphModelMigrationNodeMapping({
        legacyNodeId: 'node:a',
        targetNodeId: 'node:a',
      }),
    ],
    edgeMappings: [
      new GraphModelMigrationEdgeMapping({
        legacyEdgeId: 'node:a\0node:b\0knows',
        targetEdgeId: 'edge:a',
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
    contentMappings: [
      new GraphModelMigrationContentMapping({
        legacyContentKey: 'node:a\0_content',
        targetAttachmentKey: 'content-attachment:node:a\0_content',
      }),
    ],
    warnings: [GraphModelMigrationNotice.warning('W_DRY_RUN', 'dry-run only')],
    fatalErrors: [],
  });
}

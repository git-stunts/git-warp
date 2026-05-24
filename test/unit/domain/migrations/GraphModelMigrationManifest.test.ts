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

describe('GraphModelMigrationManifest', () => {
  it('requires explicit source and target basis', () => {
    expect(() => {
      new GraphModelMigrationManifest({
        version: GraphModelMigrationManifestVersion.current(),
        // @ts-expect-error exercising runtime validation
        sourceBasis: null,
        targetBasis: targetBasis(),
        nodeMappings: [],
        edgeMappings: [],
        propertyMappings: [],
        contentMappings: [],
        warnings: [],
        fatalErrors: [],
      });
    }).toThrow(/sourceBasis/);
    expect(() => {
      new GraphModelMigrationManifest({
        version: GraphModelMigrationManifestVersion.current(),
        sourceBasis: sourceBasis(),
        // @ts-expect-error exercising runtime validation
        targetBasis: undefined,
        nodeMappings: [],
        edgeMappings: [],
        propertyMappings: [],
        contentMappings: [],
        warnings: [],
        fatalErrors: [],
      });
    }).toThrow(/targetBasis/);
  });

  it('rejects duplicate legacy node mappings', () => {
    expect(() => createManifest({
      nodeMappings: [
        new GraphModelMigrationNodeMapping({
          legacyNodeId: 'node:a',
          targetNodeId: 'node:a',
        }),
        new GraphModelMigrationNodeMapping({
          legacyNodeId: 'node:a',
          targetNodeId: 'node:a-copy',
        }),
      ],
    })).toThrow(/duplicates legacy node mapping/);
  });

  it('rejects duplicate legacy edge mappings', () => {
    expect(() => createManifest({
      edgeMappings: [
        new GraphModelMigrationEdgeMapping({
          legacyEdgeId: 'node:a\0node:b\0knows',
          targetEdgeId: 'edge:a',
        }),
        new GraphModelMigrationEdgeMapping({
          legacyEdgeId: 'node:a\0node:b\0knows',
          targetEdgeId: 'edge:b',
        }),
      ],
    })).toThrow(/duplicates legacy edge mapping/);
  });

  it('keeps warnings and fatal errors distinct', () => {
    const warning = GraphModelMigrationNotice.warning('W_CONTENT_ALIAS', 'legacy content alias retained');
    const fatal = GraphModelMigrationNotice.fatal('E_MISSING_BASIS', 'source basis missing');
    const manifest = createManifest({
      warnings: [warning],
      fatalErrors: [fatal],
    });

    expect(manifest.warnings).toEqual([warning]);
    expect(manifest.fatalErrors).toEqual([fatal]);
    expect(manifest.hasFatalErrors()).toBe(true);
    expect(() => createManifest({ warnings: [fatal] })).toThrow(/wrong notice kind/);
    expect(() => createManifest({ fatalErrors: [warning] })).toThrow(/wrong notice kind/);
  });

  it('freezes manifest entries after construction', () => {
    const nodeMapping = new GraphModelMigrationNodeMapping({
      legacyNodeId: 'node:a',
      targetNodeId: 'node:a',
    });
    const manifest = createManifest({ nodeMappings: [nodeMapping] });

    expect(Object.isFrozen(manifest)).toBe(true);
    expect(Object.isFrozen(manifest.nodeMappings)).toBe(true);
    expect(manifest.nodeMappings).toEqual([nodeMapping]);
  });

  it('records all migration mapping sections', () => {
    const propertyMapping = new GraphModelMigrationPropertyMapping({
      legacyOwnerId: 'node:a',
      legacyPropertyKey: 'title',
      targetOwnerId: 'node:a',
      targetPropertyKey: 'title',
    });
    const contentMapping = new GraphModelMigrationContentMapping({
      legacyContentKey: 'node:a\0_content',
      targetAttachmentKey: 'node:a\0content',
    });
    const manifest = createManifest({
      propertyMappings: [propertyMapping],
      contentMappings: [contentMapping],
    });

    expect(manifest.propertyMappings).toEqual([propertyMapping]);
    expect(manifest.contentMappings).toEqual([contentMapping]);
  });
});

type ManifestOverrides = {
  readonly sourceBasis?: GraphModelMigrationBasis;
  readonly targetBasis?: GraphModelMigrationBasis;
  readonly nodeMappings?: readonly GraphModelMigrationNodeMapping[];
  readonly edgeMappings?: readonly GraphModelMigrationEdgeMapping[];
  readonly propertyMappings?: readonly GraphModelMigrationPropertyMapping[];
  readonly contentMappings?: readonly GraphModelMigrationContentMapping[];
  readonly warnings?: readonly GraphModelMigrationNotice[];
  readonly fatalErrors?: readonly GraphModelMigrationNotice[];
};

function createManifest(overrides: ManifestOverrides = {}): GraphModelMigrationManifest {
  return new GraphModelMigrationManifest({
    version: GraphModelMigrationManifestVersion.current(),
    sourceBasis: overrides.sourceBasis ?? sourceBasis(),
    targetBasis: overrides.targetBasis ?? targetBasis(),
    nodeMappings: overrides.nodeMappings ?? [],
    edgeMappings: overrides.edgeMappings ?? [],
    propertyMappings: overrides.propertyMappings ?? [],
    contentMappings: overrides.contentMappings ?? [],
    warnings: overrides.warnings ?? [],
    fatalErrors: overrides.fatalErrors ?? [],
  });
}

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

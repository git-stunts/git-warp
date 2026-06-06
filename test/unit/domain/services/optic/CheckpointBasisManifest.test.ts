import { describe, expect, it } from 'vitest';
import QueryError from '../../../../../src/domain/errors/QueryError.ts';
import CheckpointBasisManifest, {
  CheckpointBasisChunking,
  CheckpointBasisCompleteness,
  CheckpointBasisShardGeometry,
  CheckpointBasisShardRootMap,
  CheckpointBasisSupportPosture,
  type CheckpointBasisManifestOptions,
} from '../../../../../src/domain/services/optic/CheckpointBasisManifest.ts';
import { CURRENT_CHECKPOINT_SCHEMA } from '../../../../../src/domain/services/state/checkpointHelpers.ts';

const GRAPH_NAME = 'checkpoint-basis-manifest-test';
const CHECKPOINT_SHA = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const LIVENESS_OID = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const PROPERTY_OID = 'cccccccccccccccccccccccccccccccccccccccc';
const OUTGOING_OID = 'dddddddddddddddddddddddddddddddddddddddd';
const INCOMING_OID = 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
const EDGE_FACT_OID = 'ffffffffffffffffffffffffffffffffffffffff';

describe('CheckpointBasisManifest', () => {
  it('validates and freezes a manifest with separated basis and reading identities', () => {
    const manifest = new CheckpointBasisManifest(validManifestOptions());

    expect(manifest.schema).toBe(CURRENT_CHECKPOINT_SCHEMA);
    expect([...manifest.frontier.entries()]).toEqual([['writer-a', 'patch-a']]);
    expect(manifest.livenessRoots.get('meta_00.cbor')).toBe(LIVENESS_OID);
    expect(manifest.propertyRoots.get('props_00.cbor')).toBe(PROPERTY_OID);
    expect(manifest.provenancePosture.kind).toBe('unavailable');
    expect(manifest.contentAnchorPosture.kind).toBe('unavailable');
    expect(manifest.basisIdentity).toBe('basis:v18-gp4:checkpoint:001');
    expect(manifest.semanticReadingIdentity).toBe('reading:v18-gp4:node-property:node-a:title');
    expect(Object.isFrozen(manifest)).toBe(true);
  });

  it('rejects unsupported checkpoint schemas with a typed obstruction', () => {
    expectManifestError(
      () => new CheckpointBasisManifest({ ...validManifestOptions(), schema: CURRENT_CHECKPOINT_SCHEMA + 1 }),
      'schema',
      'unsupported-schema',
    );
  });

  it('rejects an empty frontier with a typed obstruction', () => {
    expectManifestError(
      () => new CheckpointBasisManifest({ ...validManifestOptions(), frontier: new Map() }),
      'frontier',
      'invalid-frontier',
    );
  });

  it('rejects missing required liveness roots with a typed obstruction', () => {
    expectManifestError(
      () => new CheckpointBasisManifest(validManifestOptionsWithoutLivenessRoots()),
      'livenessRoots',
      'missing-required-root',
    );
  });

  it('rejects missing required adjacency roots with a typed obstruction', () => {
    expectManifestError(
      () => new CheckpointBasisManifest(validManifestOptionsWithoutOutgoingAdjacencyRoots()),
      'outgoingAdjacencyRoots',
      'missing-required-root',
    );
  });

  it('rejects incomplete shard geometry with a typed obstruction', () => {
    expectManifestError(
      () => new CheckpointBasisManifest({
        ...validManifestOptions(),
        shardGeometry: new CheckpointBasisShardGeometry({
          layoutFamily: 'checkpoint-basis-shards',
          payloadLayout: 'basis-facts-v1',
          shardKeyStrategy: 'hex-prefix-2',
          shardCount: 1,
        }),
      }),
      'shardGeometry.shardCount',
      'incomplete-shard-geometry',
    );
  });

  it('rejects semantic read identity reuse of byte or root identity', () => {
    expectManifestError(
      () => new CheckpointBasisManifest({
        ...validManifestOptions(),
        semanticReadingIdentity: PROPERTY_OID,
      }),
      'semanticReadingIdentity',
      'semantic-identity-collides-with-byte-identity',
    );
  });
});

function validManifestOptions(): CheckpointBasisManifestOptions {
  return {
    schema: CURRENT_CHECKPOINT_SCHEMA,
    graphName: GRAPH_NAME,
    checkpointSha: CHECKPOINT_SHA,
    frontier: new Map([['writer-a', 'patch-a']]),
    appliedVersionVector: new Map([['writer-a', 1]]),
    basisIdentity: 'basis:v18-gp4:checkpoint:001',
    semanticReadingIdentity: 'reading:v18-gp4:node-property:node-a:title',
    livenessRoots: rootMap('node-liveness', 'meta_00.cbor', LIVENESS_OID),
    propertyRoots: rootMap('node-property', 'props_00.cbor', PROPERTY_OID),
    outgoingAdjacencyRoots: rootMap('outgoing-adjacency', 'fwd_00.cbor', OUTGOING_OID),
    incomingAdjacencyRoots: rootMap('incoming-adjacency', 'rev_00.cbor', INCOMING_OID),
    edgeFactRoots: rootMap('edge-fact', 'edge_00.cbor', EDGE_FACT_OID),
    provenancePosture: CheckpointBasisSupportPosture.unavailable('not-yet-indexed'),
    contentAnchorPosture: CheckpointBasisSupportPosture.unavailable('not-yet-indexed'),
    shardGeometry: new CheckpointBasisShardGeometry({
      layoutFamily: 'checkpoint-basis-shards',
      payloadLayout: 'basis-facts-v1',
      shardKeyStrategy: 'hex-prefix-2',
      shardCount: 5,
    }),
    chunking: new CheckpointBasisChunking({
      maxFactsPerShard: 128,
      chunkCount: 1,
    }),
    completeness: CheckpointBasisCompleteness.complete(),
  };
}

function validManifestOptionsWithoutLivenessRoots(): CheckpointBasisManifestOptions {
  return {
    schema: CURRENT_CHECKPOINT_SCHEMA,
    graphName: GRAPH_NAME,
    checkpointSha: CHECKPOINT_SHA,
    frontier: new Map([['writer-a', 'patch-a']]),
    appliedVersionVector: new Map([['writer-a', 1]]),
    basisIdentity: 'basis:v18-gp4:checkpoint:001',
    semanticReadingIdentity: 'reading:v18-gp4:node-property:node-a:title',
    propertyRoots: rootMap('node-property', 'props_00.cbor', PROPERTY_OID),
    outgoingAdjacencyRoots: rootMap('outgoing-adjacency', 'fwd_00.cbor', OUTGOING_OID),
    incomingAdjacencyRoots: rootMap('incoming-adjacency', 'rev_00.cbor', INCOMING_OID),
    edgeFactRoots: rootMap('edge-fact', 'edge_00.cbor', EDGE_FACT_OID),
    provenancePosture: CheckpointBasisSupportPosture.unavailable('not-yet-indexed'),
    contentAnchorPosture: CheckpointBasisSupportPosture.unavailable('not-yet-indexed'),
    shardGeometry: new CheckpointBasisShardGeometry({
      layoutFamily: 'checkpoint-basis-shards',
      payloadLayout: 'basis-facts-v1',
      shardKeyStrategy: 'hex-prefix-2',
      shardCount: 5,
    }),
    chunking: new CheckpointBasisChunking({ maxFactsPerShard: 128, chunkCount: 1 }),
    completeness: CheckpointBasisCompleteness.complete(),
  };
}

function validManifestOptionsWithoutOutgoingAdjacencyRoots(): CheckpointBasisManifestOptions {
  return {
    schema: CURRENT_CHECKPOINT_SCHEMA,
    graphName: GRAPH_NAME,
    checkpointSha: CHECKPOINT_SHA,
    frontier: new Map([['writer-a', 'patch-a']]),
    appliedVersionVector: new Map([['writer-a', 1]]),
    basisIdentity: 'basis:v18-gp4:checkpoint:001',
    semanticReadingIdentity: 'reading:v18-gp4:node-property:node-a:title',
    livenessRoots: rootMap('node-liveness', 'meta_00.cbor', LIVENESS_OID),
    propertyRoots: rootMap('node-property', 'props_00.cbor', PROPERTY_OID),
    incomingAdjacencyRoots: rootMap('incoming-adjacency', 'rev_00.cbor', INCOMING_OID),
    edgeFactRoots: rootMap('edge-fact', 'edge_00.cbor', EDGE_FACT_OID),
    provenancePosture: CheckpointBasisSupportPosture.unavailable('not-yet-indexed'),
    contentAnchorPosture: CheckpointBasisSupportPosture.unavailable('not-yet-indexed'),
    shardGeometry: new CheckpointBasisShardGeometry({
      layoutFamily: 'checkpoint-basis-shards',
      payloadLayout: 'basis-facts-v1',
      shardKeyStrategy: 'hex-prefix-2',
      shardCount: 5,
    }),
    chunking: new CheckpointBasisChunking({ maxFactsPerShard: 128, chunkCount: 1 }),
    completeness: CheckpointBasisCompleteness.complete(),
  };
}

function rootMap(
  family: 'node-liveness' | 'node-property' | 'outgoing-adjacency' | 'incoming-adjacency' | 'edge-fact',
  path: string,
  oid: string,
): CheckpointBasisShardRootMap {
  return new CheckpointBasisShardRootMap({
    family,
    roots: new Map([[path, oid]]),
  });
}

function expectManifestError(
  run: () => CheckpointBasisManifest,
  field: string,
  reason: string,
): void {
  expect(run).toThrow(QueryError);
  try {
    run();
  } catch (error) {
    expect(error).toMatchObject({
      code: 'E_CHECKPOINT_BASIS_MANIFEST',
      context: { field, reason },
    });
    return;
  }
  throw new Error('expected manifest validation failure');
}

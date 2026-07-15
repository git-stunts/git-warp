import { describe, expect, it } from 'vitest';
import CheckpointBasisManifest, {
  CheckpointBasisChunking,
  CheckpointBasisCompleteness,
  CheckpointBasisShardGeometry,
  CheckpointBasisShardRootMap,
  CheckpointBasisSupportPosture,
} from '../../../../../src/domain/services/optic/CheckpointBasisManifest.ts';
import CheckpointTailReadIdentityBuilder from '../../../../../src/domain/services/optic/CheckpointTailReadIdentityBuilder.ts';
import type { CheckpointTailIndexBasis } from '../../../../../src/domain/services/optic/CheckpointTailBasisLoader.ts';

describe('CheckpointTailReadIdentityBuilder', () => {
  it('encodes neighborhood labels without aliasing commas or the empty-label marker', () => {
    const builder = new CheckpointTailReadIdentityBuilder({ worldline: 'identity-test' });
    const basis = indexBasis();

    const allLabels = builder.neighborhood({
      basis,
      nodeId: 'node:a',
      direction: 'out',
      labels: [],
      checkpointIndexShards: [],
      tailWitnesses: [],
    });
    const literalMarker = builder.neighborhood({
      basis,
      nodeId: 'node:a',
      direction: 'out',
      labels: ['all-labels'],
      checkpointIndexShards: [],
      tailWitnesses: [],
    });
    const twoLabels = builder.neighborhood({
      basis,
      nodeId: 'node:a',
      direction: 'out',
      labels: ['a', 'b'],
      checkpointIndexShards: [],
      tailWitnesses: [],
    });
    const commaLabel = builder.neighborhood({
      basis,
      nodeId: 'node:a',
      direction: 'out',
      labels: ['a,b'],
      checkpointIndexShards: [],
      tailWitnesses: [],
    });

    expect(new Set([
      allLabels.entityAspect,
      literalMarker.entityAspect,
      twoLabels.entityAspect,
      commaLabel.entityAspect,
    ]).size).toBe(4);
  });
});

function indexBasis(): CheckpointTailIndexBasis {
  return {
    checkpointSha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    schema: 5,
    frontier: new Map([['writer-a', 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb']]),
    manifest: manifest(),
    indexHandles: {},
    propHandles: {},
  };
}

function manifest(): CheckpointBasisManifest {
  const frontier = new Map([['writer-a', 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb']]);
  return new CheckpointBasisManifest({
    schema: 5,
    graphName: 'identity-test',
    checkpointSha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    frontier,
    appliedVersionVector: new Map([['writer-a', 1]]),
    basisIdentity: 'basis:identity-test',
    semanticReadingIdentity: 'reading:identity-test',
    livenessRoots: rootMap('node-liveness'),
    propertyRoots: rootMap('node-property'),
    outgoingAdjacencyRoots: rootMap('outgoing-adjacency'),
    incomingAdjacencyRoots: rootMap('incoming-adjacency'),
    edgeFactRoots: rootMap('edge-fact'),
    provenancePosture: CheckpointBasisSupportPosture.unavailable('not-indexed'),
    contentAnchorPosture: CheckpointBasisSupportPosture.unavailable('not-indexed'),
    shardGeometry: new CheckpointBasisShardGeometry({
      layoutFamily: 'checkpoint-tail-index-shards',
      payloadLayout: 'checkpoint-schema-5-index',
      shardKeyStrategy: 'hex-prefix-2',
      shardCount: 5,
    }),
    chunking: new CheckpointBasisChunking({ maxFactsPerShard: 5, chunkCount: 1 }),
    completeness: CheckpointBasisCompleteness.complete(),
  });
}

function rootMap(
  family: 'node-liveness' | 'node-property' | 'outgoing-adjacency' | 'incoming-adjacency' | 'edge-fact',
): CheckpointBasisShardRootMap {
  return new CheckpointBasisShardRootMap({
    family,
    roots: new Map([[`${family}.cbor`, `${family}:oid`]]),
  });
}

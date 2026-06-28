import { describe, expect, it } from 'vitest';
import CheckpointBasisManifest, {
  CheckpointBasisChunking,
  CheckpointBasisCompleteness,
  CheckpointBasisShardGeometry,
  CheckpointBasisShardRootMap,
  CheckpointBasisSupportPosture,
} from '../../../../../src/domain/services/optic/CheckpointBasisManifest.ts';
import CheckpointShardFactReader from '../../../../../src/domain/services/optic/CheckpointShardFactReader.ts';
import CheckpointTailOpticSource, {
  type CheckpointTailCheckpointFrontier,
  type CheckpointTailPatchEntry,
} from '../../../../../src/domain/services/optic/CheckpointTailOpticSource.ts';
import type { CheckpointTailIndexBasis } from '../../../../../src/domain/services/optic/CheckpointTailBasisLoader.ts';
import { DEFAULT_COMMIT_MESSAGE_CODEC } from '../../../../../src/infrastructure/adapters/TrailerCommitMessageCodecAdapter.ts';
import { shardToEntry } from '../../../../../src/domain/services/MaterializedViewHelpers.ts';
import LogicalBitmapIndexBuilder from '../../../../../src/domain/services/index/LogicalBitmapIndexBuilder.ts';
import { CURRENT_CHECKPOINT_SCHEMA } from '../../../../../src/domain/services/state/checkpointHelpers.ts';
import { EdgeShard } from '../../../../../src/domain/artifacts/EdgeShard.ts';
import { MetaShard } from '../../../../../src/domain/artifacts/MetaShard.ts';
import defaultCodec from '../../../../../src/domain/utils/defaultCodec.ts';
import computeShardKey from '../../../../../src/domain/utils/shardKey.ts';
import InMemoryGraphAdapter from '../../../../../src/infrastructure/adapters/InMemoryGraphAdapter.ts';
import type BlobStoragePort from '../../../../../src/ports/BlobStoragePort.ts';
import type CodecPort from '../../../../../src/ports/CodecPort.ts';
import type CommitMessageCodecPort from '../../../../../src/ports/CommitMessageCodecPort.ts';
import type { CorePersistence } from '../../../../../src/domain/types/WarpPersistence.ts';

const NODE_ID = 'node:manifest-backed';
const PROPERTY_KEY = 'title';
const PROPERTY_VALUE = 'manifest-backed value';
const CHECKPOINT_SHA = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const NEIGHBOR_ID = 'node:manifest-neighbor';
const EDGE_LABEL = 'owns';

describe('CheckpointShardFactReader manifest-backed routing', () => {
  it('reads node liveness and properties from manifest roots instead of loose legacy maps', async () => {
    const persistence = new InMemoryGraphAdapter();
    const metaPath = `meta_${computeShardKey(NODE_ID)}.cbor`;
    const propPath = `props_${computeShardKey(NODE_ID)}.cbor`;
    const metaOid = await persistence.writeBlob(metaShardBytes(NODE_ID));
    const propOid = await persistence.writeBlob(defaultCodec.encode([
      [NODE_ID, { [PROPERTY_KEY]: PROPERTY_VALUE }],
    ]));
    const source = new ManifestShardSource(persistence);
    const basis = manifestBasis({
      livenessRoots: new Map([[metaPath, metaOid]]),
      propertyRoots: new Map([[propPath, propOid]]),
    });
    const reader = new CheckpointShardFactReader({ source });

    await expect(reader.readNodeAlive(basis, NODE_ID)).resolves.toBe(true);
    await expect(reader.readProperty(basis, NODE_ID, PROPERTY_KEY)).resolves.toBe(PROPERTY_VALUE);
    expect(reader.nodeLivenessShardIdentities(basis, NODE_ID)).toEqual([{ path: metaPath, oid: metaOid }]);
    expect(reader.propertyShardIdentities(basis, NODE_ID)).toEqual([{ path: propPath, oid: propOid }]);
  });

  it('fails closed when a manifest-backed property shard is missing', async () => {
    const persistence = new InMemoryGraphAdapter();
    const propPath = `props_${computeShardKey(NODE_ID)}.cbor`;
    const source = new ManifestShardSource(persistence);
    const basis = manifestBasis({
      livenessRoots: new Map(),
      propertyRoots: new Map([[propPath, 'deadbeef']]),
    });
    const reader = new CheckpointShardFactReader({ source });

    await expect(reader.readProperty(basis, NODE_ID, PROPERTY_KEY)).rejects.toMatchObject({
      code: 'E_OPTIC_NO_BOUNDED_BASIS',
      context: {
        reason: 'checkpoint-shard-unavailable',
        path: propPath,
        oid: 'deadbeef',
      },
    });
  });

  it('does not read unrelated liveness shards for a local neighborhood', async () => {
    const persistence = new InMemoryGraphAdapter();
    const sourceMetaPath = `meta_${computeShardKey(NODE_ID)}.cbor`;
    const neighborMetaPath = `meta_${computeShardKey(NEIGHBOR_ID)}.cbor`;
    const unrelatedMetaPath = 'meta_unrelated.cbor';
    const outgoingPath = `fwd_${computeShardKey(NODE_ID)}.cbor`;
    const labelsPath = 'labels.cbor';
    const sourceMetaOid = await persistence.writeBlob(metaShardBytes(NODE_ID));
    const neighborMetaOid = await persistence.writeBlob(metaShardBytes(NEIGHBOR_ID));
    const outgoingOid = await persistence.writeBlob(neighborhoodShardBytes());
    const labelsOid = await persistence.writeBlob(defaultCodec.encode([[EDGE_LABEL, 0]]));
    const source = new ManifestShardSource(persistence);
    const basis = manifestBasis({
      livenessRoots: new Map([
        [sourceMetaPath, sourceMetaOid],
        [neighborMetaPath, neighborMetaOid],
        [unrelatedMetaPath, 'deadbeef'],
      ]),
      propertyRoots: new Map(),
      outgoingAdjacencyRoots: new Map([[outgoingPath, outgoingOid]]),
      edgeFactRoots: new Map([[labelsPath, labelsOid]]),
    });
    const reader = new CheckpointShardFactReader({ source });

    await expect(reader.readNeighborhood(basis, {
      nodeId: NODE_ID,
      direction: 'out',
      labels: [],
    })).resolves.toEqual([
      Object.freeze({
        direction: 'out',
        neighborId: NEIGHBOR_ID,
        label: EDGE_LABEL,
      }),
    ]);
  });
});

class ManifestShardSource extends CheckpointTailOpticSource {
  readonly graphName = 'manifest-backed-shard-reader-test';
  readonly _persistence: CorePersistence;
  readonly _codec: CodecPort = defaultCodec;
  readonly _blobStorage: BlobStoragePort | null = null;
  readonly _commitMessageCodec: CommitMessageCodecPort = DEFAULT_COMMIT_MESSAGE_CODEC;

  constructor(persistence: CorePersistence) {
    super();
    this._persistence = persistence;
  }

  discoverWriters(): Promise<string[]> {
    return Promise.resolve([]);
  }

  _readCheckpointSha(): Promise<string | null> {
    return Promise.resolve(CHECKPOINT_SHA);
  }

  _loadPatchChainFromSha(): Promise<CheckpointTailPatchEntry[]> {
    return Promise.resolve([]);
  }

  _loadWriterPatches(): Promise<CheckpointTailPatchEntry[]> {
    return Promise.resolve([]);
  }

  _validatePatchAgainstCheckpoint(
    _writerId: string,
    _incomingSha: string,
    _checkpoint: CheckpointTailCheckpointFrontier | null | undefined,
  ): Promise<void> {
    return Promise.resolve();
  }
}

function manifestBasis(options: {
  readonly livenessRoots: Map<string, string>;
  readonly propertyRoots: Map<string, string>;
  readonly outgoingAdjacencyRoots?: Map<string, string>;
  readonly incomingAdjacencyRoots?: Map<string, string>;
  readonly edgeFactRoots?: Map<string, string>;
}): CheckpointTailIndexBasis {
  const frontier = new Map([['writer-a', 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb']]);
  const outgoingAdjacencyRoots = options.outgoingAdjacencyRoots ?? new Map();
  const incomingAdjacencyRoots = options.incomingAdjacencyRoots ?? new Map();
  const edgeFactRoots = options.edgeFactRoots ?? new Map();
  const shardCount = Math.max(
    1,
    options.livenessRoots.size
      + options.propertyRoots.size
      + outgoingAdjacencyRoots.size
      + incomingAdjacencyRoots.size
      + edgeFactRoots.size,
  );
  return {
    checkpointSha: CHECKPOINT_SHA,
    schema: CURRENT_CHECKPOINT_SCHEMA,
    frontier,
    manifest: new CheckpointBasisManifest({
      schema: CURRENT_CHECKPOINT_SCHEMA,
      graphName: 'manifest-backed-shard-reader-test',
      checkpointSha: CHECKPOINT_SHA,
      frontier,
      appliedVersionVector: new Map([['writer-a', 1]]),
      basisIdentity: 'basis:manifest-backed-shard-reader-test',
      semanticReadingIdentity: 'reading:manifest-backed-shard-reader-test:node-property',
      livenessRoots: new CheckpointBasisShardRootMap({
        family: 'node-liveness',
        roots: options.livenessRoots,
      }),
      propertyRoots: new CheckpointBasisShardRootMap({
        family: 'node-property',
        roots: options.propertyRoots,
      }),
      outgoingAdjacencyRoots: new CheckpointBasisShardRootMap({
        family: 'outgoing-adjacency',
        roots: outgoingAdjacencyRoots,
      }),
      incomingAdjacencyRoots: new CheckpointBasisShardRootMap({
        family: 'incoming-adjacency',
        roots: incomingAdjacencyRoots,
      }),
      edgeFactRoots: new CheckpointBasisShardRootMap({
        family: 'edge-fact',
        roots: edgeFactRoots,
      }),
      provenancePosture: CheckpointBasisSupportPosture.unavailable('not-indexed'),
      contentAnchorPosture: CheckpointBasisSupportPosture.unavailable('not-indexed'),
      shardGeometry: new CheckpointBasisShardGeometry({
        layoutFamily: 'checkpoint-tail-index-shards',
        payloadLayout: 'checkpoint-schema-5-index',
        shardKeyStrategy: 'hex-prefix-2',
        shardCount,
      }),
      chunking: new CheckpointBasisChunking({ maxFactsPerShard: shardCount, chunkCount: 1 }),
      completeness: CheckpointBasisCompleteness.complete(),
    }),
    indexOids: {},
    propOids: {},
  };
}

function metaShardBytes(nodeId: string): Uint8Array {
  const builder = new LogicalBitmapIndexBuilder();
  builder.registerNode(nodeId);
  builder.markAlive(nodeId);
  for (const shard of builder.yieldShards()) {
    if (shard instanceof MetaShard) {
      return defaultCodec.encode(shardToEntry(shard).payload);
    }
  }
  throw new Error('expected logical index builder to emit a meta shard');
}

function neighborhoodShardBytes(): Uint8Array {
  const builder = new LogicalBitmapIndexBuilder();
  builder.registerNode(NODE_ID);
  builder.registerNode(NEIGHBOR_ID);
  builder.registerLabel(EDGE_LABEL);
  builder.addEdge(NODE_ID, NEIGHBOR_ID, EDGE_LABEL);
  for (const shard of builder.yieldShards()) {
    if (shard instanceof EdgeShard && shard.direction === 'fwd') {
      return defaultCodec.encode(shardToEntry(shard).payload);
    }
  }
  throw new Error('expected logical index builder to emit an adjacency shard');
}

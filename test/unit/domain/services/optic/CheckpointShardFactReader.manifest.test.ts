import { describe, expect, it } from 'vitest';

import { EdgeShard } from '../../../../../src/domain/artifacts/EdgeShard.ts';
import { MetaShard } from '../../../../../src/domain/artifacts/MetaShard.ts';
import { shardToEntry } from '../../../../../src/domain/services/MaterializedViewHelpers.ts';
import LogicalBitmapIndexBuilder from '../../../../../src/domain/services/index/LogicalBitmapIndexBuilder.ts';
import CheckpointBasisManifest, {
  CheckpointBasisChunking,
  CheckpointBasisCompleteness,
  CheckpointBasisShardGeometry,
  CheckpointBasisShardRootMap,
  CheckpointBasisSupportPosture,
} from '../../../../../src/domain/services/optic/CheckpointBasisManifest.ts';
import CheckpointShardFactReader from '../../../../../src/domain/services/optic/CheckpointShardFactReader.ts';
import type { CheckpointTailIndexBasis } from '../../../../../src/domain/services/optic/CheckpointTailBasisLoader.ts';
import CheckpointTailOpticSource, {
  type CheckpointTailCheckpointFrontier,
  type CheckpointTailPatchEntry,
} from '../../../../../src/domain/services/optic/CheckpointTailOpticSource.ts';
import { CURRENT_CHECKPOINT_SCHEMA } from '../../../../../src/domain/services/state/checkpointHelpers.ts';
import AssetHandle from '../../../../../src/domain/storage/AssetHandle.ts';
import type CodecValue from '../../../../../src/domain/types/codec/CodecValue.ts';
import computeShardKey from '../../../../../src/domain/utils/shardKey.ts';
import defaultCodec from '../../../../../src/infrastructure/codecs/CborCodec.ts';
import type CodecPort from '../../../../../src/ports/CodecPort.ts';
import InMemoryCheckpointStore from '../../../../helpers/InMemoryCheckpointStore.ts';
import MockIndexStorage from '../../../../helpers/MockIndexStorage.ts';

const NODE_ID = 'node:manifest-backed';
const PROPERTY_KEY = 'title';
const PROPERTY_VALUE = 'manifest-backed value';
const CHECKPOINT_SHA = 'a'.repeat(40);
const NEIGHBOR_ID = 'node:manifest-neighbor';
const EDGE_LABEL = 'owns';

describe('CheckpointShardFactReader manifest-backed routing', () => {
  it('reads liveness and properties through their manifest-selected asset handles', async () => {
    const indexStore = new MockIndexStorage();
    const metaPath = `meta_${computeShardKey(NODE_ID)}.cbor`;
    const propPath = `props_${computeShardKey(NODE_ID)}.cbor`;
    const metaHandle = await indexStore.writeBlob(metaShardBytes(NODE_ID));
    const propHandle = await indexStore.writeBlob(defaultCodec.encode([
      [NODE_ID, { [PROPERTY_KEY]: PROPERTY_VALUE }],
    ]));
    const source = new ManifestShardSource(indexStore);
    const basis = manifestBasis({
      livenessRoots: new Map([[metaPath, metaHandle]]),
      propertyRoots: new Map([[propPath, propHandle]]),
    });
    const reader = new CheckpointShardFactReader({ source });

    await expect(reader.readNodeAlive(basis, NODE_ID)).resolves.toBe(true);
    await expect(reader.readProperty(basis, NODE_ID, PROPERTY_KEY)).resolves.toBe(PROPERTY_VALUE);
    expect(reader.nodeLivenessShardIdentities(basis, NODE_ID)).toEqual([
      { path: metaPath, oid: metaHandle.toString() },
    ]);
    expect(reader.propertyShardIdentities(basis, NODE_ID)).toEqual([
      { path: propPath, oid: propHandle.toString() },
    ]);
    expect(indexStore.decodedShardHandles).toEqual([
      metaHandle.toString(),
      propHandle.toString(),
    ]);
    expect(indexStore.openedShardHandles).toEqual([]);
  });

  it('fails closed when a manifest-backed property asset is missing', async () => {
    const indexStore = new MockIndexStorage();
    const propPath = `props_${computeShardKey(NODE_ID)}.cbor`;
    const missingHandle = new AssetHandle('test-index-shard:missing');
    const source = new ManifestShardSource(indexStore);
    const basis = manifestBasis({
      livenessRoots: new Map<string, AssetHandle>(),
      propertyRoots: new Map([[propPath, missingHandle]]),
    });
    const reader = new CheckpointShardFactReader({ source });

    await expect(reader.readProperty(basis, NODE_ID, PROPERTY_KEY)).rejects.toMatchObject({
      code: 'E_OPTIC_NO_BOUNDED_BASIS',
      context: {
        reason: 'checkpoint-shard-unavailable',
        path: propPath,
        oid: missingHandle.toString(),
      },
    });
  });

  it('fails closed when a manifest-backed liveness asset is missing', async () => {
    const indexStore = new MockIndexStorage();
    const metaPath = `meta_${computeShardKey(NODE_ID)}.cbor`;
    const missingHandle = new AssetHandle('test-index-shard:missing-liveness');
    const source = new ManifestShardSource(indexStore);
    const basis = manifestBasis({
      livenessRoots: new Map([[metaPath, missingHandle]]),
      propertyRoots: new Map<string, AssetHandle>(),
    });
    const reader = new CheckpointShardFactReader({ source });

    await expect(reader.readNodeAlive(basis, NODE_ID)).rejects.toMatchObject({
      code: 'E_OPTIC_NO_BOUNDED_BASIS',
      context: {
        reason: 'checkpoint-shard-unavailable',
        path: metaPath,
        oid: missingHandle.toString(),
      },
    });
  });

  it('preserves non-Error shard decode failures without misclassifying them', async () => {
    const indexStore = new NonErrorDecodeIndexStorage();
    const metaPath = `meta_${computeShardKey(NODE_ID)}.cbor`;
    const propPath = `props_${computeShardKey(NODE_ID)}.cbor`;
    const metaHandle = await indexStore.writeBlob(metaShardBytes(NODE_ID));
    const propHandle = await indexStore.writeBlob(defaultCodec.encode([]));
    const source = new ManifestShardSource(indexStore);
    const basis = manifestBasis({
      livenessRoots: new Map([[metaPath, metaHandle]]),
      propertyRoots: new Map([[propPath, propHandle]]),
    });
    const reader = new CheckpointShardFactReader({ source });

    await expect(reader.readNodeAlive(basis, NODE_ID)).rejects.toBe('decode-failure');
    await expect(reader.readProperty(basis, NODE_ID, PROPERTY_KEY)).rejects.toBe('decode-failure');
  });

  it('preserves non-Error neighborhood stream failures without misclassifying them', async () => {
    const indexStore = new NonErrorOpenIndexStorage();
    const metaPath = `meta_${computeShardKey(NODE_ID)}.cbor`;
    const metaHandle = await indexStore.writeBlob(metaShardBytes(NODE_ID));
    const source = new ManifestShardSource(indexStore);
    const basis = manifestBasis({
      livenessRoots: new Map([[metaPath, metaHandle]]),
      propertyRoots: new Map<string, AssetHandle>(),
    });
    const reader = new CheckpointShardFactReader({ source });

    await expect(reader.readNeighborhood(basis, {
      nodeId: NODE_ID,
      direction: 'out',
      labels: [],
    })).rejects.toBe('open-failure');
  });

  it('fails closed before opening a shard whose manifest and basis handles differ', async () => {
    const indexStore = new MockIndexStorage();
    const path = `meta_${computeShardKey(NODE_ID)}.cbor`;
    const manifestHandle = await indexStore.writeBlob(metaShardBytes(NODE_ID));
    const differentHandle = await indexStore.writeBlob(metaShardBytes('node:different'));
    const source = new ManifestShardSource(indexStore);
    const basis = manifestBasis({
      livenessRoots: new Map([[path, manifestHandle]]),
      propertyRoots: new Map<string, AssetHandle>(),
    });
    const mismatchedBasis: CheckpointTailIndexBasis = {
      ...basis,
      indexHandles: Object.freeze({ ...basis.indexHandles, [path]: differentHandle }),
    };
    const reader = new CheckpointShardFactReader({ source });

    await expect(reader.readNodeAlive(mismatchedBasis, NODE_ID)).rejects.toMatchObject({
      code: 'E_OPTIC_NO_BOUNDED_BASIS',
      context: {
        reason: 'checkpoint-shard-invalid',
        path,
        manifestHandle: manifestHandle.toString(),
        basisHandle: differentHandle.toString(),
      },
    });
    expect(indexStore.openedShardHandles).toEqual([]);
    expect(indexStore.decodedShardHandles).toEqual([]);
  });

  it('fails closed when a manifest root has no corresponding basis handle', async () => {
    const indexStore = new MockIndexStorage();
    const path = `meta_${computeShardKey(NODE_ID)}.cbor`;
    const manifestHandle = await indexStore.writeBlob(metaShardBytes(NODE_ID));
    const source = new ManifestShardSource(indexStore);
    const basis = manifestBasis({
      livenessRoots: new Map([[path, manifestHandle]]),
      propertyRoots: new Map<string, AssetHandle>(),
    });
    const missingBasisHandle: CheckpointTailIndexBasis = {
      ...basis,
      indexHandles: Object.freeze({}),
    };
    const reader = new CheckpointShardFactReader({ source });

    await expect(reader.readNodeAlive(missingBasisHandle, NODE_ID)).rejects.toMatchObject({
      code: 'E_OPTIC_NO_BOUNDED_BASIS',
      context: {
        reason: 'checkpoint-shard-invalid',
        path,
        manifestHandle: manifestHandle.toString(),
        basisHandle: null,
      },
    });
  });

  it('streams only the causal support shards needed for a local neighborhood', async () => {
    const indexStore = new MockIndexStorage();
    const sourceMetaPath = `meta_${computeShardKey(NODE_ID)}.cbor`;
    const neighborMetaPath = `meta_${computeShardKey(NEIGHBOR_ID)}.cbor`;
    const unrelatedMetaPath = 'meta_unrelated.cbor';
    const outgoingPath = `fwd_${computeShardKey(NODE_ID)}.cbor`;
    const labelsPath = 'labels.cbor';
    const sourceMetaHandle = await indexStore.writeBlob(metaShardBytes(NODE_ID));
    const neighborMetaHandle = await indexStore.writeBlob(metaShardBytes(NEIGHBOR_ID));
    const unrelatedMetaHandle = await indexStore.writeBlob(metaShardBytes('node:unrelated'));
    const outgoingHandle = await indexStore.writeBlob(neighborhoodShardBytes());
    const labelsHandle = await indexStore.writeBlob(defaultCodec.encode([[EDGE_LABEL, 0]]));
    const source = new ManifestShardSource(indexStore);
    const basis = manifestBasis({
      livenessRoots: new Map([
        [sourceMetaPath, sourceMetaHandle],
        [neighborMetaPath, neighborMetaHandle],
        [unrelatedMetaPath, unrelatedMetaHandle],
      ]),
      propertyRoots: new Map<string, AssetHandle>(),
      outgoingAdjacencyRoots: new Map([[outgoingPath, outgoingHandle]]),
      edgeFactRoots: new Map([[labelsPath, labelsHandle]]),
    });
    const reader = new CheckpointShardFactReader({ source });

    const result = await reader.readNeighborhood(basis, {
      nodeId: NODE_ID,
      direction: 'out',
      labels: [],
    });

    expect(result).toEqual({
      cursor: null,
      edges: [{
        direction: 'out',
        neighborId: NEIGHBOR_ID,
        label: EDGE_LABEL,
      }],
      resumeCursors: [null],
      checkpointIndexShards: [
        { path: sourceMetaPath, oid: sourceMetaHandle.toString() },
        { path: neighborMetaPath, oid: neighborMetaHandle.toString() },
        { path: outgoingPath, oid: outgoingHandle.toString() },
        { path: labelsPath, oid: labelsHandle.toString() },
      ].sort((left, right) => left.path.localeCompare(right.path)),
    });
    expect([...new Set(indexStore.openedShardHandles)].sort()).toEqual([
      sourceMetaHandle.toString(),
      neighborMetaHandle.toString(),
      outgoingHandle.toString(),
      labelsHandle.toString(),
    ].sort());
    expect(indexStore.openedShardHandles).not.toContain(unrelatedMetaHandle.toString());
    expect(indexStore.decodedShardHandles).toEqual([]);
  });
});

class ManifestShardSource extends CheckpointTailOpticSource {
  readonly graphName = 'manifest-backed-shard-reader-test';
  readonly _codec: CodecPort = defaultCodec;
  readonly _checkpointStore = new InMemoryCheckpointStore();
  readonly _indexStore: MockIndexStorage;

  constructor(indexStore: MockIndexStorage) {
    super();
    this._indexStore = indexStore;
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

class NonErrorDecodeIndexStorage extends MockIndexStorage {
  override decodeShard<TDecoded extends CodecValue = CodecValue>(): Promise<TDecoded> {
    return Promise.reject('decode-failure');
  }
}

class NonErrorOpenIndexStorage extends MockIndexStorage {
  override async *openShard(): AsyncIterable<Uint8Array> {
    yield await Promise.reject<Uint8Array>('open-failure');
  }
}

type HandleMap = Map<string, AssetHandle>;

function manifestBasis(options: {
  readonly livenessRoots: HandleMap;
  readonly propertyRoots: HandleMap;
  readonly outgoingAdjacencyRoots?: HandleMap;
  readonly incomingAdjacencyRoots?: HandleMap;
  readonly edgeFactRoots?: HandleMap;
}): CheckpointTailIndexBasis {
  const frontier = new Map([['writer-a', 'b'.repeat(40)]]);
  const outgoingAdjacencyRoots = options.outgoingAdjacencyRoots ?? new Map<string, AssetHandle>();
  const incomingAdjacencyRoots = options.incomingAdjacencyRoots ?? new Map<string, AssetHandle>();
  const edgeFactRoots = options.edgeFactRoots ?? new Map<string, AssetHandle>();
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
      livenessRoots: rootMap('node-liveness', options.livenessRoots),
      propertyRoots: rootMap('node-property', options.propertyRoots),
      outgoingAdjacencyRoots: rootMap('outgoing-adjacency', outgoingAdjacencyRoots),
      incomingAdjacencyRoots: rootMap('incoming-adjacency', incomingAdjacencyRoots),
      edgeFactRoots: rootMap('edge-fact', edgeFactRoots),
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
    indexHandles: handleRecord(
      options.livenessRoots,
      outgoingAdjacencyRoots,
      incomingAdjacencyRoots,
      edgeFactRoots,
    ),
    propHandles: handleRecord(options.propertyRoots),
  };
}

function rootMap(
  family: 'node-liveness' | 'node-property' | 'outgoing-adjacency' | 'incoming-adjacency' | 'edge-fact',
  handles: HandleMap,
): CheckpointBasisShardRootMap {
  return new CheckpointBasisShardRootMap({
    family,
    roots: new Map([...handles].map(([path, handle]) => [path, handle.toString()])),
  });
}

function handleRecord(...maps: readonly HandleMap[]): Readonly<Record<string, AssetHandle>> {
  return Object.freeze(Object.fromEntries(maps.flatMap((handles) => [...handles])));
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

import type { CheckpointCommitMessage } from '../../../ports/CommitMessageCodecPort.ts';
import QueryError from '../../errors/QueryError.ts';
import { textDecode, textEncode } from '../../utils/bytes.ts';
import { deserializeFrontier } from '../Frontier.ts';
import { partitionShardOids } from '../MaterializedViewHelpers.ts';
import {
  isCurrentCheckpointSchema,
  partitionTreeOids,
} from '../state/checkpointHelpers.ts';
import CheckpointBasisManifest, {
  CheckpointBasisChunking,
  CheckpointBasisCompleteness,
  CheckpointBasisShardGeometry,
  CheckpointBasisShardRootMap,
  CheckpointBasisSupportPosture,
} from './CheckpointBasisManifest.ts';
import type CheckpointTailOpticSource from './CheckpointTailOpticSource.ts';

const CAS_POINTER_PREFIX = 'git-warp:cas-pointer:v1:';
const CAS_POINTER_PREFIX_BYTES = textEncode(CAS_POINTER_PREFIX);

export type CheckpointTailShardOidMap = {
  readonly [path: string]: string;
};

export type CheckpointTailIndexBasis = {
  readonly checkpointSha: string;
  readonly schema: number;
  readonly frontier: Map<string, string>;
  readonly manifest: CheckpointBasisManifest;
  readonly indexOids: CheckpointTailShardOidMap;
  readonly propOids: CheckpointTailShardOidMap;
};

export default class CheckpointTailBasisLoader {
  private readonly _source: CheckpointTailOpticSource;

  constructor(options: { readonly source: CheckpointTailOpticSource }) {
    this._source = options.source;
    Object.freeze(this);
  }

  async load(): Promise<CheckpointTailIndexBasis> {
    const checkpointSha = await this._readCheckpointSha();
    const checkpointMessage = await this._decodeCheckpointMessage(checkpointSha);
    if (!isCurrentCheckpointSchema(checkpointMessage.schema)) {
      throwNoBoundedBasis(this._source.graphName, 'checkpoint-without-index-tree');
    }

    const indexShardOids = await this._loadCheckpointIndexShardOids(checkpointMessage.indexOid);
    const frontierBytes = await this._readCheckpointPayloadBlob(checkpointMessage.frontierOid);
    const frontier = deserializeFrontier(frontierBytes, { codec: this._source._codec });
    const { indexOids, propOids } = partitionShardOids(indexShardOids);
    if (Object.keys(indexOids).length === 0 && Object.keys(propOids).length === 0) {
      throwNoBoundedBasis(this._source.graphName, 'checkpoint-missing-index-shards');
    }

    return {
      checkpointSha,
      schema: checkpointMessage.schema,
      frontier,
      manifest: createManifest({
        graphName: this._source.graphName,
        checkpointSha,
        frontier,
        schema: checkpointMessage.schema,
        indexOids,
        propOids,
      }),
      indexOids,
      propOids,
    };
  }

  private async _readCheckpointSha(): Promise<string> {
    const checkpointSha = await this._source._readCheckpointSha();
    if (checkpointSha === null) {
      throwNoBoundedBasis(this._source.graphName, 'missing-checkpoint');
    }
    return checkpointSha;
  }

  private async _decodeCheckpointMessage(checkpointSha: string): Promise<CheckpointCommitMessage> {
    const commitMessage = await this._source._persistence.showNode(checkpointSha);
    return this._source._commitMessageCodec.decodeCheckpoint(commitMessage);
  }

  private async _readCheckpointPayloadBlob(oid: string): Promise<Uint8Array> {
    const bytes = await this._source._persistence.readBlob(oid);
    const storageOid = decodeCasPayloadPointer(bytes);
    if (storageOid === null) {
      return bytes;
    }
    if (this._source._blobStorage === null) {
      throwNoBoundedBasis(this._source.graphName, 'checkpoint-payload-pointer-without-storage');
    }
    return await this._source._blobStorage.retrieve(storageOid);
  }

  private async _loadCheckpointIndexShardOids(
    checkpointTreeOid: string,
  ): Promise<CheckpointTailShardOidMap> {
    const rawTreeOids = await this._source._persistence.readTreeOids(checkpointTreeOid);
    const { treeOids, indexShardOids } = partitionTreeOids(rawTreeOids);
    if (Object.keys(indexShardOids).length > 0) {
      return indexShardOids;
    }

    const indexTreeOid = treeOids['index'];
    if (indexTreeOid === undefined) {
      return indexShardOids;
    }
    return await this._source._persistence.readTreeOids(indexTreeOid);
  }
}

function createManifest(options: {
  readonly graphName: string;
  readonly checkpointSha: string;
  readonly frontier: Map<string, string>;
  readonly schema: number;
  readonly indexOids: CheckpointTailShardOidMap;
  readonly propOids: CheckpointTailShardOidMap;
}): CheckpointBasisManifest {
  const livenessRoots = rootsForPrefix('node-liveness', options.indexOids, 'meta_');
  const propertyRoots = new CheckpointBasisShardRootMap({
    family: 'node-property',
    roots: shardOidMapToMap(options.propOids),
  });
  const outgoingRoots = rootsForPrefix('outgoing-adjacency', options.indexOids, 'fwd_');
  const incomingRoots = rootsForPrefix('incoming-adjacency', options.indexOids, 'rev_');
  const edgeFactRoots = edgeFactRootsFromIndex(options.indexOids);
  const shardCount = Math.max(
    1,
    livenessRoots.size
      + propertyRoots.size
      + outgoingRoots.size
      + incomingRoots.size
      + edgeFactRoots.size,
  );
  return new CheckpointBasisManifest({
    schema: options.schema,
    graphName: options.graphName,
    checkpointSha: options.checkpointSha,
    frontier: options.frontier,
    appliedVersionVector: appliedVersionVectorFromFrontier(options.frontier),
    basisIdentity: `basis:${options.graphName}:${options.checkpointSha}:checkpoint-tail-index`,
    semanticReadingIdentity: `reading-basis:${options.graphName}:${options.checkpointSha}:node-property-optics`,
    livenessRoots,
    propertyRoots,
    outgoingAdjacencyRoots: outgoingRoots,
    incomingAdjacencyRoots: incomingRoots,
    edgeFactRoots,
    provenancePosture: CheckpointBasisSupportPosture.unavailable('checkpoint-tail-provenance-root-unavailable'),
    contentAnchorPosture: CheckpointBasisSupportPosture.unavailable('checkpoint-tail-content-root-unavailable'),
    shardGeometry: new CheckpointBasisShardGeometry({
      layoutFamily: 'checkpoint-tail-index-shards',
      payloadLayout: 'checkpoint-schema-5-index',
      shardKeyStrategy: 'hex-prefix-2',
      shardCount,
    }),
    chunking: new CheckpointBasisChunking({
      maxFactsPerShard: shardCount,
      chunkCount: 1,
    }),
    completeness: CheckpointBasisCompleteness.complete(),
  });
}

function rootsForPrefix(
  family: 'node-liveness' | 'outgoing-adjacency' | 'incoming-adjacency',
  source: CheckpointTailShardOidMap,
  prefix: string,
): CheckpointBasisShardRootMap {
  const roots = new Map<string, string>();
  for (const [path, oid] of Object.entries(source)) {
    if (path.startsWith(prefix)) {
      roots.set(path, oid);
    }
  }
  return new CheckpointBasisShardRootMap({ family, roots });
}

function edgeFactRootsFromIndex(source: CheckpointTailShardOidMap): CheckpointBasisShardRootMap {
  const roots = new Map<string, string>();
  for (const [path, oid] of Object.entries(source)) {
    if (!path.startsWith('meta_') && !path.startsWith('fwd_') && !path.startsWith('rev_')) {
      roots.set(path, oid);
    }
  }
  return new CheckpointBasisShardRootMap({ family: 'edge-fact', roots });
}

function shardOidMapToMap(source: CheckpointTailShardOidMap): Map<string, string> {
  return new Map(Object.entries(source).sort(([left], [right]) => left.localeCompare(right)));
}

function appliedVersionVectorFromFrontier(frontier: Map<string, string>): Map<string, number> {
  const versionVector = new Map<string, number>();
  for (const writerId of [...frontier.keys()].sort()) {
    versionVector.set(writerId, 0);
  }
  return versionVector;
}

function decodeCasPayloadPointer(bytes: Uint8Array): string | null {
  if (!hasCasPointerPrefix(bytes)) {
    return null;
  }
  const decoded = textDecode(bytes);
  if (!decoded.startsWith(CAS_POINTER_PREFIX)) {
    return null;
  }
  const storageOid = decoded.slice(CAS_POINTER_PREFIX.length);
  if (storageOid.length === 0) {
    throwNoBoundedBasis('checkpoint', 'empty-checkpoint-payload-pointer');
  }
  return storageOid;
}

function hasCasPointerPrefix(bytes: Uint8Array): boolean {
  if (bytes.length < CAS_POINTER_PREFIX_BYTES.length) {
    return false;
  }
  for (let index = 0; index < CAS_POINTER_PREFIX_BYTES.length; index += 1) {
    if (bytes[index] !== CAS_POINTER_PREFIX_BYTES[index]) {
      return false;
    }
  }
  return true;
}

function throwNoBoundedBasis(graphName: string, reason: string): never {
  throw new QueryError('No bounded checkpoint-tail optic basis is available.', {
    code: 'E_OPTIC_NO_BOUNDED_BASIS',
    context: { graphName, reason },
  });
}

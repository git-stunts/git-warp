import type { CheckpointCommitMessage } from '../../../ports/CommitMessageCodecPort.ts';
import QueryError from '../../errors/QueryError.ts';
import { buildCheckpointRef } from '../../utils/RefLayout.ts';
import { textDecode, textEncode } from '../../utils/bytes.ts';
import { deserializeFrontier } from '../Frontier.ts';
import { partitionShardOids } from '../MaterializedViewHelpers.ts';
import {
  CHECKPOINT_SCHEMA_INDEX_TREE,
  partitionTreeOids,
} from '../state/checkpointHelpers.ts';
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
    if (checkpointMessage.schema !== CHECKPOINT_SCHEMA_INDEX_TREE) {
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
      indexOids,
      propOids,
    };
  }

  private async _readCheckpointSha(): Promise<string> {
    const checkpointRef = buildCheckpointRef(this._source.graphName);
    const checkpointSha = await this._source._persistence.readRef(checkpointRef);
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

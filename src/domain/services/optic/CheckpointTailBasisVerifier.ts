import type { CheckpointCommitMessage } from '../../../ports/CommitMessageCodecPort.ts';
import QueryError from '../../errors/QueryError.ts';
import {
  isCurrentCheckpointSchema,
  partitionTreeOids,
} from '../state/checkpointHelpers.ts';
import type CheckpointTailOpticSource from './CheckpointTailOpticSource.ts';

export type CheckpointTailBasisVerification = {
  readonly checkpointSha: string;
};

export default class CheckpointTailBasisVerifier {
  private readonly _source: CheckpointTailOpticSource;

  constructor(options: { readonly source: CheckpointTailOpticSource }) {
    this._source = options.source;
    Object.freeze(this);
  }

  async verify(): Promise<CheckpointTailBasisVerification> {
    const checkpointSha = await this._readCheckpointSha();
    const checkpointMessage = await this._decodeCheckpointMessage(checkpointSha);
    this._verifyCheckpointSchema(checkpointMessage);
    await this._verifyCheckpointTree(checkpointMessage);
    return Object.freeze({ checkpointSha });
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

  private _verifyCheckpointSchema(checkpointMessage: CheckpointCommitMessage): void {
    if (!isCurrentCheckpointSchema(checkpointMessage.schema)) {
      throwNoBoundedBasis(this._source.graphName, 'checkpoint-without-index-tree');
    }
  }

  private async _verifyCheckpointTree(
    checkpointMessage: CheckpointCommitMessage,
  ): Promise<void> {
    const rawTreeOids = await this._source._persistence.readTreeOids(checkpointMessage.indexOid);
    const { treeOids, indexShardOids } = partitionTreeOids(rawTreeOids);
    if (treeOids['frontier.cbor'] === undefined) {
      throwNoBoundedBasis(this._source.graphName, 'checkpoint-missing-frontier');
    }
    if (treeOids['index'] === undefined && Object.keys(indexShardOids).length === 0) {
      throwNoBoundedBasis(this._source.graphName, 'checkpoint-missing-index-shards');
    }
  }
}

function throwNoBoundedBasis(graphName: string, reason: string): never {
  throw new QueryError('No bounded checkpoint-tail optic basis is available.', {
    code: 'E_OPTIC_NO_BOUNDED_BASIS',
    context: { graphName, reason },
  });
}

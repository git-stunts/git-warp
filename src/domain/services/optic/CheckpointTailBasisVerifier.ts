import type { CheckpointCommitMessage } from '../../../ports/CommitMessageCodecPort.ts';
import TreeEntryFound from '../../tree/TreeEntryFound.ts';
import TreeEntryLimit from '../../tree/TreeEntryLimit.ts';
import TreeEntryPath from '../../tree/TreeEntryPath.ts';
import type TreeEntryProbePort from '../../../ports/TreeEntryProbePort.ts';
import QueryError from '../../errors/QueryError.ts';
import { isCurrentCheckpointSchema } from '../state/checkpointHelpers.ts';
import type CheckpointTailOpticSource from './CheckpointTailOpticSource.ts';

export type CheckpointTailBasisVerification = {
  readonly checkpointSha: string;
};

const FRONTIER_ENTRY_PATH = new TreeEntryPath('frontier.cbor');
const INDEX_SUBTREE_PATH = new TreeEntryPath('index');
const INDEX_SHARD_PREFIX = new TreeEntryPath('index/');
const INDEX_SHARD_EVIDENCE_LIMIT = new TreeEntryLimit(1);

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
    const treeEntryProbe = this._treeEntryProbePort();
    const frontierEntry = await treeEntryProbe.readTreeEntryOid(
      checkpointMessage.indexOid,
      FRONTIER_ENTRY_PATH,
    );
    if (!(frontierEntry instanceof TreeEntryFound)) {
      throwNoBoundedBasis(this._source.graphName, 'checkpoint-missing-frontier');
    }
    const indexEntry = await treeEntryProbe.readTreeEntryOid(
      checkpointMessage.indexOid,
      INDEX_SUBTREE_PATH,
    );
    if (indexEntry instanceof TreeEntryFound) {
      return;
    }
    const indexShardEvidence = await treeEntryProbe.readTreeEntryPrefix(
      checkpointMessage.indexOid,
      INDEX_SHARD_PREFIX,
      INDEX_SHARD_EVIDENCE_LIMIT,
    );
    if (!indexShardEvidence.hasEntries()) {
      throwNoBoundedBasis(this._source.graphName, 'checkpoint-missing-index-shards');
    }
  }

  private _treeEntryProbePort(): TreeEntryProbePort {
    if (!hasTreeEntryProbePort(this._source._persistence)) {
      throwNoBoundedBasis(this._source.graphName, 'tree-entry-probe-unavailable');
    }
    return this._source._persistence;
  }
}

type CheckpointTailPersistence = CheckpointTailOpticSource['_persistence'];

function hasTreeEntryProbePort(
  persistence: CheckpointTailPersistence,
): persistence is CheckpointTailPersistence & TreeEntryProbePort {
  return (
    'readTreeEntryOid' in persistence &&
    typeof persistence.readTreeEntryOid === 'function' &&
    'readTreeEntryPrefix' in persistence &&
    typeof persistence.readTreeEntryPrefix === 'function'
  );
}

function throwNoBoundedBasis(graphName: string, reason: string): never {
  throw new QueryError('No bounded checkpoint-tail optic basis is available.', {
    code: 'E_OPTIC_NO_BOUNDED_BASIS',
    context: { graphName, reason },
  });
}

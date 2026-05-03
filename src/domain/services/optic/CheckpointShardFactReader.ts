import type { PropValue } from '../../types/PropValue.ts';
import computeShardKey from '../../utils/shardKey.ts';
import IndexError from '../../errors/IndexError.ts';
import PersistenceError from '../../errors/PersistenceError.ts';
import QueryError from '../../errors/QueryError.ts';
import LogicalIndexReader from '../index/LogicalIndexReader.ts';
import PropertyIndexReader from '../index/PropertyIndexReader.ts';
import type { CheckpointTailIndexBasis } from './CheckpointTailBasisLoader.ts';
import type CheckpointTailOpticSource from './CheckpointTailOpticSource.ts';
import type { ReadIdentityIndexShard } from './ReadIdentity.ts';

const MAX_CACHED_CHECKPOINT_PROPERTY_SHARDS = 1;
const INDEX_SHARD_MISSING_CODE = 'E_INDEX_SHARD_MISSING';
const INDEX_SHARD_MALFORMED_CODE = 'E_INDEX_SHARD_MALFORMED';
const CHECKPOINT_SHARD_UNAVAILABLE_CAUSE = 'checkpoint-shard-unavailable';
const CHECKPOINT_SHARD_INVALID_CAUSE = 'checkpoint-shard-invalid';

type CheckpointShardIdentityCandidate = {
  readonly path: string;
  readonly oid: string | undefined;
};

type CheckpointShardReadFailureContext = {
  readonly graphName: string;
  readonly path: string;
  readonly oid: string;
};

export default class CheckpointShardFactReader {
  private readonly _source: CheckpointTailOpticSource;

  constructor(options: { readonly source: CheckpointTailOpticSource }) {
    this._source = options.source;
    Object.freeze(this);
  }

  async readNodeAlive(
    basis: CheckpointTailIndexBasis,
    nodeId: string,
  ): Promise<boolean> {
    const path = this._metaPath(nodeId);
    const oid = basis.indexOids[path];
    if (oid === undefined) {
      return false;
    }
    const reader = await new LogicalIndexReader({ codec: this._source._codec })
      .loadFromOids({ [path]: oid }, this._source._persistence);
    return reader.toLogicalIndex().isAlive(nodeId);
  }

  async readProperty(
    basis: CheckpointTailIndexBasis,
    nodeId: string,
    propertyKey: string,
  ): Promise<PropValue | undefined> {
    const path = this._propertyPath(nodeId);
    const oid = basis.propOids[path];
    if (oid === undefined) {
      return undefined;
    }
    const reader = new PropertyIndexReader({
      storage: this._source._persistence,
      codec: this._source._codec,
      maxCachedShards: MAX_CACHED_CHECKPOINT_PROPERTY_SHARDS,
    });
    reader.setup({ [path]: oid });
    try {
      return await reader.getProperty(nodeId, propertyKey);
    } catch (error) {
      const context = { graphName: this._source.graphName, path, oid };
      const failure = error instanceof Error ? checkpointShardReadFailure(error, context) : null;
      if (failure !== null) { throw failure; }
      throw error;
    }
  }

  nodeLivenessShardIdentities(
    basis: CheckpointTailIndexBasis,
    nodeId: string,
  ): readonly ReadIdentityIndexShard[] {
    const path = this._metaPath(nodeId);
    return shardIdentities([{ path, oid: basis.indexOids[path] }]);
  }

  propertyShardIdentities(
    basis: CheckpointTailIndexBasis,
    nodeId: string,
  ): readonly ReadIdentityIndexShard[] {
    const path = this._propertyPath(nodeId);
    return shardIdentities([{ path, oid: basis.propOids[path] }]);
  }

  private _metaPath(nodeId: string): string {
    return `meta_${computeShardKey(nodeId)}.cbor`;
  }

  private _propertyPath(nodeId: string): string {
    return `props_${computeShardKey(nodeId)}.cbor`;
  }
}

function shardIdentities(
  shards: readonly CheckpointShardIdentityCandidate[],
): readonly ReadIdentityIndexShard[] {
  const identities: ReadIdentityIndexShard[] = [];
  for (const shard of shards) {
    if (shard.oid !== undefined) {
      identities.push(Object.freeze({ path: shard.path, oid: shard.oid }));
    }
  }
  return Object.freeze(identities);
}

function checkpointShardReadFailure(
  error: Error,
  context: CheckpointShardReadFailureContext,
): QueryError | null {
  const reason = checkpointShardFailureReason(error);
  if (reason === null) {
    return null;
  }
  return new QueryError('No bounded checkpoint-tail property shard is available.', {
    code: 'E_OPTIC_NO_BOUNDED_BASIS',
    context: {
      graphName: context.graphName,
      reason,
      path: context.path,
      oid: context.oid,
    },
  });
}

function checkpointShardFailureReason(error: Error): string | null {
  if (error instanceof IndexError) {
    return indexShardFailureReason(error);
  }
  if (error instanceof PersistenceError && error.code === PersistenceError.E_MISSING_OBJECT) {
    return CHECKPOINT_SHARD_UNAVAILABLE_CAUSE;
  }
  return null;
}

function indexShardFailureReason(error: IndexError): string | null {
  if (error.code === INDEX_SHARD_MISSING_CODE) {
    return CHECKPOINT_SHARD_UNAVAILABLE_CAUSE;
  }
  if (error.code === INDEX_SHARD_MALFORMED_CODE) {
    return CHECKPOINT_SHARD_INVALID_CAUSE;
  }
  return null;
}

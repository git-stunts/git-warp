import type { PropValue } from '../../types/PropValue.ts';
import computeShardKey from '../../utils/shardKey.ts';
import LogicalIndexReader from '../index/LogicalIndexReader.ts';
import PropertyIndexReader from '../index/PropertyIndexReader.ts';
import type { CheckpointTailIndexBasis } from './CheckpointTailBasisLoader.ts';
import type CheckpointTailOpticSource from './CheckpointTailOpticSource.ts';
import type { ReadIdentityIndexShard } from './ReadIdentity.ts';

const MAX_CACHED_CHECKPOINT_PROPERTY_SHARDS = 1;

type CheckpointShardIdentityCandidate = {
  readonly path: string;
  readonly oid: string | undefined;
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
    return await reader.getProperty(nodeId, propertyKey);
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

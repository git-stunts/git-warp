import type { PropValue } from '../../types/PropValue.ts';
import computeShardKey from '../../utils/shardKey.ts';
import IndexError from '../../errors/IndexError.ts';
import PersistenceError from '../../errors/PersistenceError.ts';
import QueryError from '../../errors/QueryError.ts';
import LogicalIndexReader from '../index/LogicalIndexReader.ts';
import PropertyIndexReader from '../index/PropertyIndexReader.ts';
import CheckpointNeighborhoodPageReader, {
  type CheckpointShardNeighborhoodPage,
  type CheckpointShardNeighborhoodReadOptions,
} from './CheckpointNeighborhoodPageReader.ts';
import type { CheckpointTailIndexBasis } from './CheckpointTailBasisLoader.ts';
import type CheckpointTailOpticSource from './CheckpointTailOpticSource.ts';
import type { ReadIdentityIndexShard } from './ReadIdentity.ts';
import AssetHandle from '../../storage/AssetHandle.ts';
import { collectAsyncIterable } from '../../utils/streamUtils.ts';

export type {
  CheckpointShardNeighborhoodPage,
  CheckpointShardNeighborhoodReadOptions,
} from './CheckpointNeighborhoodPageReader.ts';

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
  private readonly _neighborhoodReader: CheckpointNeighborhoodPageReader;

  constructor(options: { readonly source: CheckpointTailOpticSource }) {
    this._source = options.source;
    this._neighborhoodReader = new CheckpointNeighborhoodPageReader({
      source: options.source,
      readShard: async (path, token) => await readShardAsset({
        graphName: options.source.graphName,
        indexStore: options.source._indexStore,
        path,
        handle: new AssetHandle(token),
      }),
    });
    Object.freeze(this);
  }

  async readNodeAlive(
    basis: CheckpointTailIndexBasis,
    nodeId: string,
  ): Promise<boolean> {
    const path = this._metaPath(nodeId);
    const oid = basis.manifest.livenessRoots.get(path);
    const handle = basis.indexHandles[path];
    if (oid === undefined || handle === undefined) {
      return false;
    }
    try {
      const reader = await new LogicalIndexReader({ indexStore: this._source._indexStore })
        .loadFromHandles({ [path]: handle });
      return reader.toLogicalIndex().isAlive(nodeId);
    } catch (error) {
      const context = { graphName: this._source.graphName, path, oid };
      return rethrowLogicalShardReadFailure(error, context);
    }
  }

  async readProperty(
    basis: CheckpointTailIndexBasis,
    nodeId: string,
    propertyKey: string,
  ): Promise<PropValue | undefined> {
    const path = this._propertyPath(nodeId);
    const oid = basis.manifest.propertyRoots.get(path);
    const handle = basis.propHandles[path];
    if (oid === undefined || handle === undefined) {
      return undefined;
    }
    const reader = new PropertyIndexReader({
      indexStore: this._source._indexStore,
      maxCachedShards: MAX_CACHED_CHECKPOINT_PROPERTY_SHARDS,
    });
    reader.setupHandles({ [path]: handle });
    try {
      return await reader.getProperty(nodeId, propertyKey);
    } catch (error) {
      const context = { graphName: this._source.graphName, path, oid };
      return rethrowPropertyShardReadFailure(error, context);
    }
  }

  async readNeighborhood(
    basis: CheckpointTailIndexBasis,
    options: CheckpointShardNeighborhoodReadOptions,
  ): Promise<CheckpointShardNeighborhoodPage> {
    try {
      return await this._neighborhoodReader.read(basis, options);
    } catch (error) {
      const context = firstShardFailureContext(this._source.graphName);
      return rethrowLogicalShardReadFailure(error, context);
    }
  }

  nodeLivenessShardIdentities(
    basis: CheckpointTailIndexBasis,
    nodeId: string,
  ): readonly ReadIdentityIndexShard[] {
    const path = this._metaPath(nodeId);
    return shardIdentities([{ path, oid: basis.manifest.livenessRoots.get(path) }]);
  }

  propertyShardIdentities(
    basis: CheckpointTailIndexBasis,
    nodeId: string,
  ): readonly ReadIdentityIndexShard[] {
    const path = this._propertyPath(nodeId);
    return shardIdentities([{ path, oid: basis.manifest.propertyRoots.get(path) }]);
  }

  private _metaPath(nodeId: string): string {
    return `meta_${computeShardKey(nodeId)}.cbor`;
  }

  private _propertyPath(nodeId: string): string {
    return `props_${computeShardKey(nodeId)}.cbor`;
  }

}

function rethrowLogicalShardReadFailure(
  error: unknown,
  context: CheckpointShardReadFailureContext,
): never {
  if (error instanceof Error) {
    const failure = checkpointLogicalShardReadFailure(error, context);
    if (failure !== null) {
      throw failure;
    }
  }
  throw error;
}

function rethrowPropertyShardReadFailure(
  error: unknown,
  context: CheckpointShardReadFailureContext,
): never {
  if (error instanceof Error) {
    const failure = checkpointShardReadFailure(error, context);
    if (failure !== null) {
      throw failure;
    }
  }
  throw error;
}

async function readShardAsset(options: {
  readonly graphName: string;
  readonly indexStore: CheckpointTailOpticSource['_indexStore'];
  readonly path: string;
  readonly handle: AssetHandle;
}): Promise<Uint8Array> {
  try {
    return await collectAsyncIterable(options.indexStore.openShard(options.handle));
  } catch (error) {
    const failure = error instanceof Error
      ? checkpointLogicalShardReadFailure(error, {
        graphName: options.graphName,
        path: options.path,
        oid: options.handle.toString(),
      })
      : null;
    if (failure !== null) {
      throw failure;
    }
    throw error;
  }
}

function firstShardFailureContext(
  graphName: string,
): CheckpointShardReadFailureContext {
  return { graphName, path: 'checkpoint-neighborhood-index', oid: 'decoded-shards' };
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
  return checkpointShardReadFailureForReason(reason, context);
}

function checkpointLogicalShardReadFailure(
  error: Error,
  context: CheckpointShardReadFailureContext,
): QueryError | null {
  const failure = checkpointShardReadFailure(error, context);
  if (failure !== null) {
    return failure;
  }
  if (error instanceof TypeError) {
    return checkpointShardReadFailureForReason(CHECKPOINT_SHARD_INVALID_CAUSE, context);
  }
  return null;
}

function checkpointShardReadFailureForReason(
  reason: string,
  context: CheckpointShardReadFailureContext,
): QueryError {
  return new QueryError('No bounded checkpoint-tail shard is available.', {
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

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
import type AssetHandle from '../../storage/AssetHandle.ts';
import type BundleHandle from '../../storage/BundleHandle.ts';
import { collectAsyncIterable } from '../../utils/streamUtils.ts';
import { MAX_MATERIALIZATION_INDEX_SHARD_BYTES } from '../../materialization/MaterializationIndexProfile.ts';
import { materializationPropertyShardPath } from '../../materialization/MaterializationPropertyProfile.ts';

export type {
  CheckpointShardNeighborhoodPage,
  CheckpointShardNeighborhoodReadOptions,
} from './CheckpointNeighborhoodPageReader.ts';

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

type BoundCheckpointShard =
  | Readonly<{ kind: 'asset'; handle: AssetHandle }>
  | Readonly<{ kind: 'bundle'; root: BundleHandle }>;

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
    const token = basis.manifest.livenessRoots.get(path);
    if (token === undefined) {
      return false;
    }
    const shard = requireBoundShard(basis, path, token);
    try {
      const reader = new LogicalIndexReader({ indexStore: this._source._indexStore });
      if (shard.kind === 'asset') {
        await reader.loadFromHandles({ [path]: shard.handle });
      } else {
        await reader.loadFromStorePaths(shard.root, [path]);
      }
      return reader.toLogicalIndex().isAlive(nodeId);
    } catch (error) {
      if (!(error instanceof Error)) {
        throw error;
      }
      const context = { graphName: this._source.graphName, path, oid: token };
      return rethrowLogicalShardReadFailure(error, context);
    }
  }

  async readProperty(
    basis: CheckpointTailIndexBasis,
    nodeId: string,
    propertyKey: string,
  ): Promise<PropValue | undefined> {
    const path = this._propertyPath(basis, nodeId);
    const token = basis.manifest.propertyRoots.get(path);
    if (token === undefined) {
      return undefined;
    }
    const shard = requireBoundShard(basis, path, token);
    const reader = new PropertyIndexReader({ indexStore: this._source._indexStore });
    if (shard.kind === 'asset') {
      reader.setupHandles({ [path]: shard.handle });
    } else {
      reader.setupRoot(shard.root);
    }
    try {
      return await reader.getProperty(nodeId, propertyKey);
    } catch (error) {
      if (!(error instanceof Error)) {
        throw error;
      }
      const context = { graphName: this._source.graphName, path, oid: token };
      return rethrowPropertyShardReadFailure(error, context);
    }
  }

  async readNeighborhood(
    basis: CheckpointTailIndexBasis,
    options: CheckpointShardNeighborhoodReadOptions,
  ): Promise<CheckpointShardNeighborhoodPage> {
    const neighborhoodReader = new CheckpointNeighborhoodPageReader({
      source: this._source,
      readShard: async (path, token) => await readBoundShard({
        graphName: this._source.graphName,
        indexStore: this._source._indexStore,
        path,
        shard: requireBoundShard(basis, path, token),
      }),
    });
    try {
      return await neighborhoodReader.read(basis, options);
    } catch (error) {
      if (!(error instanceof Error)) {
        throw error;
      }
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
    const path = this._propertyPath(basis, nodeId);
    return shardIdentities([{ path, oid: basis.manifest.propertyRoots.get(path) }]);
  }

  private _metaPath(nodeId: string): string {
    return `meta_${computeShardKey(nodeId)}.cbor`;
  }

  private _propertyPath(basis: CheckpointTailIndexBasis, nodeId: string): string {
    return basis.propertyRoot === null
      ? `props_${computeShardKey(nodeId)}.cbor`
      : materializationPropertyShardPath(nodeId);
  }

}

function rethrowLogicalShardReadFailure(
  error: Error,
  context: CheckpointShardReadFailureContext,
): never {
  const failure = checkpointLogicalShardReadFailure(error, context);
  if (failure !== null) {
    throw failure;
  }
  throw error;
}

function rethrowPropertyShardReadFailure(
  error: Error,
  context: CheckpointShardReadFailureContext,
): never {
  const failure = checkpointShardReadFailure(error, context);
  if (failure !== null) {
    throw failure;
  }
  throw error;
}

function requireBoundShard(
  basis: CheckpointTailIndexBasis,
  path: string,
  manifestToken: string,
): BoundCheckpointShard {
  const handle = basis.indexHandles[path] ?? basis.propHandles[path];
  if (handle !== undefined) {
    return requireAssetBinding(path, manifestToken, handle);
  }
  return requireBundleBinding(basis, path, manifestToken);
}

function requireAssetBinding(
  path: string,
  manifestToken: string,
  handle: AssetHandle,
): BoundCheckpointShard {
  if (handle.toString() !== manifestToken) {
    throwShardIdentityMismatch(path, manifestToken, handle.toString());
  }
  return Object.freeze({ kind: 'asset', handle });
}

function requireBundleBinding(
  basis: CheckpointTailIndexBasis,
  path: string,
  manifestToken: string,
): BoundCheckpointShard {
  const reference = basis.indexReferences[path] ?? basis.propReferences[path];
  if (reference === undefined) {
    throwShardIdentityMismatch(path, manifestToken, null);
  }
  if (reference.token !== manifestToken) {
    throwShardIdentityMismatch(path, manifestToken, reference.token);
  }
  return Object.freeze({
    kind: 'bundle',
    root: requireBundleRoot(basis, path, manifestToken),
  });
}

function requireBundleRoot(
  basis: CheckpointTailIndexBasis,
  path: string,
  manifestToken: string,
): BundleHandle {
  const root = basis.indexReferences[path] === undefined
    ? basis.propertyRoot
    : basis.indexRoot;
  if (root === null) {
    throwShardIdentityMismatch(path, manifestToken, null);
  }
  return root;
}

function throwShardIdentityMismatch(
  path: string,
  manifestToken: string,
  basisToken: string | null,
): never {
  throw new QueryError('Checkpoint shard identity does not match its bounded basis.', {
    code: 'E_OPTIC_NO_BOUNDED_BASIS',
    context: {
      reason: CHECKPOINT_SHARD_INVALID_CAUSE,
      path,
      manifestHandle: manifestToken,
      basisHandle: basisToken,
    },
  });
}

async function readBoundShard(options: {
  readonly graphName: string;
  readonly indexStore: CheckpointTailOpticSource['_indexStore'];
  readonly path: string;
  readonly shard: BoundCheckpointShard;
}): Promise<Uint8Array> {
  try {
    return await collectAsyncIterable(openBoundShard(options));
  } catch (error) {
    const failure = error instanceof Error
      ? checkpointLogicalShardReadFailure(error, {
        graphName: options.graphName,
        path: options.path,
        oid: boundShardToken(options.shard),
      })
      : null;
    if (failure !== null) {
      throw failure;
    }
    throw error;
  }
}

function openBoundShard(options: {
  readonly indexStore: CheckpointTailOpticSource['_indexStore'];
  readonly path: string;
  readonly shard: BoundCheckpointShard;
}): AsyncIterable<Uint8Array> {
  return options.shard.kind === 'asset'
    ? options.indexStore.openShard(options.shard.handle)
    : options.indexStore.openShardAt(options.shard.root, options.path, {
      maxBytes: MAX_MATERIALIZATION_INDEX_SHARD_BYTES,
    });
}

function boundShardToken(shard: BoundCheckpointShard): string {
  return shard.kind === 'asset' ? shard.handle.toString() : shard.root.toString();
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

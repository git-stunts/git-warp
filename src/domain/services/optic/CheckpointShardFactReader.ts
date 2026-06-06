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
import type { Direction, NeighborEdge } from '../../../ports/NeighborProviderPort.ts';
import type { NeighborhoodOpticEdge } from './NeighborhoodOpticReadResult.ts';

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

export type CheckpointShardNeighborhoodReadOptions = {
  readonly nodeId: string;
  readonly direction: Direction;
  readonly labels: readonly string[];
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
    const oid = basis.manifest.livenessRoots.get(path);
    if (oid === undefined) {
      return false;
    }
    try {
      const reader = await new LogicalIndexReader({ codec: this._source._codec })
        .loadFromOids({ [path]: oid }, this._source._persistence);
      return reader.toLogicalIndex().isAlive(nodeId);
    } catch (error) {
      const context = { graphName: this._source.graphName, path, oid };
      const failure = error instanceof Error ? checkpointLogicalShardReadFailure(error, context) : null;
      if (failure !== null) { throw failure; }
      throw error;
    }
  }

  async readProperty(
    basis: CheckpointTailIndexBasis,
    nodeId: string,
    propertyKey: string,
  ): Promise<PropValue | undefined> {
    const path = this._propertyPath(nodeId);
    const oid = basis.manifest.propertyRoots.get(path);
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

  async readNeighborhood(
    basis: CheckpointTailIndexBasis,
    options: CheckpointShardNeighborhoodReadOptions,
  ): Promise<readonly NeighborhoodOpticEdge[]> {
    const shardOids = neighborhoodShardOidMap(basis, options);
    if (Object.keys(shardOids).length === 0) {
      return Object.freeze([]);
    }
    try {
      const tree = await readShardTree({
        graphName: this._source.graphName,
        persistence: this._source._persistence,
        shardOids,
      });
      const reader = new LogicalIndexReader({ codec: this._source._codec })
        .loadFromTree(tree);
      const labelIds = labelIdsFor(reader.toLogicalIndex().getLabelRegistry(), options.labels);
      const edges = neighborhoodEdges(reader.toLogicalIndex(), options, labelIds);
      return Object.freeze(edges);
    } catch (error) {
      const context = firstShardFailureContext(this._source.graphName);
      const failure = error instanceof Error ? checkpointLogicalShardReadFailure(error, context) : null;
      if (failure !== null) { throw failure; }
      throw error;
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

  neighborhoodShardIdentities(
    basis: CheckpointTailIndexBasis,
    options: CheckpointShardNeighborhoodReadOptions,
  ): readonly ReadIdentityIndexShard[] {
    return shardIdentities(
      Object.entries(neighborhoodShardOidMap(basis, options))
        .map(([path, oid]) => ({ path, oid })),
    );
  }

  private _metaPath(nodeId: string): string {
    return `meta_${computeShardKey(nodeId)}.cbor`;
  }

  private _propertyPath(nodeId: string): string {
    return `props_${computeShardKey(nodeId)}.cbor`;
  }
}

function neighborhoodShardOidMap(
  basis: CheckpointTailIndexBasis,
  options: CheckpointShardNeighborhoodReadOptions,
): Record<string, string> {
  const shardOids: Record<string, string> = {};
  addShardRoots(shardOids, basis.manifest.livenessRoots.entries());
  addOptionalShardRoot(shardOids, basis.manifest.edgeFactRoots.get('labels.cbor'), 'labels.cbor');
  const shardKey = computeShardKey(options.nodeId);
  if (options.direction === 'out' || options.direction === 'both') {
    const path = `fwd_${shardKey}.cbor`;
    addOptionalShardRoot(shardOids, basis.manifest.outgoingAdjacencyRoots.get(path), path);
  }
  if (options.direction === 'in' || options.direction === 'both') {
    const path = `rev_${shardKey}.cbor`;
    addOptionalShardRoot(shardOids, basis.manifest.incomingAdjacencyRoots.get(path), path);
  }
  return sortShardOidMap(shardOids);
}

function addShardRoots(target: Record<string, string>, roots: Iterable<readonly [string, string]>): void {
  for (const [path, oid] of roots) {
    target[path] = oid;
  }
}

function addOptionalShardRoot(target: Record<string, string>, oid: string | undefined, path: string): void {
  if (oid !== undefined) {
    target[path] = oid;
  }
}

function sortShardOidMap(source: Record<string, string>): Record<string, string> {
  const sorted: Record<string, string> = {};
  for (const path of Object.keys(source).sort()) {
    const oid = source[path];
    if (oid !== undefined) {
      sorted[path] = oid;
    }
  }
  return sorted;
}

function labelIdsFor(
  registry: Map<string, number>,
  labels: readonly string[],
): number[] | undefined {
  if (labels.length === 0) {
    return undefined;
  }
  const ids: number[] = [];
  for (const label of labels) {
    const id = registry.get(label);
    if (id !== undefined) {
      ids.push(id);
    }
  }
  return ids;
}

function neighborhoodEdges(
  index: ReturnType<LogicalIndexReader['toLogicalIndex']>,
  options: CheckpointShardNeighborhoodReadOptions,
  labelIds: number[] | undefined,
): NeighborhoodOpticEdge[] {
  const edges: NeighborhoodOpticEdge[] = [];
  if (options.direction === 'out' || options.direction === 'both') {
    edges.push(...tagEdges('out', index.getEdges(options.nodeId, 'out', labelIds)));
  }
  if (options.direction === 'in' || options.direction === 'both') {
    edges.push(...tagEdges('in', index.getEdges(options.nodeId, 'in', labelIds)));
  }
  return dedupeSortNeighborhoodEdges(edges);
}

function tagEdges(
  direction: 'in' | 'out',
  edges: readonly NeighborEdge[],
): readonly NeighborhoodOpticEdge[] {
  return edges.map((edge) => Object.freeze({
    direction,
    neighborId: edge.neighborId,
    label: edge.label,
  }));
}

function dedupeSortNeighborhoodEdges(
  edges: readonly NeighborhoodOpticEdge[],
): NeighborhoodOpticEdge[] {
  const byKey = new Map<string, NeighborhoodOpticEdge>();
  for (const edge of edges) {
    byKey.set(edgeKey(edge), edge);
  }
  return [...byKey.values()].sort(compareNeighborhoodEdges);
}

function compareNeighborhoodEdges(
  left: NeighborhoodOpticEdge,
  right: NeighborhoodOpticEdge,
): number {
  return compareText(left.direction, right.direction)
    || compareText(left.neighborId, right.neighborId)
    || compareText(left.label, right.label);
}

function edgeKey(edge: NeighborhoodOpticEdge): string {
  return `${edge.direction}\u0000${edge.neighborId}\u0000${edge.label}`;
}

async function readShardTree(options: {
  readonly graphName: string;
  readonly persistence: CheckpointTailOpticSource['_persistence'];
  readonly shardOids: Record<string, string>;
}): Promise<Record<string, Uint8Array>> {
  const tree: Record<string, Uint8Array> = {};
  for (const path of Object.keys(options.shardOids).sort()) {
    const oid = options.shardOids[path];
    if (oid !== undefined) {
      tree[path] = await readShardBlob({
        graphName: options.graphName,
        persistence: options.persistence,
        path,
        oid,
      });
    }
  }
  return tree;
}

async function readShardBlob(options: {
  readonly graphName: string;
  readonly persistence: CheckpointTailOpticSource['_persistence'];
  readonly path: string;
  readonly oid: string;
}): Promise<Uint8Array> {
  try {
    return await options.persistence.readBlob(options.oid);
  } catch (error) {
    const failure = error instanceof Error
      ? checkpointLogicalShardReadFailure(error, {
        graphName: options.graphName,
        path: options.path,
        oid: options.oid,
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

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
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

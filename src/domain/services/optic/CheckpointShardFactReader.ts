import type { PropValue } from '../../types/PropValue.ts';
import computeShardKey from '../../utils/shardKey.ts';
import { getRoaringBitmap32 } from '../../utils/roaring.ts';
import toBytes from '../../utils/toBytes.ts';
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

type DecodedEdgeShardBuckets = Record<string, Record<string, Uint8Array | ArrayLike<number>>>;

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
    const baseShardOids = neighborhoodShardOidMap(basis, options);
    if (!hasAdjacencyShard(baseShardOids)) {
      return Object.freeze([]);
    }
    try {
      return await this._readNeighborhoodWithBaseShards(basis, options, baseShardOids);
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

  private async _readNeighborhoodWithBaseShards(
    basis: CheckpointTailIndexBasis,
    options: CheckpointShardNeighborhoodReadOptions,
    baseShardOids: Record<string, string>,
  ): Promise<readonly NeighborhoodOpticEdge[]> {
    const baseTree = await this._readShardTree(baseShardOids);
    const baseReader = new LogicalIndexReader({ codec: this._source._codec })
      .loadFromTree(baseTree);
    const baseIndex = baseReader.toLogicalIndex();
    const labelIds = labelIdsFor(baseIndex.getLabelRegistry(), options.labels);
    const shardOids = neighborhoodShardOidMapWithNeighborLiveness({
      basis,
      options,
      baseShardOids,
      baseTree,
      sourceGlobalId: baseIndex.getGlobalId(options.nodeId),
      labelIds,
      codec: this._source._codec,
    });
    const tree = await this._readShardTree(shardOids);
    const reader = new LogicalIndexReader({ codec: this._source._codec })
      .loadFromTree(tree);
    return Object.freeze(neighborhoodEdges(reader.toLogicalIndex(), options, labelIds));
  }

  private async _readShardTree(shardOids: Record<string, string>): Promise<Record<string, Uint8Array>> {
    return await readShardTree({
      graphName: this._source.graphName,
      persistence: this._source._persistence,
      shardOids,
    });
  }
}

function neighborhoodShardOidMap(
  basis: CheckpointTailIndexBasis,
  options: CheckpointShardNeighborhoodReadOptions,
): Record<string, string> {
  const shardOids: Record<string, string> = {};
  addOptionalShardRoot(
    shardOids,
    basis.manifest.livenessRoots.get(metaPathForNodeId(options.nodeId)),
    metaPathForNodeId(options.nodeId),
  );
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

function neighborhoodShardOidMapWithNeighborLiveness(options: {
  readonly basis: CheckpointTailIndexBasis;
  readonly options: CheckpointShardNeighborhoodReadOptions;
  readonly baseShardOids: Record<string, string>;
  readonly baseTree: Record<string, Uint8Array>;
  readonly sourceGlobalId: number | undefined;
  readonly labelIds: number[] | undefined;
  readonly codec: CheckpointTailOpticSource['_codec'];
}): Record<string, string> {
  const shardOids: Record<string, string> = { ...options.baseShardOids };
  if (options.sourceGlobalId === undefined) {
    return sortShardOidMap(shardOids);
  }
  const neighborShardKeys = neighborhoodNeighborShardKeys({
    tree: options.baseTree,
    sourceGlobalId: options.sourceGlobalId,
    direction: options.options.direction,
    labelIds: options.labelIds,
    codec: options.codec,
  });
  for (const shardKey of neighborShardKeys) {
    const path = `meta_${shardKey}.cbor`;
    addOptionalShardRoot(shardOids, options.basis.manifest.livenessRoots.get(path), path);
  }
  return sortShardOidMap(shardOids);
}

function addOptionalShardRoot(target: Record<string, string>, oid: string | undefined, path: string): void {
  if (oid !== undefined) {
    target[path] = oid;
  }
}

function hasAdjacencyShard(shardOids: Record<string, string>): boolean {
  return Object.keys(shardOids)
    .some((path) => path.startsWith('fwd_') || path.startsWith('rev_'));
}

function metaPathForNodeId(nodeId: string): string {
  return `meta_${computeShardKey(nodeId)}.cbor`;
}

function neighborhoodNeighborShardKeys(options: {
  readonly tree: Record<string, Uint8Array>;
  readonly sourceGlobalId: number;
  readonly direction: Direction;
  readonly labelIds: number[] | undefined;
  readonly codec: CheckpointTailOpticSource['_codec'];
}): readonly string[] {
  const keys = new Set<string>();
  for (const [path, bytes] of Object.entries(options.tree)) {
    if (shouldReadEdgeShard(path, options.direction)) {
      addNeighborShardKeys(keys, {
        buckets: options.codec.decode<DecodedEdgeShardBuckets>(bytes),
        sourceGlobalId: options.sourceGlobalId,
        labelIds: options.labelIds,
      });
    }
  }
  return Object.freeze([...keys].sort(compareText));
}

function shouldReadEdgeShard(path: string, direction: Direction): boolean {
  if (path.startsWith('fwd_')) {
    return direction === 'out' || direction === 'both';
  }
  if (path.startsWith('rev_')) {
    return direction === 'in' || direction === 'both';
  }
  return false;
}

function addNeighborShardKeys(target: Set<string>, options: {
  readonly buckets: DecodedEdgeShardBuckets;
  readonly sourceGlobalId: number;
  readonly labelIds: number[] | undefined;
}): void {
  const sourceGlobalId = String(options.sourceGlobalId);
  const selectedBuckets = selectedEdgeBuckets(options.buckets, options.labelIds);
  const RoaringBitmap32 = getRoaringBitmap32();
  for (const bucket of selectedBuckets) {
    const bitmapBytes = options.buckets[bucket]?.[sourceGlobalId];
    if (bitmapBytes !== undefined) {
      for (const globalId of RoaringBitmap32.deserialize(toBytes(bitmapBytes), true).toArray()) {
        target.add(shardKeyForGlobalId(globalId));
      }
    }
  }
}

function selectedEdgeBuckets(
  buckets: DecodedEdgeShardBuckets,
  labelIds: number[] | undefined,
): readonly string[] {
  if (labelIds !== undefined) {
    return Object.freeze(labelIds.map((labelId) => String(labelId)));
  }
  return Object.freeze(Object.keys(buckets)
    .filter((bucket) => bucket !== 'all')
    .sort(compareText));
}

function shardKeyForGlobalId(globalId: number): string {
  return ((globalId >>> 24) & 0xff).toString(16).padStart(2, '0');
}

function sortShardOidMap(source: Record<string, string>): Record<string, string> {
  const sorted = new Map<string, string>();
  for (const path of Object.keys(source).sort()) {
    const oid = source[path];
    if (oid !== undefined) {
      sorted.set(path, oid);
    }
  }
  return Object.fromEntries(sorted);
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
  const tree = new Map<string, Uint8Array>();
  for (const path of Object.keys(options.shardOids).sort()) {
    const oid = options.shardOids[path];
    if (oid !== undefined) {
      tree.set(path, await readShardBlob({
        graphName: options.graphName,
        persistence: options.persistence,
        path,
        oid,
      }));
    }
  }
  return Object.fromEntries(tree);
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

import QueryError from '../../errors/QueryError.ts';
import { getRoaringBitmap32, type RoaringBitmapSubset } from '../../utils/roaring.ts';
import computeShardKey from '../../utils/shardKey.ts';
import toBytes from '../../utils/toBytes.ts';
import type { Direction } from '../../../ports/NeighborProviderPort.ts';
import {
  collectNeighborhoodBitmapPage,
  createNeighborhoodCandidateHeap,
  type DecodedNeighborhoodEdgeShard,
  type NeighborhoodBitmapCandidate,
  type NeighborhoodLabelRegistry,
} from './CheckpointNeighborhoodBitmapPager.ts';
import type { CheckpointTailIndexBasis } from './CheckpointTailBasisLoader.ts';
import type CheckpointTailOpticSource from './CheckpointTailOpticSource.ts';
import type { NeighborhoodOpticEdge } from './NeighborhoodOpticReadResult.ts';
import {
  encodeNeighborhoodCursor,
  neighborhoodCursorScope,
  parseNeighborhoodCursor,
  parseNeighborhoodLimit,
  type NeighborhoodCandidatePosition,
  type NeighborhoodCursorScope,
} from './NeighborhoodPageCursor.ts';
import type { ReadIdentityIndexShard } from './ReadIdentity.ts';

const LABELS_PATH = 'labels.cbor';

type ReadShard = (path: string, handle: string) => Promise<Uint8Array>;

type DecodedMetaShard = {
  readonly nodeToGlobal: Array<[string, number]> | Record<string, number>;
  readonly alive: Uint8Array | ArrayLike<number>;
};

type DecodedLabels = Array<[string, number]> | Record<string, number>;

type LoadedMetaShard = {
  readonly alive: RoaringBitmapSubset;
  readonly byGlobalId: ReadonlyMap<number, string>;
};

type NeighborhoodPageReadContext = {
  readonly basis: CheckpointTailIndexBasis;
  readonly options: CheckpointShardNeighborhoodReadOptions;
  readonly readShard: ReadShard;
  readonly source: CheckpointTailOpticSource;
};

export type CheckpointShardNeighborhoodReadOptions = {
  readonly nodeId: string;
  readonly direction: Direction;
  readonly labels: readonly string[];
  readonly cursor?: string | null;
  readonly limit?: number | null;
};

export type CheckpointShardNeighborhoodPage = {
  readonly edges: readonly NeighborhoodOpticEdge[];
  readonly cursor: string | null;
  readonly resumeCursors: readonly (string | null)[];
  readonly checkpointIndexShards: readonly ReadIdentityIndexShard[];
};

class ShardEvidence {
  private readonly _byPath = new Map<string, string>();

  add(path: string, oid: string): void {
    this._byPath.set(path, oid);
  }

  values(): readonly ReadIdentityIndexShard[] {
    return Object.freeze([...this._byPath]
      .sort(([left], [right]) => compareText(left, right))
      .map(([path, oid]) => Object.freeze({ path, oid })));
  }
}

class NeighborhoodShardLoader {
  private readonly _basis: CheckpointTailIndexBasis;
  private readonly _codec: CheckpointTailOpticSource['_codec'];
  private readonly _evidence: ShardEvidence;
  private readonly _readShard: ReadShard;
  private _loadedMeta: { readonly path: string; readonly value: LoadedMetaShard } | null = null;

  constructor(options: {
    readonly basis: CheckpointTailIndexBasis;
    readonly codec: CheckpointTailOpticSource['_codec'];
    readonly evidence: ShardEvidence;
    readonly readShard: ReadShard;
  }) {
    this._basis = options.basis;
    this._codec = options.codec;
    this._evidence = options.evidence;
    this._readShard = options.readShard;
  }

  hasAdjacency(direction: Direction, nodeId: string): boolean {
    return requestedDirections(direction).some((candidateDirection) => {
      const path = edgePath(candidateDirection, nodeId);
      return edgeRoots(this._basis, candidateDirection).get(path) !== undefined;
    });
  }

  async readSourceGlobalId(nodeId: string): Promise<number | null> {
    const meta = await this._readMeta(metaPathForNodeId(nodeId));
    if (meta === null) {
      return null;
    }
    for (const [globalId, candidateNodeId] of meta.byGlobalId) {
      if (candidateNodeId === nodeId) {
        return meta.alive.has(globalId) ? globalId : null;
      }
    }
    return null;
  }

  async readLabels(): Promise<NeighborhoodLabelRegistry> {
    const oid = this._basis.manifest.edgeFactRoots.get(LABELS_PATH);
    if (oid === undefined) {
      throw missingLabelsError();
    }
    const bytes = await this._read(LABELS_PATH, oid);
    return decodeLabels(this._codec.decode<DecodedLabels>(bytes));
  }

  async readCandidateHeap(options: {
    readonly after: NeighborhoodCandidatePosition | null;
    readonly direction: 'in' | 'out';
    readonly labels: NeighborhoodLabelRegistry;
    readonly nodeId: string;
    readonly requestedLabels: readonly string[];
    readonly sourceGlobalId: number;
  }): Promise<NeighborhoodBitmapCandidate[]> {
    const path = edgePath(options.direction, options.nodeId);
    const oid = edgeRoots(this._basis, options.direction).get(path);
    if (oid === undefined) {
      return [];
    }
    const bytes = await this._read(path, oid);
    const buckets = this._codec.decode<DecodedNeighborhoodEdgeShard>(bytes);
    return createNeighborhoodCandidateHeap(buckets, options);
  }

  async resolveLiveNode(globalId: number): Promise<string | null> {
    const path = metaPathForGlobalId(globalId);
    const meta = await this._readMeta(path);
    if (meta === null || !meta.alive.has(globalId)) {
      return null;
    }
    return meta.byGlobalId.get(globalId) ?? null;
  }

  private async _readMeta(path: string): Promise<LoadedMetaShard | null> {
    if (this._loadedMeta?.path === path) {
      return this._loadedMeta.value;
    }
    const oid = this._basis.manifest.livenessRoots.get(path);
    if (oid === undefined) {
      return null;
    }
    const bytes = await this._read(path, oid);
    const value = decodeMeta(this._codec.decode<DecodedMetaShard>(bytes));
    this._loadedMeta = { path, value };
    return value;
  }

  private async _read(path: string, oid: string): Promise<Uint8Array> {
    const bytes = await this._readShard(path, oid);
    this._evidence.add(path, oid);
    return bytes;
  }
}

export default class CheckpointNeighborhoodPageReader {
  private readonly _source: CheckpointTailOpticSource;
  private readonly _readShard: ReadShard;

  constructor(options: { readonly source: CheckpointTailOpticSource; readonly readShard: ReadShard }) {
    this._source = options.source;
    this._readShard = options.readShard;
    Object.freeze(this);
  }

  async read(
    basis: CheckpointTailIndexBasis,
    options: CheckpointShardNeighborhoodReadOptions,
  ): Promise<CheckpointShardNeighborhoodPage> {
    return await readCheckpointNeighborhoodPage({
      basis,
      options,
      readShard: this._readShard,
      source: this._source,
    });
  }
}

async function readCheckpointNeighborhoodPage(
  options: NeighborhoodPageReadContext,
): Promise<CheckpointShardNeighborhoodPage> {
  const scope = neighborhoodCursorScope(options.basis.checkpointSha, options.options);
  const limit = parseNeighborhoodLimit(options.options.limit ?? null);
  const after = parseNeighborhoodCursor(options.options.cursor ?? null, scope);
  const evidence = new ShardEvidence();
  const loader = new NeighborhoodShardLoader({
    basis: options.basis,
    codec: options.source._codec,
    evidence,
    readShard: options.readShard,
  });
  const sourceGlobalId = await loader.readSourceGlobalId(options.options.nodeId);
  if (sourceGlobalId === null
    || !loader.hasAdjacency(options.options.direction, options.options.nodeId)) {
    return emptyPage(evidence);
  }
  return await readPopulatedPage({
    after,
    direction: options.options.direction,
    evidence,
    labels: options.options.labels,
    limit,
    loader,
    nodeId: options.options.nodeId,
    scope,
    sourceGlobalId,
  });
}

async function readPopulatedPage(options: {
  readonly after: NeighborhoodCandidatePosition | null;
  readonly direction: Direction;
  readonly evidence: ShardEvidence;
  readonly labels: readonly string[];
  readonly limit: number;
  readonly loader: NeighborhoodShardLoader;
  readonly nodeId: string;
  readonly scope: NeighborhoodCursorScope;
  readonly sourceGlobalId: number;
}): Promise<CheckpointShardNeighborhoodPage> {
  const labels = await options.loader.readLabels();
  const collected = await collectNeighborhoodBitmapPage({
    after: options.after,
    direction: options.direction,
    labels,
    limit: options.limit,
    loader: options.loader,
    nodeId: options.nodeId,
    requestedLabels: options.labels,
    sourceGlobalId: options.sourceGlobalId,
  });
  return completedPage(options.scope, options.evidence, collected);
}

function completedPage(
  scope: NeighborhoodCursorScope,
  evidence: ShardEvidence,
  collected: {
    edges: NeighborhoodOpticEdge[];
    hasMore: boolean;
    last: NeighborhoodCandidatePosition | null;
    resumeAfter: Array<NeighborhoodCandidatePosition | null>;
  },
): CheckpointShardNeighborhoodPage {
  const cursor = collected.hasMore && collected.last !== null
    ? encodeNeighborhoodCursor(scope, collected.last)
    : null;
  return Object.freeze({
    edges: Object.freeze(collected.edges),
    cursor,
    resumeCursors: Object.freeze(collected.resumeAfter.map((position) => (
      position === null ? null : encodeNeighborhoodCursor(scope, position)
    ))),
    checkpointIndexShards: evidence.values(),
  });
}

function decodeMeta(decoded: DecodedMetaShard): LoadedMetaShard {
  const entries = Array.isArray(decoded.nodeToGlobal)
    ? decoded.nodeToGlobal
    : Object.entries(decoded.nodeToGlobal);
  const byGlobalId = new Map<number, string>();
  for (const [nodeId, globalId] of entries) {
    byGlobalId.set(globalId, nodeId);
  }
  const alive = decoded.alive.length === 0
    ? new (getRoaringBitmap32())()
    : getRoaringBitmap32().deserialize(toBytes(decoded.alive), true);
  return { alive, byGlobalId };
}

function decodeLabels(decoded: DecodedLabels): NeighborhoodLabelRegistry {
  const entries = Array.isArray(decoded) ? decoded : Object.entries(decoded);
  const byId = new Map<number, string>();
  const byName = new Map<string, number>();
  for (const [label, id] of entries) {
    byId.set(id, label);
    byName.set(label, id);
  }
  return { byId, byName };
}

function missingLabelsError(): QueryError {
  return new QueryError('Checkpoint neighborhood basis is missing its label registry.', {
    code: 'E_OPTIC_NO_BOUNDED_BASIS',
    context: { reason: 'checkpoint-shard-unavailable', path: LABELS_PATH },
  });
}

function emptyPage(evidence: ShardEvidence): CheckpointShardNeighborhoodPage {
  return Object.freeze({
    edges: Object.freeze([]),
    cursor: null,
    resumeCursors: Object.freeze([]),
    checkpointIndexShards: evidence.values(),
  });
}

function requestedDirections(direction: Direction): readonly ('in' | 'out')[] {
  if (direction === 'both') {
    return Object.freeze(['in', 'out']);
  }
  return Object.freeze([direction]);
}

function edgePath(direction: 'in' | 'out', nodeId: string): string {
  return `${direction === 'out' ? 'fwd' : 'rev'}_${computeShardKey(nodeId)}.cbor`;
}

function edgeRoots(
  basis: CheckpointTailIndexBasis,
  direction: 'in' | 'out',
): { get(path: string): string | undefined } {
  return direction === 'out'
    ? basis.manifest.outgoingAdjacencyRoots
    : basis.manifest.incomingAdjacencyRoots;
}

function metaPathForNodeId(nodeId: string): string {
  return `meta_${computeShardKey(nodeId)}.cbor`;
}

function metaPathForGlobalId(globalId: number): string {
  const shardKey = ((globalId >>> 24) & 0xff).toString(16).padStart(2, '0');
  return `meta_${shardKey}.cbor`;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

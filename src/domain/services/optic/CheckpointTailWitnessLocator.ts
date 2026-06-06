import CheckpointTailBasisLoader, {
  type CheckpointTailIndexBasis,
} from './CheckpointTailBasisLoader.ts';
import CheckpointShardFactReader from './CheckpointShardFactReader.ts';
import CheckpointTailFactReducer from './CheckpointTailFactReducer.ts';
import CheckpointTailReadFailure from './CheckpointTailReadFailure.ts';
import CheckpointTailReadIdentityBuilder from './CheckpointTailReadIdentityBuilder.ts';
import CheckpointTailTraversalReader from './CheckpointTailTraversalReader.ts';
import QueryError from '../../errors/QueryError.ts';
import type { Direction } from '../../../ports/NeighborProviderPort.ts';
import NodeOpticReadResult from './NodeOpticReadResult.ts';
import NodePropertyOpticReadResult from './NodePropertyOpticReadResult.ts';
import type CheckpointTailOpticSource from './CheckpointTailOpticSource.ts';
import CheckpointTailWitnessScan, { type TailWitnessScan } from './CheckpointTailWitnessScan.ts';
import NeighborhoodOpticReadResult, {
  type NeighborhoodOpticEdge,
} from './NeighborhoodOpticReadResult.ts';
import type { NeighborhoodOpticReadOptions } from './NeighborhoodOptic.ts';
import type TraversalOpticReadResult from './TraversalOpticReadResult.ts';
import type { TraversalOpticReadOptions } from './TraversalOptic.ts';

const DEFAULT_MAX_TAIL_PATCHES = 10_000;

export default class CheckpointTailWitnessLocator {
  private readonly _graphName: string;
  private readonly _basisLoader: CheckpointTailBasisLoader;
  private readonly _shardReader: CheckpointShardFactReader;
  private readonly _factReducer: CheckpointTailFactReducer;
  private readonly _readIdentityBuilder: CheckpointTailReadIdentityBuilder;
  private readonly _tailScan: CheckpointTailWitnessScan;
  private readonly _traversalReader: CheckpointTailTraversalReader;

  constructor(options: {
    readonly source: CheckpointTailOpticSource;
    readonly maxTailPatches?: number;
  }) {
    this._graphName = options.source.graphName;
    this._basisLoader = new CheckpointTailBasisLoader({ source: options.source });
    this._shardReader = new CheckpointShardFactReader({ source: options.source });
    this._factReducer = new CheckpointTailFactReducer({ graphName: options.source.graphName });
    this._readIdentityBuilder = new CheckpointTailReadIdentityBuilder({
      worldline: options.source.graphName,
    });
    this._tailScan = new CheckpointTailWitnessScan({
      source: options.source,
      maxTailPatches: options.maxTailPatches ?? DEFAULT_MAX_TAIL_PATCHES,
    });
    this._traversalReader = new CheckpointTailTraversalReader({
      readNeighborhood: async (nodeId, readOptions) => await this.readNeighborhood(nodeId, readOptions),
    });
    Object.freeze(this);
  }

  async readNode(nodeId: string): Promise<NodeOpticReadResult> {
    try {
      return await this._readNodeResult(nodeId);
    } catch (error) {
      if (error instanceof QueryError) {
        throw new CheckpointTailReadFailure({
          graphName: this._graphName,
          opticKind: 'node',
          nodeId,
        }).enrich(error);
      }
      throw error;
    }
  }

  async readNodeProperty(
    nodeId: string,
    propertyKey: string,
  ): Promise<NodePropertyOpticReadResult> {
    try {
      return await this._readNodePropertyResult(nodeId, propertyKey);
    } catch (error) {
      if (error instanceof QueryError) {
        throw new CheckpointTailReadFailure({
          graphName: this._graphName,
          opticKind: 'node-property',
          nodeId,
          propertyKey,
        }).enrich(error);
      }
      throw error;
    }
  }

  async readNeighborhood(
    nodeId: string,
    options: NeighborhoodOpticReadOptions,
  ): Promise<NeighborhoodOpticReadResult> {
    try {
      return await this._readNeighborhoodResult(nodeId, options);
    } catch (error) {
      if (error instanceof QueryError) {
        throw new CheckpointTailReadFailure({
          graphName: this._graphName,
          opticKind: 'neighborhood',
          nodeId,
        }).enrich(error);
      }
      throw error;
    }
  }

  async readTraversal(
    startNodeId: string,
    options: TraversalOpticReadOptions,
  ): Promise<TraversalOpticReadResult> {
    try {
      return await this._readTraversalResult(startNodeId, options);
    } catch (error) {
      if (error instanceof QueryError) {
        throw new CheckpointTailReadFailure({
          graphName: this._graphName,
          opticKind: 'traversal',
          nodeId: startNodeId,
        }).enrich(error);
      }
      throw error;
    }
  }

  private async _readNodeResult(nodeId: string): Promise<NodeOpticReadResult> {
    const basis = await this._basisLoader.load();
    const baseAlive = await this._shardReader.readNodeAlive(basis, nodeId);
    const tail = await this._scanTailForNode(basis, nodeId);
    const alive = this._factReducer.reduceNodeLiveness(baseAlive, tail.entries, nodeId);
    return new NodeOpticReadResult({
      nodeId,
      alive,
      readIdentity: this._readIdentityBuilder.nodeLiveness({
        basis,
        nodeId,
        checkpointIndexShards: this._shardReader.nodeLivenessShardIdentities(basis, nodeId),
        tailWitnesses: tail.witnesses,
      }),
    });
  }

  private async _readNodePropertyResult(
    nodeId: string,
    propertyKey: string,
  ): Promise<NodePropertyOpticReadResult> {
    const basis = await this._basisLoader.load();
    const baseValue = await this._shardReader.readProperty(basis, nodeId, propertyKey);
    const tail = await this._scanTailForProperty(basis, nodeId, propertyKey);
    const value = this._factReducer.reduceProperty({
      baseValue,
      tailEntries: tail.entries,
      nodeId,
      propertyKey,
    });
    return new NodePropertyOpticReadResult({
      nodeId,
      key: propertyKey,
      value,
      readIdentity: this._readIdentityBuilder.nodeProperty({
        basis,
        nodeId,
        propertyKey,
        checkpointIndexShards: this._shardReader.propertyShardIdentities(basis, nodeId),
        tailWitnesses: tail.witnesses,
      }),
    });
  }

  private async _readNeighborhoodResult(
    nodeId: string,
    options: NeighborhoodOpticReadOptions,
  ): Promise<NeighborhoodOpticReadResult> {
    const direction = normalizeDirection(options.direction);
    const labels = normalizeLabels(options.labels ?? []);
    const basis = await this._basisLoader.load();
    const tail = await this._scanTailForNeighborhood(basis, { nodeId, direction, labels });
    this._factReducer.assertNeighborhoodTailStable(tail.entries);
    const allEdges = await this._shardReader.readNeighborhood(basis, { nodeId, direction, labels });
    const windowed = windowNeighborhoodEdges(allEdges, {
      cursor: options.cursor ?? null,
      limit: options.limit ?? null,
    });
    return new NeighborhoodOpticReadResult({
      nodeId,
      direction,
      edges: windowed.edges,
      completeness: windowed.cursor === null ? 'complete' : 'truncated',
      cursor: windowed.cursor,
      readIdentity: this._readIdentityBuilder.neighborhood({
        basis,
        nodeId,
        direction,
        labels,
        checkpointIndexShards: this._shardReader.neighborhoodShardIdentities(basis, {
          nodeId,
          direction,
          labels,
        }),
        tailWitnesses: tail.witnesses,
      }),
    });
  }

  private async _readTraversalResult(
    startNodeId: string,
    options: TraversalOpticReadOptions,
  ): Promise<TraversalOpticReadResult> {
    return await this._traversalReader.read(startNodeId, options);
  }

  private async _scanTailForNode(
    basis: CheckpointTailIndexBasis,
    nodeId: string,
  ): Promise<TailWitnessScan> {
    return await this._tailScan.collect({
      basis,
      includeEntry: (entry) => this._factReducer.includesNodeLiveness(entry, nodeId),
    });
  }

  private async _scanTailForProperty(
    basis: CheckpointTailIndexBasis,
    nodeId: string,
    propertyKey: string,
  ): Promise<TailWitnessScan> {
    return await this._tailScan.collect({
      basis,
      includeEntry: (entry) => this._factReducer.includesProperty(entry, nodeId, propertyKey),
    });
  }

  private async _scanTailForNeighborhood(
    basis: CheckpointTailIndexBasis,
    options: {
      readonly nodeId: string;
      readonly direction: Direction;
      readonly labels: readonly string[];
    },
  ): Promise<TailWitnessScan> {
    return await this._tailScan.collect({
      basis,
      includeEntry: (entry) => this._factReducer.includesNeighborhood(entry, options),
    });
  }
}

function normalizeDirection(direction: Direction | undefined): Direction {
  if (direction === undefined) {
    return 'out';
  }
  if (direction === 'in' || direction === 'out' || direction === 'both') {
    return direction;
  }
  throw new QueryError('Neighborhood optic requires a valid direction.', {
    code: 'E_OPTIC_NEIGHBORHOOD_OPTIONS',
    context: { field: 'direction' },
  });
}

function normalizeLabels(labels: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(labels)].sort());
}

function windowNeighborhoodEdges(
  edges: readonly NeighborhoodOpticEdge[],
  options: {
    readonly cursor: string | null;
    readonly limit: number | null;
  },
): {
  readonly edges: readonly NeighborhoodOpticEdge[];
  readonly cursor: string | null;
} {
  const start = parseCursor(options.cursor);
  const limit = parseLimit(options.limit);
  if (limit === null) {
    return { edges: Object.freeze(edges.slice(start)), cursor: null };
  }
  const end = start + limit;
  const window = edges.slice(start, end);
  return {
    edges: Object.freeze(window),
    cursor: end < edges.length ? String(end) : null,
  };
}

function parseCursor(cursor: string | null): number {
  if (cursor === null || cursor.length === 0) {
    return 0;
  }
  const parsed = Number.parseInt(cursor, 10);
  if (!Number.isInteger(parsed) || parsed < 0 || String(parsed) !== cursor) {
    throw new QueryError('Neighborhood optic cursor must be a non-negative integer string.', {
      code: 'E_OPTIC_NEIGHBORHOOD_OPTIONS',
      context: { field: 'cursor' },
    });
  }
  return parsed;
}

function parseLimit(limit: number | null): number | null {
  if (limit === null) {
    return null;
  }
  if (!Number.isInteger(limit) || limit < 1) {
    throw new QueryError('Neighborhood optic limit must be a positive integer.', {
      code: 'E_OPTIC_NEIGHBORHOOD_OPTIONS',
      context: { field: 'limit' },
    });
  }
  return limit;
}

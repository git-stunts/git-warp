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
import Optic from './Optic.ts';
import OpticReadTarget, { type OpticKindValue } from './OpticReadTarget.ts';
import OpticSupportRule from './OpticSupportRule.ts';
import type TraversalOpticReadResult from './TraversalOpticReadResult.ts';
import type { TraversalOpticReadOptions } from './TraversalOptic.ts';
import type ReadIdentity from './ReadIdentity.ts';

const DEFAULT_MAX_TAIL_PATCHES = 10_000;

export default class CheckpointTailWitnessLocator {
  private readonly _graphName: string;
  private readonly _basisLoader: CheckpointTailBasisLoader;
  private readonly _shardReader: CheckpointShardFactReader;
  private readonly _factReducer: CheckpointTailFactReducer;
  private readonly _readIdentityBuilder: CheckpointTailReadIdentityBuilder;
  private readonly _tailScan: CheckpointTailWitnessScan;

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
    Object.freeze(this);
  }

  async readNode(optic: Optic): Promise<NodeOpticReadResult> {
    requireOpticKind(optic, 'node');
    const nodeId = optic.nodeId();
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
    optic: Optic,
  ): Promise<NodePropertyOpticReadResult> {
    requireOpticKind(optic, 'node-property');
    const nodeId = optic.nodeId();
    const propertyKey = optic.propertyKey();
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
    optic: Optic,
    options: NeighborhoodOpticReadOptions,
  ): Promise<NeighborhoodOpticReadResult> {
    requireOpticKind(optic, 'neighborhood');
    const nodeId = optic.nodeId();
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
    optic: Optic,
    options: TraversalOpticReadOptions,
  ): Promise<TraversalOpticReadResult> {
    requireOpticKind(optic, 'traversal');
    const startNodeId = optic.nodeId();
    try {
      return await this._readTraversalResult(optic, options);
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
    return neighborhoodReadResult({
      basis,
      direction,
      labels,
      nodeId,
      readIdentityBuilder: this._readIdentityBuilder,
      shardReader: this._shardReader,
      tail,
      windowed,
    });
  }

  private async _readTraversalResult(
    optic: Optic,
    options: TraversalOpticReadOptions,
  ): Promise<TraversalOpticReadResult> {
    return await this._traversalReaderFor(optic).read(optic.nodeId(), options);
  }

  private _traversalReaderFor(optic: Optic): CheckpointTailTraversalReader {
    return new CheckpointTailTraversalReader({
      readNeighborhood: async (nodeId, readOptions) => await this.readNeighborhood(
        optic.withTarget(OpticReadTarget.neighborhood(nodeId), OpticSupportRule.neighborhood()),
        readOptions,
      ),
    });
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

function requireOpticKind(optic: Optic, opticKind: OpticKindValue): void {
  if (!(optic instanceof Optic) || optic.target.opticKind !== opticKind) {
    throw new QueryError('Checkpoint-tail read requires a matching Optic.', {
      code: 'E_OPTIC_SCHEMA',
      context: { expectedOpticKind: opticKind },
    });
  }
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
  if (!isCanonicalCursor(parsed, cursor)) {
    throw new QueryError('Neighborhood optic cursor must be a non-negative integer string.', {
      code: 'E_OPTIC_NEIGHBORHOOD_OPTIONS',
      context: { field: 'cursor' },
    });
  }
  return parsed;
}

function isCanonicalCursor(parsed: number, raw: string): boolean {
  return Number.isInteger(parsed) && parsed >= 0 && String(parsed) === raw;
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

function neighborhoodReadResult(options: {
  readonly basis: CheckpointTailIndexBasis;
  readonly direction: Direction;
  readonly labels: readonly string[];
  readonly nodeId: string;
  readonly readIdentityBuilder: CheckpointTailReadIdentityBuilder;
  readonly shardReader: CheckpointShardFactReader;
  readonly tail: TailWitnessScan;
  readonly windowed: {
    readonly edges: readonly NeighborhoodOpticEdge[];
    readonly cursor: string | null;
  };
}): NeighborhoodOpticReadResult {
  const readIdentity = neighborhoodReadIdentity(options);
  return new NeighborhoodOpticReadResult({
    nodeId: options.nodeId,
    direction: options.direction,
    edges: options.windowed.edges,
    completeness: options.windowed.cursor === null ? 'complete' : 'truncated',
    cursor: options.windowed.cursor,
    readIdentity,
  });
}

function neighborhoodReadIdentity(options: {
  readonly basis: CheckpointTailIndexBasis;
  readonly direction: Direction;
  readonly labels: readonly string[];
  readonly nodeId: string;
  readonly readIdentityBuilder: CheckpointTailReadIdentityBuilder;
  readonly shardReader: CheckpointShardFactReader;
  readonly tail: TailWitnessScan;
}): ReadIdentity {
  return options.readIdentityBuilder.neighborhood({
    basis: options.basis,
    nodeId: options.nodeId,
    direction: options.direction,
    labels: options.labels,
    checkpointIndexShards: options.shardReader.neighborhoodShardIdentities(options.basis, {
      nodeId: options.nodeId,
      direction: options.direction,
      labels: options.labels,
    }),
    tailWitnesses: options.tail.witnesses,
  });
}

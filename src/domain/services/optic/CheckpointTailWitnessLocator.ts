import CheckpointTailBasisLoader, {
  type CheckpointTailIndexBasis,
} from './CheckpointTailBasisLoader.ts';
import CheckpointShardFactReader, {
  type CheckpointShardNeighborhoodPage,
} from './CheckpointShardFactReader.ts';
import CheckpointTailFactReducer from './CheckpointTailFactReducer.ts';
import CheckpointTailReadFailure from './CheckpointTailReadFailure.ts';
import CheckpointTailReadIdentityBuilder from './CheckpointTailReadIdentityBuilder.ts';
import CheckpointTailTraversalReader, {
  type TraversalNeighborhoodReadResult,
} from './CheckpointTailTraversalReader.ts';
import QueryError from '../../errors/QueryError.ts';
import type { Direction } from '../../../ports/NeighborProviderPort.ts';
import NodeOpticReadResult from './NodeOpticReadResult.ts';
import NodePropertyOpticReadResult from './NodePropertyOpticReadResult.ts';
import type CheckpointTailOpticSource from './CheckpointTailOpticSource.ts';
import CheckpointTailWitnessScan, { type TailWitnessScan } from './CheckpointTailWitnessScan.ts';
import NeighborhoodOpticReadResult from './NeighborhoodOpticReadResult.ts';
import type { NeighborhoodOpticReadOptions } from './NeighborhoodOptic.ts';
import Optic from './Optic.ts';
import type { OpticKindValue } from './OpticReadTarget.ts';
import type TraversalOpticReadResult from './TraversalOpticReadResult.ts';
import type { TraversalOpticReadOptions } from './TraversalOptic.ts';
import type ReadIdentity from './ReadIdentity.ts';
import type { ReadIdentityIndexShard } from './ReadIdentity.ts';

const DEFAULT_MAX_TAIL_PATCHES = 10_000;

type WitnessedNeighborhoodPage = TraversalNeighborhoodReadResult & {
  readonly nodeId: string;
  readonly direction: Direction;
};

type TraversalReadContext = {
  readonly basis: CheckpointTailIndexBasis;
  readonly tailByNode: ReadonlyMap<string, TailWitnessScan>;
};

type TailWitnessScanDraft = {
  readonly entries: Array<TailWitnessScan['entries'][number]>;
  readonly witnesses: Array<TailWitnessScan['witnesses'][number]>;
};

type NeighborhoodReadSupport = {
  readonly basis: CheckpointTailIndexBasis;
  readonly tail: TailWitnessScan;
};

type AddTraversalTailEntryOptions = {
  readonly drafts: Map<string, TailWitnessScanDraft>;
  readonly entryIndex: number;
  readonly reducer: CheckpointTailFactReducer;
  readonly scope: { readonly direction: Direction; readonly labels: readonly string[] };
  readonly tail: TailWitnessScan;
};

const EMPTY_TAIL_WITNESS_SCAN: TailWitnessScan = Object.freeze({
  entries: Object.freeze([]),
  witnesses: Object.freeze([]),
});

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
      requireExecutableTraversalSupport(optic, options);
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
    const page = await this._readWitnessedNeighborhoodPage(nodeId, options);
    return new NeighborhoodOpticReadResult({
      nodeId: page.nodeId,
      direction: page.direction,
      edges: page.edges,
      completeness: page.cursor === null ? 'complete' : 'truncated',
      cursor: page.cursor,
      readIdentity: page.readIdentity,
    });
  }

  private async _readWitnessedNeighborhoodPage(
    nodeId: string,
    options: NeighborhoodOpticReadOptions,
    traversal: TraversalReadContext | null = null,
  ): Promise<WitnessedNeighborhoodPage> {
    const direction = normalizeDirection(options.direction);
    const labels = normalizeLabels(options.labels ?? []);
    const { basis, tail } = await this._neighborhoodReadSupport({
      direction,
      labels,
      nodeId,
      traversal,
    });
    this._factReducer.assertNeighborhoodTailStable(tail.entries);
    const page = await this._shardReader.readNeighborhood(basis, {
      nodeId,
      direction,
      labels,
      cursor: options.cursor ?? null,
      limit: options.limit ?? null,
    });
    return witnessedNeighborhoodPage({
      basis, direction, labels, nodeId,
      readIdentityBuilder: this._readIdentityBuilder,
      tail, page,
    });
  }

  private async _neighborhoodReadSupport(options: {
    readonly direction: Direction;
    readonly labels: readonly string[];
    readonly nodeId: string;
    readonly traversal: TraversalReadContext | null;
  }): Promise<NeighborhoodReadSupport> {
    if (options.traversal !== null) {
      return {
        basis: options.traversal.basis,
        tail: options.traversal.tailByNode.get(options.nodeId) ?? EMPTY_TAIL_WITNESS_SCAN,
      };
    }
    const basis = await this._basisLoader.load();
    const tail = await this._scanTailForNeighborhood(basis, options);
    return { basis, tail };
  }

  private async _readTraversalResult(
    optic: Optic,
    options: TraversalOpticReadOptions,
  ): Promise<TraversalOpticReadResult> {
    const traversal = await this._createTraversalReadContext({
      direction: normalizeDirection(options.direction),
      labels: normalizeLabels(options.labels ?? []),
    });
    return await this._traversalReader(traversal).read(optic.nodeId(), options);
  }

  private _traversalReader(traversal: TraversalReadContext): CheckpointTailTraversalReader {
    return new CheckpointTailTraversalReader({
      readNeighborhood: async (nodeId, readOptions) => (
        await this._readWitnessedNeighborhoodPage(nodeId, readOptions, traversal)
      ),
    });
  }

  private async _createTraversalReadContext(options: {
    readonly direction: Direction;
    readonly labels: readonly string[];
  }): Promise<TraversalReadContext> {
    const basis = await this._basisLoader.load();
    const tail = await this._tailScan.collect({ basis, includeEntry: () => true });
    return Object.freeze({
      basis,
      tailByNode: indexTraversalNeighborhoodTail(tail, this._factReducer, options),
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

function indexTraversalNeighborhoodTail(
  tail: TailWitnessScan,
  reducer: CheckpointTailFactReducer,
  options: { readonly direction: Direction; readonly labels: readonly string[] },
): ReadonlyMap<string, TailWitnessScan> {
  const drafts = new Map<string, TailWitnessScanDraft>();
  for (let entryIndex = 0; entryIndex < tail.entries.length; entryIndex += 1) {
    addTraversalTailEntry({ drafts, entryIndex, reducer, scope: options, tail });
  }
  return new Map([...drafts.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([nodeId, draft]) => [nodeId, Object.freeze({
      entries: Object.freeze(draft.entries),
      witnesses: Object.freeze(draft.witnesses),
    })]));
}

function addTraversalTailEntry(options: AddTraversalTailEntryOptions): void {
  const { entry, witness } = requireTailWitnessPair(options.tail, options.entryIndex);
  for (const nodeId of options.reducer.neighborhoodNodeIds(entry, options.scope)) {
    const draft = options.drafts.get(nodeId) ?? { entries: [], witnesses: [] };
    draft.entries.push(entry);
    draft.witnesses.push(witness);
    options.drafts.set(nodeId, draft);
  }
}

function requireTailWitnessPair(
  tail: TailWitnessScan,
  entryIndex: number,
): {
  readonly entry: TailWitnessScan['entries'][number];
  readonly witness: TailWitnessScan['witnesses'][number];
} {
  const entry = tail.entries[entryIndex];
  const witness = tail.witnesses[entryIndex];
  if (entry === undefined || witness === undefined) {
    throw tailWitnessAlignmentError(entryIndex);
  }
  return { entry, witness };
}

function tailWitnessAlignmentError(entryIndex: number): QueryError {
  return new QueryError('Traversal tail entry is missing its witness.', {
    code: 'E_OPTIC_READ_IDENTITY',
    context: { entryIndex },
  });
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

function requireExecutableTraversalSupport(
  optic: Optic,
  options: TraversalOpticReadOptions,
): void {
  if (optic.supportRule.isTraversalWindow()) {
    return;
  }

  if (hasTraversalWindowOptions(options)) {
    throw new QueryError('Traversal optic support rule refuses bounded traversal execution.', {
      code: 'E_OPTIC_SCHEMA',
      context: {
        field: 'supportRule',
        supportRule: optic.supportRule.toString(),
        reason: 'requires-global-scan',
      },
    });
  }

  throw new QueryError('Traversal optic requires explicit bounded traversal limits.', {
    code: 'E_OPTIC_TRAVERSAL_UNBOUNDED',
    context: { field: 'supportRule', reason: 'requires-global-scan' },
  });
}

function hasTraversalWindowOptions(options: TraversalOpticReadOptions): boolean {
  return (
    options.maxDepth !== undefined
    && options.maxNodes !== undefined
    && options.maxEdges !== undefined
  );
}

function normalizeLabels(labels: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(labels)].sort());
}

function witnessedNeighborhoodPage(options: {
  readonly basis: CheckpointTailIndexBasis;
  readonly direction: Direction;
  readonly labels: readonly string[];
  readonly nodeId: string;
  readonly readIdentityBuilder: CheckpointTailReadIdentityBuilder;
  readonly tail: TailWitnessScan;
  readonly page: CheckpointShardNeighborhoodPage;
}): WitnessedNeighborhoodPage {
  return Object.freeze({
    nodeId: options.nodeId,
    direction: options.direction,
    edges: options.page.edges,
    cursor: options.page.cursor,
    resumeCursors: options.page.resumeCursors,
    readIdentity: neighborhoodReadIdentity(options),
  });
}

function neighborhoodReadIdentity(options: {
  readonly basis: CheckpointTailIndexBasis;
  readonly direction: Direction;
  readonly labels: readonly string[];
  readonly nodeId: string;
  readonly readIdentityBuilder: CheckpointTailReadIdentityBuilder;
  readonly tail: TailWitnessScan;
  readonly page: {
    readonly checkpointIndexShards: readonly ReadIdentityIndexShard[];
  };
}): ReadIdentity {
  return options.readIdentityBuilder.neighborhood({
    basis: options.basis,
    nodeId: options.nodeId,
    direction: options.direction,
    labels: options.labels,
    checkpointIndexShards: options.page.checkpointIndexShards,
    tailWitnesses: options.tail.witnesses,
  });
}

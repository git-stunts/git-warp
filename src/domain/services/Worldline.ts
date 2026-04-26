import type { Aperture } from '../types/Aperture.ts';
import type { WorldlineOptions, WorldlineSource } from '../capabilities/QueryCapability.ts';
import type DetachedGraphFactory from '../capabilities/DetachedGraphFactory.ts';
import type { TickReceipt } from '../types/TickReceipt.ts';
import CoordinateSelector from '../types/CoordinateSelector.ts';
import LiveSelector from '../types/LiveSelector.ts';
import StrandSelector from '../types/StrandSelector.ts';
import WorldlineSelector from '../types/WorldlineSelector.ts';
import { toInternalStrandShape } from '../utils/strandPublicShape.ts';
import type { WarpState } from './JoinReducer.ts';
import type Observer from './query/Observer.ts';
import LogicalTraversal from './query/LogicalTraversal.ts';
import QueryBuilder from './query/QueryBuilder.ts';
import QueryError from '../errors/QueryError.ts';

type AdjacencyEntry = { neighborId: string; label: string };
type VisibleNodeProps = NonNullable<Awaited<ReturnType<Observer['getNodeProps']>>>;
type VisibleEdge = Awaited<ReturnType<Observer['getEdges']>>[number];
type MaterializedStateWithReceipts = { state: WarpState; receipts: TickReceipt[] };
type MaterializedSourceResult = WarpState | MaterializedStateWithReceipts;
type WorldlineMaterializedGraph = {
  state: WarpState;
  stateHash: string;
  adjacency: {
    outgoing: Map<string, AdjacencyEntry[]>;
    incoming: Map<string, AdjacencyEntry[]>;
  };
};
type WorldlineMaterializedDelegate = Pick<Observer, 'hasNode' | 'getNodes' | 'getNodeProps' | 'getEdges'> & {
  _materializeGraph(): Promise<WorldlineMaterializedGraph>;
};
type WorldlineObserverFactory = {
  observer(config: Aperture, options?: { source: WorldlineSource }): Promise<Observer>;
  observer(name: string, config: Aperture, options?: { source: WorldlineSource }): Promise<Observer>;
};
type WorldlineDetachedGraph = {
  materialize(options: { ceiling: number | null; receipts?: boolean }): Promise<MaterializedSourceResult>;
  materializeCoordinate(options: {
    frontier: Map<string, string> | Record<string, string>;
    ceiling: number | null;
    receipts?: boolean;
  }): Promise<MaterializedSourceResult>;
  materializeStrand(strandId: string, options: {
    receipts?: boolean;
    ceiling: number | null;
  }): Promise<MaterializedSourceResult>;
};

function toSelector(source?: WorldlineSelector | WorldlineSource | null): WorldlineSelector {
  if (source instanceof WorldlineSelector) {
    return source.clone();
  }

  if (source === null || source === undefined) {
    return new LiveSelector();
  }

  const sourceKind = source.kind;

  if (sourceKind === 'live') {
    return new LiveSelector(source.ceiling);
  }

  if (sourceKind === 'coordinate') {
    return new CoordinateSelector(source.frontier, source.ceiling);
  }

  if (sourceKind === 'strand') {
    return new StrandSelector(source.strandId, source.ceiling);
  }

  throw new QueryError('unrecognized worldline source kind', {
    code: 'E_WORLDLINE_SOURCE',
    context: { kind: sourceKind },
  });
}

function toWorldlineSource(source: WorldlineSelector): WorldlineSource {
  if (source instanceof LiveSelector) {
    return source.toDTO();
  }

  if (source instanceof CoordinateSelector) {
    return source.toDTO();
  }

  if (source instanceof StrandSelector) {
    return source.toDTO();
  }

  throw new QueryError('unsupported worldline selector kind', {
    code: 'E_WORLDLINE_SELECTOR',
    context: { kind: source.constructor.name },
  });
}

async function openDetachedReadGraph(
  graphCloner: DetachedGraphFactory,
): Promise<WorldlineDetachedGraph> {
  const detached = await graphCloner.openReadOnly();
  return {
    materialize: async (options) => {
      if (options.receipts === true) {
        return await detached.materialize({
          receipts: true,
          ceiling: options.ceiling,
        });
      }
      return await detached.materialize({
        ceiling: options.ceiling,
      });
    },
    materializeCoordinate: async (options) => {
      if (options.receipts === true) {
        return await detached.materializeCoordinate({
          frontier: options.frontier,
          ceiling: options.ceiling,
          receipts: true,
        });
      }
      return await detached.materializeCoordinate({
        frontier: options.frontier,
        ceiling: options.ceiling,
      });
    },
    materializeStrand: async (strandId, options) => {
      if (options.receipts === true) {
        return await detached.materializeStrand(strandId, {
          receipts: true,
          ceiling: options.ceiling,
        });
      }
      return await detached.materializeStrand(strandId, {
        ceiling: options.ceiling,
      });
    },
  };
}

async function materializeLiveSource(
  graph: WorldlineDetachedGraph,
  source: LiveSelector,
  collectReceipts: boolean,
): Promise<MaterializedSourceResult> {
  if (collectReceipts) {
    return await graph.materialize({
      receipts: true,
      ceiling: source.ceiling,
    });
  }

  return await graph.materialize({
    ceiling: source.ceiling,
  });
}

async function materializeCoordinateSource(
  graph: WorldlineDetachedGraph,
  source: CoordinateSelector,
  collectReceipts: boolean,
): Promise<MaterializedSourceResult> {
  const options = {
    frontier: source.frontier,
    ceiling: source.ceiling,
  };

  if (collectReceipts) {
    return await graph.materializeCoordinate({
      ...options,
      receipts: true,
    });
  }

  return await graph.materializeCoordinate(options);
}

async function materializeStrandSource(
  graph: WorldlineDetachedGraph,
  source: StrandSelector,
  collectReceipts: boolean,
): Promise<MaterializedSourceResult> {
  const internalSource = toInternalStrandShape(source.toDTO());
  if (collectReceipts) {
    return await graph.materializeStrand(
      internalSource.strandId,
      {
        receipts: true,
        ceiling: internalSource.ceiling,
      },
    );
  }

  return await graph.materializeStrand(
    internalSource.strandId,
    {
      ceiling: internalSource.ceiling,
    },
  );
}

async function materializeSource(
  graph: WorldlineDetachedGraph,
  source: WorldlineSelector,
  collectReceipts: boolean,
): Promise<MaterializedSourceResult> {
  if (source instanceof LiveSelector) {
    return await materializeLiveSource(graph, source, collectReceipts);
  }

  if (source instanceof CoordinateSelector) {
    return await materializeCoordinateSource(graph, source, collectReceipts);
  }

  if (source instanceof StrandSelector) {
    return await materializeStrandSource(graph, source, collectReceipts);
  }

  throw new QueryError('unsupported worldline selector kind', {
    code: 'E_WORLDLINE_SELECTOR',
    context: { kind: source.constructor.name },
  });
}

export default class Worldline {
  private readonly _graph: WorldlineObserverFactory;
  private readonly _graphCloner: DetachedGraphFactory;
  private readonly _source: WorldlineSelector;
  private _delegateObserverPromise: Promise<WorldlineMaterializedDelegate> | null;
  readonly traverse: LogicalTraversal;

  constructor({
    graph,
    graphCloner,
    source,
  }: {
    graph: WorldlineObserverFactory;
    graphCloner: DetachedGraphFactory;
    source?: WorldlineSelector | WorldlineSource | null;
  }) {
    this._graph = graph;
    this._graphCloner = graphCloner;
    this._source = toSelector(source);
    this._delegateObserverPromise = null;
    this.traverse = new LogicalTraversal(this);
  }

  get source(): WorldlineSource {
    return toWorldlineSource(this._source);
  }

  async seek(options?: WorldlineOptions): Promise<Worldline> {
    return await Promise.resolve(
      new Worldline({
        graph: this._graph,
        graphCloner: this._graphCloner,
        source: options?.source ?? this._source,
      }),
    );
  }

  async materialize(options: { receipts: true }): Promise<MaterializedStateWithReceipts>;
  async materialize(options?: { receipts?: false }): Promise<WarpState>;
  async materialize(options?: { receipts?: boolean }): Promise<MaterializedSourceResult> {
    const detached = await openDetachedReadGraph(this._graphCloner);
    return await materializeSource(detached, this._source, options?.receipts === true);
  }

  async _delegateObserver(): Promise<WorldlineMaterializedDelegate> {
    if (this._delegateObserverPromise === null) {
      this._delegateObserverPromise = this._graph
        .observer(
          { match: '*' },
          { source: this.source },
        )
        .then(requireWorldlineMaterializedDelegate);
    }
    return await this._delegateObserverPromise;
  }

  async _materializeGraph(): Promise<WorldlineMaterializedGraph> {
    return await (await this._delegateObserver())._materializeGraph();
  }

  async hasNode(nodeId: string): Promise<boolean> {
    return await (await this._delegateObserver()).hasNode(nodeId);
  }

  async getNodes(): Promise<string[]> {
    return await (await this._delegateObserver()).getNodes();
  }

  async getNodeProps(nodeId: string): Promise<VisibleNodeProps | null> {
    return await (await this._delegateObserver()).getNodeProps(nodeId);
  }

  async getEdges(): Promise<VisibleEdge[]> {
    return await (await this._delegateObserver()).getEdges();
  }

  query(): QueryBuilder {
    return new QueryBuilder(this);
  }

  async observer(config: Aperture): Promise<Observer>;
  async observer(name: string, config: Aperture): Promise<Observer>;
  async observer(nameOrConfig: string | Aperture, config?: Aperture): Promise<Observer> {
    if (typeof nameOrConfig === 'string') {
      return await this._graph.observer(nameOrConfig, config!, { source: this.source });
    }

    return await this._graph.observer(nameOrConfig, { source: this.source });
  }
}

function requireWorldlineMaterializedDelegate(
  observer: Observer | WorldlineMaterializedDelegate,
): WorldlineMaterializedDelegate {
  if (!hasWorldlineMaterializedDelegate(observer)) {
    throw new QueryError('observer is missing worldline materialization support', {
      code: 'E_WORLDLINE_DELEGATE',
    });
  }
  return observer;
}

function hasWorldlineMaterializedDelegate(
  observer: Observer | WorldlineMaterializedDelegate,
): observer is WorldlineMaterializedDelegate {
  if (!('_materializeGraph' in observer)) {
    return false;
  }

  return typeof observer._materializeGraph === 'function';
}

import type { Aperture } from '../types/Aperture.ts';
import type { WorldlineOptions, WorldlineSource } from '../capabilities/QueryCapability.ts';
import CoordinateSelector from '../types/CoordinateSelector.ts';
import LiveSelector from '../types/LiveSelector.ts';
import StrandSelector from '../types/StrandSelector.ts';
import WorldlineSelector from '../types/WorldlineSelector.ts';
import type Observer from './query/Observer.ts';
import LogicalTraversal from './query/LogicalTraversal.ts';
import QueryBuilder from './query/QueryBuilder.ts';
import QueryError from '../errors/QueryError.ts';
import CoordinateCheckpointTailOpticSource from './optic/CoordinateCheckpointTailOpticSource.ts';
import WorldlineOptic from './optic/WorldlineOptic.ts';
import type CheckpointTailOpticSource from './optic/CheckpointTailOpticSource.ts';
import type {
  QueryReadModel,
  QueryReadModelOpenRequest,
  QueryReadModelProvider,
} from './query/QueryReadModelProvider.ts';
import CheckpointTailExactIdQueryReadModel, {
  exactIdOnlyQueryNodeId,
} from './query/CheckpointTailExactIdQueryReadModel.ts';

type VisibleNodeProps = NonNullable<Awaited<ReturnType<Observer['getNodeProps']>>>;
type VisibleEdge = Awaited<ReturnType<Observer['getEdges']>>[number];
type WorldlineObserverFactory = {
  observer(config: Aperture, options?: { source: WorldlineSource }): Promise<Observer>;
  observer(
    name: string,
    config: Aperture,
    options?: { source: WorldlineSource }
  ): Promise<Observer>;
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
    return new CoordinateSelector(source.frontier, source.ceiling, source.checkpointSha);
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

export default class Worldline {
  private readonly _graph: WorldlineObserverFactory;
  private readonly _source: WorldlineSelector;
  private readonly _opticSource: CheckpointTailOpticSource | null;
  private _delegateObserverPromise: Promise<Observer> | null;
  readonly traverse: LogicalTraversal;

  constructor({
    graph,
    source,
    opticSource,
  }: {
    graph: WorldlineObserverFactory;
    source?: WorldlineSelector | WorldlineSource | null;
    opticSource?: CheckpointTailOpticSource | null;
  }) {
    this._graph = graph;
    this._source = toSelector(source);
    this._opticSource = opticSource ?? null;
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
        source: options?.source ?? this._source,
        opticSource: this._opticSource,
      })
    );
  }

  optic(): WorldlineOptic {
    if (this._opticSource === null) {
      throw new QueryError('worldline optic requires a checkpoint-tail bounded basis source', {
        code: 'E_OPTIC_NO_BOUNDED_BASIS',
        context: { reason: 'missing-optic-source' },
      });
    }
    if (this._source instanceof LiveSelector) {
      return new WorldlineOptic({ source: this._opticSource });
    }
    if (this._source instanceof CoordinateSelector) {
      if (this._source.checkpointSha === null) {
        throw new QueryError('coordinate optic requires a checkpoint-tail bounded basis source', {
          code: 'E_OPTIC_NO_BOUNDED_BASIS',
          context: { reason: 'coordinate-without-optic-basis' },
        });
      }
      return new WorldlineOptic({
        source: new CoordinateCheckpointTailOpticSource({
          source: this._opticSource,
          checkpointSha: this._source.checkpointSha,
          frontier: this._source.frontier,
        }),
      });
    }
    throw new QueryError('v17 foundation optics support live and coordinate worldlines only', {
      code: 'E_OPTIC_NO_BOUNDED_BASIS',
      context: { selector: this._source.constructor.name },
    });
  }

  async _delegateObserver(): Promise<Observer> {
    if (this._delegateObserverPromise === null) {
      this._delegateObserverPromise = this._graph.observer({ match: '*' }, { source: this.source });
    }
    return await this._delegateObserverPromise;
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

  queryReadModelProvider(): QueryReadModelProvider {
    return this;
  }

  async openQueryReadModel(request?: QueryReadModelOpenRequest): Promise<QueryReadModel> {
    const bounded = await this._boundedExactReadModel(request);
    if (bounded !== null) {
      return bounded;
    }
    return await (await this._delegateObserver()).openQueryReadModel();
  }

  private async _boundedExactReadModel(
    request: QueryReadModelOpenRequest | undefined,
  ): Promise<QueryReadModel | null> {
    const nodeId = exactIdOnlyQueryNodeId(request);
    if (nodeId === null || this._opticSource === null) {
      return null;
    }
    const optic = await this._exactReadOptic();
    return optic === null
      ? null
      : new CheckpointTailExactIdQueryReadModel({ nodeId, optic });
  }

  private async _exactReadOptic(): Promise<WorldlineOptic | null> {
    const source = this._opticSource;
    if (source === null) {
      return null;
    }
    if (this._source instanceof LiveSelector) {
      if (await source._readCheckpointSha() === null) {
        return null;
      }
      return new WorldlineOptic({ source });
    }
    if (this._source instanceof CoordinateSelector && this._source.checkpointSha !== null) {
      return new WorldlineOptic({
        source: new CoordinateCheckpointTailOpticSource({
          source,
          checkpointSha: this._source.checkpointSha,
          frontier: this._source.frontier,
        }),
      });
    }
    return null;
  }

  query(): QueryBuilder {
    return new QueryBuilder(this.queryReadModelProvider());
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

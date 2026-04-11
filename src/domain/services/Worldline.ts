import BlobStoragePort from '../../ports/BlobStoragePort.ts';
import CheckpointStorePort from '../../ports/CheckpointStorePort.ts';
import ClockPort from '../../ports/ClockPort.ts';
import CodecPort from '../../ports/CodecPort.ts';
import CryptoPort from '../../ports/CryptoPort.ts';
import LoggerPort from '../../ports/LoggerPort.ts';
import PatchJournalPort from '../../ports/PatchJournalPort.ts';
import SeekCachePort from '../../ports/SeekCachePort.ts';
import type { Aperture, WorldlineOptions, WorldlineSource } from '../../../index.js';
import WarpRuntime from '../WarpRuntime.js';
import type { TickReceipt } from '../types/TickReceipt.ts';
import CoordinateSelector from '../types/CoordinateSelector.ts';
import LiveSelector from '../types/LiveSelector.ts';
import StrandSelector from '../types/StrandSelector.ts';
import WorldlineSelector from '../types/WorldlineSelector.ts';
import { callInternalRuntimeMethod } from '../utils/callInternalRuntimeMethod.ts';
import { toInternalStrandShape } from '../utils/strandPublicShape.ts';
import type { WarpState } from './JoinReducer.ts';
import type Observer from './query/Observer.js';
import LogicalTraversal from './query/LogicalTraversal.js';
import QueryBuilder from './query/QueryBuilder.js';
import QueryError from '../errors/QueryError.ts';

type AdjacencyEntry = { neighborId: string; label: string };
type VisibleEdge = {
  from: string;
  to: string;
  label: string;
  props: Record<string, unknown>;
};
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
type TrustConfig = {
  mode: 'off' | 'log-only' | 'enforce';
  pin: string | null;
};
type CheckpointPolicy = { every: number } | null;
type DetachedOpenOptions = {
  persistence: WarpRuntime['persistence'];
  graphName: WarpRuntime['graphName'];
  writerId: WarpRuntime['writerId'];
  gcPolicy: WarpRuntime['gcPolicy'];
  autoMaterialize: false;
  onDeleteWithData: WarpRuntime['onDeleteWithData'];
  clock: ClockPort;
  crypto: CryptoPort;
  codec: CodecPort;
  audit: false;
  trust: TrustConfig;
  checkpointPolicy?: Exclude<CheckpointPolicy, null>;
  logger?: LoggerPort;
  seekCache?: SeekCachePort;
  blobStorage?: BlobStoragePort;
  patchBlobStorage?: BlobStoragePort;
  patchJournal?: PatchJournalPort;
  checkpointStore?: CheckpointStorePort;
};
type WorldlineGraph = WarpRuntime & {
  _checkpointPolicy?: CheckpointPolicy;
  _logger?: LoggerPort | null;
  _clock?: ClockPort;
  _crypto?: CryptoPort;
  _codec?: CodecPort;
  _seekCache?: SeekCachePort | null;
  _blobStorage?: BlobStoragePort | null;
  _patchBlobStorage?: BlobStoragePort | null;
  _patchJournal?: PatchJournalPort | null;
  _checkpointStore?: CheckpointStorePort | null;
  _trustConfig?: TrustConfig;
};

function toSelector(source?: WorldlineSelector | WorldlineSource | null): WorldlineSelector {
  if (source instanceof WorldlineSelector) {
    return source.clone();
  }

  if (source === null || source === undefined) {
    return new LiveSelector();
  }

  if (source.kind === 'live') {
    return new LiveSelector(source.ceiling);
  }

  if (source.kind === 'coordinate') {
    return new CoordinateSelector(source.frontier, source.ceiling);
  }

  if (source.kind === 'strand') {
    return new StrandSelector(source.strandId, source.ceiling);
  }

  throw new QueryError('unknown worldline source kind', {
    code: 'E_WORLDLINE_SOURCE',
    context: { kind: String(source.kind) },
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

async function openDetachedReadGraph(graph: WorldlineGraph): Promise<WorldlineGraph> {
  return await WarpRuntime.open(buildDetachedOpenOptions(graph));
}

function buildDetachedOpenOptions(graph: WorldlineGraph): DetachedOpenOptions {
  return {
    persistence: graph.persistence,
    graphName: graph.graphName,
    writerId: graph.writerId,
    gcPolicy: graph.gcPolicy,
    autoMaterialize: false,
    onDeleteWithData: graph.onDeleteWithData,
    clock: requireRuntimePort('clock', graph._clock, ClockPort),
    crypto: requireRuntimePort('crypto', graph._crypto, CryptoPort),
    codec: requireRuntimePort('codec', graph._codec, CodecPort),
    audit: false,
    trust: requireTrustConfig(graph._trustConfig),
    ...nullableOpenFields(graph),
  };
}

function nullableOpenFields(
  graph: WorldlineGraph,
): Pick<
  DetachedOpenOptions,
  | 'checkpointPolicy'
  | 'logger'
  | 'seekCache'
  | 'blobStorage'
  | 'patchBlobStorage'
  | 'patchJournal'
  | 'checkpointStore'
> {
  const checkpointPolicy = optionalCheckpointPolicy(graph._checkpointPolicy);
  const logger = optionalRuntimePort('logger', graph._logger, LoggerPort);
  const seekCache = optionalRuntimePort('seekCache', graph._seekCache, SeekCachePort);
  const blobStorage = optionalRuntimePort('blobStorage', graph._blobStorage, BlobStoragePort);
  const patchBlobStorage = optionalRuntimePort('patchBlobStorage', graph._patchBlobStorage, BlobStoragePort);
  const patchJournal = optionalRuntimePort('patchJournal', graph._patchJournal, PatchJournalPort);
  const checkpointStore = optionalRuntimePort('checkpointStore', graph._checkpointStore, CheckpointStorePort);

  return {
    ...(checkpointPolicy !== undefined ? { checkpointPolicy } : {}),
    ...(logger !== undefined ? { logger } : {}),
    ...(seekCache !== undefined ? { seekCache } : {}),
    ...(blobStorage !== undefined ? { blobStorage } : {}),
    ...(patchBlobStorage !== undefined ? { patchBlobStorage } : {}),
    ...(patchJournal !== undefined ? { patchJournal } : {}),
    ...(checkpointStore !== undefined ? { checkpointStore } : {}),
  };
}

async function materializeLiveSource(
  graph: WorldlineGraph,
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
  graph: WorldlineGraph,
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
  graph: WorldlineGraph,
  source: StrandSelector,
  collectReceipts: boolean,
): Promise<MaterializedSourceResult> {
  const internalSource = toInternalStrandShape(source.toDTO());
  if (collectReceipts) {
    return await callInternalRuntimeMethod<MaterializedStateWithReceipts>(
      graph,
      'materializeStrand',
      internalSource.strandId,
      {
        receipts: true,
        ceiling: internalSource.ceiling,
      },
    );
  }

  return await callInternalRuntimeMethod<MaterializedSourceResult>(
    graph,
    'materializeStrand',
    internalSource.strandId,
    {
      ceiling: internalSource.ceiling,
    },
  );
}

async function materializeSource(
  graph: WorldlineGraph,
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
  private readonly _graph: WorldlineGraph;
  private readonly _source: WorldlineSelector;
  private _delegateObserverPromise: Promise<WorldlineMaterializedDelegate> | null;
  readonly traverse: LogicalTraversal;

  constructor({
    graph,
    source,
  }: {
    graph: WorldlineGraph;
    source?: WorldlineSelector | WorldlineSource | null;
  }) {
    this._graph = graph;
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
        source: options?.source ?? this._source,
      }),
    );
  }

  async materialize(options: { receipts: true }): Promise<MaterializedStateWithReceipts>;
  async materialize(options?: { receipts?: false }): Promise<WarpState>;
  async materialize(options?: { receipts?: boolean }): Promise<MaterializedSourceResult> {
    const detached = await openDetachedReadGraph(this._graph);
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

  async getNodeProps(nodeId: string): Promise<Record<string, unknown> | null> {
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
      return await this._graph.observer(nameOrConfig, config, {
        source: this.source,
      });
    }

    return await this._graph.observer(nameOrConfig, {
      source: this.source,
    });
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

function optionalCheckpointPolicy(
  checkpointPolicy: WorldlineGraph['_checkpointPolicy'],
): Exclude<CheckpointPolicy, null> | undefined {
  if (checkpointPolicy === null || checkpointPolicy === undefined) {
    return undefined;
  }

  if (typeof checkpointPolicy.every !== 'number' || !Number.isFinite(checkpointPolicy.every)) {
    throw new QueryError('worldline graph has invalid checkpoint policy', {
      code: 'E_WORLDLINE_RUNTIME',
    });
  }

  return checkpointPolicy;
}

function requireTrustConfig(trustConfig: WorldlineGraph['_trustConfig']): TrustConfig {
  if (trustConfig === undefined) {
    throw new QueryError('worldline graph is missing trust configuration', {
      code: 'E_WORLDLINE_RUNTIME',
    });
  }

  if (
    trustConfig.mode !== 'off' &&
    trustConfig.mode !== 'log-only' &&
    trustConfig.mode !== 'enforce'
  ) {
    throw new QueryError('worldline graph has invalid trust mode', {
      code: 'E_WORLDLINE_RUNTIME',
    });
  }

  if (trustConfig.pin !== null && typeof trustConfig.pin !== 'string') {
    throw new QueryError('worldline graph has invalid trust pin', {
      code: 'E_WORLDLINE_RUNTIME',
    });
  }

  return trustConfig;
}

function requireRuntimePort<T>(
  name: string,
  value: T | undefined,
  PortClass: abstract new (...args: never[]) => T,
): T {
  if (value instanceof PortClass) {
    return value;
  }

  throw new QueryError(`worldline graph is missing ${name}`, {
    code: 'E_WORLDLINE_RUNTIME',
  });
}

function optionalRuntimePort<T>(
  name: string,
  value: T | null | undefined,
  PortClass: abstract new (...args: never[]) => T,
): T | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }

  return requireRuntimePort(name, value, PortClass);
}

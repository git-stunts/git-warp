/**
 * Worldline - First-class read-side history handle over WARP selectors.
 *
 * This initial implementation is intentionally thin: it wraps the existing
 * read-source selector vocabulary (`live`, `coordinate`, `strand`) in a
 * dedicated public noun without yet requiring tick-indexed coordinates.
 *
 * @module domain/services/Worldline
 */

import QueryBuilder from './query/QueryBuilder.js';
import LogicalTraversal from './query/LogicalTraversal.js';
import { toInternalStrandShape } from '../utils/strandPublicShape.js';
import { callInternalRuntimeMethod } from '../utils/callInternalRuntimeMethod.js';


/** @import { ObserverConfig, WorldlineOptions, WorldlineSource } from '../../../index.js' */
/** @import { default as WarpRuntime } from '../WarpRuntime.js' */
/**


 * @typedef {import('./JoinReducer.js').WarpStateV5 | { state: import('./JoinReducer.js').WarpStateV5, receipts: import('../types/TickReceipt.js').TickReceipt[] }} MaterializedSourceResult
 * @typedef {{
 *   _materializeGraph: () => Promise<{
 *     state: unknown,
 *     stateHash: string,
 *     adjacency: {
 *       outgoing: Map<string, Array<{ neighborId: string, label: string }>>,
 *       incoming: Map<string, Array<{ neighborId: string, label: string }>>
 *     }
 *   }>
 * }} WorldlineMaterializedDelegate
 */

/**
 * Deep-clones a worldline source descriptor, normalizing null/undefined to live.
 *
 * @param {WorldlineSource|{ kind: 'strand', strandId: string, ceiling?: number|null }|undefined|null} source
 * @returns {WorldlineSource}
 */
function cloneWorldlineSource(source) {
  const value = source ?? { kind: 'live' };

  if (value.kind === 'live') {
    return cloneLiveSource(value);
  }
  if (value.kind === 'coordinate') {
    return cloneCoordinateSource(value);
  }
  return { kind: 'strand', strandId: value.strandId, ceiling: value.ceiling ?? null };
}

/**
 * Clones a live source, preserving ceiling only if present.
 *
 * @param {{ kind: 'live', ceiling?: number|null }} value
 * @returns {WorldlineSource}
 */
function cloneLiveSource(value) {
  return 'ceiling' in value
    ? { kind: 'live', ceiling: value.ceiling ?? null }
    : { kind: 'live' };
}

/**
 * Clones a coordinate source, deep-copying the frontier.
 *
 * @param {{ kind: 'coordinate', frontier: Map<string, string>|Record<string, string>, ceiling?: number|null }} value
 * @returns {WorldlineSource}
 */
function cloneCoordinateSource(value) {
  return {
    kind: 'coordinate',
    frontier: value.frontier instanceof Map ? new Map(value.frontier) : { ...value.frontier },
    ceiling: value.ceiling ?? null,
  };
}

/**
 * Opens a detached graph handle for read-only materialization.
 *
 * @param {WarpRuntime} graph
 * @returns {Promise<WarpRuntime>}
 */
async function openDetachedReadGraph(graph) {
  const GraphClass = /** @type {typeof import('../WarpRuntime.js').default} */ (graph.constructor);
  return await GraphClass.open(/** @type {Parameters<typeof GraphClass.open>[0]} */ (buildDetachedOpenOptions(graph)));
}

/**
 * Builds the open() options for a detached read-only graph clone.
 *
 * @param {WarpRuntime} graph
 * @returns {Record<string, unknown>}
 */
function buildDetachedOpenOptions(graph) {
  return {
    persistence: graph._persistence,
    graphName: graph._graphName,
    writerId: graph._writerId,
    gcPolicy: graph._gcPolicy,
    autoMaterialize: false,
    onDeleteWithData: graph._onDeleteWithData,
    clock: graph._clock,
    crypto: graph._crypto,
    codec: graph._codec,
    audit: false,
    trust: graph._trustConfig,
    ...nullableOpenFields(graph),
  };
}

/**
 * Collects optional nullable fields, converting null to undefined for .open() compatibility.
 *
 * @param {WarpRuntime} graph
 * @returns {{ checkpointPolicy?: unknown, logger?: unknown, seekCache?: unknown, blobStorage?: unknown, patchBlobStorage?: unknown }}
 */
function nullableOpenFields(graph) {
  return {
    checkpointPolicy: orUndefined(graph._checkpointPolicy),
    logger: orUndefined(graph._logger),
    seekCache: orUndefined(graph._seekCache),
    blobStorage: orUndefined(graph._blobStorage),
    patchBlobStorage: orUndefined(graph._patchBlobStorage),
  };
}

/**
 * Returns the value if non-null, otherwise undefined.
 *
 * @param {unknown} value
 * @returns {unknown}
 */
function orUndefined(value) {
  return value !== null && value !== undefined ? value : undefined;
}

/**
 * Materializes a live worldline source with optional receipt collection.
 *
 * @param {WarpRuntime} graph
 * @param {{ kind: 'live', ceiling?: number|null }} source
 * @param {boolean} collectReceipts
 * @returns {Promise<import('./JoinReducer.js').WarpStateV5 | { state: import('./JoinReducer.js').WarpStateV5, receipts: import('../types/TickReceipt.js').TickReceipt[] }>}
 */
async function materializeLiveSource(graph, source, collectReceipts) {
  if (collectReceipts) {
    return await graph.materialize({
      receipts: true,
      ceiling: source.ceiling ?? null,
    });
  }
  return await graph.materialize({
    ceiling: source.ceiling ?? null,
  });
}

/**
 * Materializes a coordinate worldline source with optional receipt collection.
 *
 * @param {WarpRuntime} graph
 * @param {{ kind: 'coordinate', frontier: Map<string, string>|Record<string, string>, ceiling?: number|null }} source
 * @param {boolean} collectReceipts
 * @returns {Promise<import('./JoinReducer.js').WarpStateV5 | { state: import('./JoinReducer.js').WarpStateV5, receipts: import('../types/TickReceipt.js').TickReceipt[] }>}
 */
async function materializeCoordinateSource(graph, source, collectReceipts) {
  if (collectReceipts) {
    return await graph.materializeCoordinate({
      frontier: source.frontier,
      ceiling: source.ceiling ?? null,
      receipts: true,
    });
  }
  return await graph.materializeCoordinate({
    frontier: source.frontier,
    ceiling: source.ceiling ?? null,
  });
}

/**
 * Materializes a strand worldline source with optional receipt collection.
 *
 * @param {WarpRuntime} graph
 * @param {{ kind: 'strand', strandId: string, ceiling?: number|null } | { kind: 'strand', strandId: string, ceiling?: number|null }} source
 * @param {boolean} collectReceipts
 * @returns {Promise<MaterializedSourceResult>}
 */
async function materializeStrandSource(graph, source, collectReceipts) {
  const internalSource = /** @type {{ strandId: string, ceiling?: number|null }} */ (toInternalStrandShape(source));
  if (collectReceipts) {
    return /** @type {MaterializedSourceResult} */ (await callInternalRuntimeMethod(
      graph,
      'materializeStrand',
      internalSource.strandId,
      {
        receipts: true,
        ceiling: internalSource.ceiling ?? null,
      },
    ));
  }
  return /** @type {MaterializedSourceResult} */ (await callInternalRuntimeMethod(
    graph,
    'materializeStrand',
    internalSource.strandId,
    {
      ceiling: internalSource.ceiling ?? null,
    },
  ));
}

/**
 * Dispatches materialization to the handler for the source's kind.
 *
 * @param {WarpRuntime} graph
 * @param {WorldlineSource} source
 * @param {boolean} collectReceipts
 * @returns {Promise<import('./JoinReducer.js').WarpStateV5 | { state: import('./JoinReducer.js').WarpStateV5, receipts: import('../types/TickReceipt.js').TickReceipt[] }>}
 */
async function materializeSource(graph, source, collectReceipts) {
  if (source.kind === 'live') {
    return await materializeLiveSource(graph, source, collectReceipts);
  }

  if (source.kind === 'coordinate') {
    return await materializeCoordinateSource(graph, source, collectReceipts);
  }

  return await materializeStrandSource(graph, source, collectReceipts);
}

/**
 * First-class read-side history handle over WARP selectors.
 */
export default class Worldline {
  /**
   * Creates a Worldline pinned to the given graph and source descriptor.
   *
   * @param {{ graph: WarpRuntime, source?: WorldlineSource }} options
   */
  constructor({ graph, source }) {
    /** @type {WarpRuntime} */
    this._graph = graph;

    /** @type {WorldlineSource} */
    this._source = cloneWorldlineSource(source);

    /** @type {Promise<import('./query/Observer.js').default>|null} */
    this._delegateObserverPromise = null;

    /**
     * Cast safety: LogicalTraversal requires `hasNode()` and
     * `_materializeGraph()` on the wrapped graph-like object. Worldline
     * implements those by delegating to a cached full-aperture observer.
     */
    this.traverse = new LogicalTraversal(/** @type {import('../WarpRuntime.js').default} */ (/** @type {unknown} */ (this)));

    // Prevent TS6133: _materializeGraph is called externally via duck-typed access
    void this._materializeGraph;
  }

  /**
   * Gets the pinned source for this worldline handle.
   *
   * @returns {WorldlineSource}
   */
  get source() {
    return cloneWorldlineSource(this._source);
  }

  /**
   * Returns a new worldline handle pinned to a different source.
   *
   * When no source is supplied, the current source is preserved.
   *
   * @param {WorldlineOptions} [options]
   * @returns {Promise<Worldline>}
   */
  async seek(options = undefined) {
    return await Promise.resolve(new Worldline({
      graph: this._graph,
      source: cloneWorldlineSource(
        cloneWorldlineSource(options?.source || this._source),
      ),
    }));
  }

  /**
   * Materializes the pinned worldline source into a detached snapshot.
   *
   * @param {{ receipts?: false } | { receipts: true }} [options]
   * @returns {Promise<import('./JoinReducer.js').WarpStateV5 | { state: import('./JoinReducer.js').WarpStateV5, receipts: import('../types/TickReceipt.js').TickReceipt[] }>}
   */
  async materialize(options = undefined) {
    const detached = await openDetachedReadGraph(this._graph);
    const collectReceipts = options?.receipts === true;
    return await materializeSource(detached, this._source, collectReceipts);
  }

  /**
   * Resolves the cached full-aperture observer for this worldline.
   *
   * @returns {Promise<import('./query/Observer.js').default>}
   * @private
   */
  async _delegateObserver() {
    if (!this._delegateObserverPromise) {
      this._delegateObserverPromise = this._graph.observer(
        { match: '*' },
        { source: cloneWorldlineSource(this._source) },
      );
    }
    return await this._delegateObserverPromise;
  }

  /**
   * Internal state access used by QueryBuilder and LogicalTraversal.
   *
   * @returns {Promise<{ state: unknown, stateHash: string, adjacency: { outgoing: Map<string, Array<{ neighborId: string, label: string }>>, incoming: Map<string, Array<{ neighborId: string, label: string }>> } }>}
   * @private
   */
  async _materializeGraph() {
    const observer = /** @type {WorldlineMaterializedDelegate} */ (
      /** @type {unknown} */ (await this._delegateObserver())
    );
    return await observer._materializeGraph();
  }

  /**
   * Checks if a node exists on this pinned worldline.
   *
   * @param {string} nodeId
   * @returns {Promise<boolean>}
   */
  async hasNode(nodeId) {
    const observer = await this._delegateObserver();
    return await observer.hasNode(nodeId);
  }

  /**
   * Returns all visible nodes for the full aperture of this pinned worldline.
   *
   * @returns {Promise<string[]>}
   */
  async getNodes() {
    const observer = await this._delegateObserver();
    return await observer.getNodes();
  }

  /**
   * Reads one node's properties from this pinned worldline.
   *
   * @param {string} nodeId
   * @returns {Promise<Record<string, unknown>|null>}
   */
  async getNodeProps(nodeId) {
    const observer = await this._delegateObserver();
    return await observer.getNodeProps(nodeId);
  }

  /**
   * Returns all visible edges for the full aperture of this pinned worldline.
   *
   * @returns {Promise<Array<{from: string, to: string, label: string, props: Record<string, unknown>}>>}
   */
  async getEdges() {
    const observer = await this._delegateObserver();
    return await observer.getEdges();
  }

  /**
   * Creates a fluent query builder over this pinned worldline.
   *
   * @returns {QueryBuilder}
   */
  query() {
    return new QueryBuilder(/** @type {import('../WarpRuntime.js').default} */ (/** @type {unknown} */ (this)));
  }

  /**
   * Creates an observer pinned to this worldline source.
   *
   * @param {string|ObserverConfig} nameOrConfig
   * @param {ObserverConfig} [config]
   * @returns {Promise<import('./query/Observer.js').default>}
   */
  async observer(nameOrConfig, config = undefined) {
    if (typeof nameOrConfig === 'string') {
      return await this._graph.observer(nameOrConfig, config, {
        source: cloneWorldlineSource(this._source),
      });
    }

    return await this._graph.observer(nameOrConfig, {
      source: cloneWorldlineSource(this._source),
    });
  }
}

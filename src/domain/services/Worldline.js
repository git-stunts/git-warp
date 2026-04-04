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
import WorldlineSelector from '../types/WorldlineSelector.js';
import LiveSelector from '../types/LiveSelector.js';
import CoordinateSelector from '../types/CoordinateSelector.js';


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
 * Converts a raw source descriptor to a WorldlineSelector and clones it.
 *
 * @param {WorldlineSelector|WorldlineSource|{ kind: string, [key: string]: unknown }|undefined|null} source
 * @returns {import('../types/WorldlineSelector.js').default}
 */
function toSelector(source) {
  return WorldlineSelector.from(/** @type {WorldlineSelector|{ kind: string, [key: string]: unknown }|null|undefined} */ (source)).clone();
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
 * @param {import('../types/WorldlineSelector.js').default} source
 * @param {boolean} collectReceipts
 * @returns {Promise<import('./JoinReducer.js').WarpStateV5 | { state: import('./JoinReducer.js').WarpStateV5, receipts: import('../types/TickReceipt.js').TickReceipt[] }>}
 */
async function materializeSource(graph, source, collectReceipts) {
  if (source instanceof LiveSelector) {
    return await materializeLiveSource(graph, /** @type {{ kind: 'live', ceiling?: number|null }} */ (/** @type {unknown} */ (source)), collectReceipts);
  }

  if (source instanceof CoordinateSelector) {
    return await materializeCoordinateSource(graph, /** @type {{ kind: 'coordinate', frontier: Map<string,string>, ceiling?: number|null }} */ (/** @type {unknown} */ (source)), collectReceipts);
  }

  return await materializeStrandSource(graph, /** @type {{ kind: 'strand', strandId: string, ceiling?: number|null }} */ (/** @type {unknown} */ (source)), collectReceipts);
}

/**
 * First-class read-side history handle over WARP selectors.
 */
export default class Worldline {
  /**
   * Creates a Worldline pinned to the given graph and source descriptor.
   *
   * @param {{ graph: WarpRuntime, source?: import('../types/WorldlineSelector.js').default }} options
   */
  constructor({ graph, source }) {
    /** @type {WarpRuntime} */
    this._graph = graph;

    /** @type {import('../types/WorldlineSelector.js').default} */
    this._source = toSelector(source);

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
    return /** @type {WorldlineSource} */ (/** @type {WorldlineSource} */ (this._source.toDTO()));
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
      source: toSelector(
        toSelector(options?.source || this._source),
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
        { source: /** @type {WorldlineSource} */ (this._source.toDTO()) },
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
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return -- return through defineProperty delegation; type is declared in @returns
      return await this._graph.observer(nameOrConfig, config, {
        source: /** @type {WorldlineSource} */ (this._source.toDTO()),
      });
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-return -- return through defineProperty delegation; type is declared in @returns
    return await this._graph.observer(nameOrConfig, {
      source: /** @type {WorldlineSource} */ (this._source.toDTO()),
    });
  }
}

/**
 * Worldline - First-class read-side history handle over WARP selectors.
 *
 * This initial implementation is intentionally thin: it wraps the existing
 * read-source selector vocabulary (`live`, `coordinate`, `working_set`) in a
 * dedicated public noun without yet requiring tick-indexed coordinates.
 *
 * @module domain/services/Worldline
 */

/** @typedef {import('../WarpRuntime.js').default} WarpRuntime */
/** @typedef {import('../../../index.js').ObserverConfig} ObserverConfig */
/**
 * @typedef {import('../../../index.js').WorldlineSource} WorldlineSource
 * @typedef {import('../../../index.js').WorldlineOptions} WorldlineOptions
 */

/**
 * @param {WorldlineSource|undefined|null} source
 * @returns {WorldlineSource}
 */
function cloneWorldlineSource(source) {
  const value = source || { kind: 'live' };

  if (value.kind === 'live') {
    return 'ceiling' in value
      ? { kind: 'live', ceiling: value.ceiling ?? null }
      : { kind: 'live' };
  }

  if (value.kind === 'coordinate') {
    return {
      kind: 'coordinate',
      frontier: value.frontier instanceof Map
        ? new Map(value.frontier)
        : { ...value.frontier },
      ceiling: value.ceiling ?? null,
    };
  }

  return {
    kind: 'working_set',
    workingSetId: value.workingSetId,
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
  return await GraphClass.open({
    persistence: graph._persistence,
    graphName: graph._graphName,
    writerId: graph._writerId,
    gcPolicy: graph._gcPolicy,
    checkpointPolicy: graph._checkpointPolicy || undefined,
    autoMaterialize: false,
    onDeleteWithData: graph._onDeleteWithData,
    logger: graph._logger || undefined,
    clock: graph._clock,
    crypto: graph._crypto,
    codec: graph._codec,
    seekCache: graph._seekCache || undefined,
    audit: false,
    blobStorage: graph._blobStorage || undefined,
    patchBlobStorage: graph._patchBlobStorage || undefined,
    trust: graph._trustConfig,
  });
}

/**
 * @param {WarpRuntime} graph
 * @param {{ kind: 'live', ceiling?: number|null }} source
 * @param {boolean} collectReceipts
 * @returns {Promise<import('../services/JoinReducer.js').WarpStateV5 | { state: import('../services/JoinReducer.js').WarpStateV5, receipts: import('../types/TickReceipt.js').TickReceipt[] }>}
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
 * @param {WarpRuntime} graph
 * @param {{ kind: 'coordinate', frontier: Map<string, string>|Record<string, string>, ceiling?: number|null }} source
 * @param {boolean} collectReceipts
 * @returns {Promise<import('../services/JoinReducer.js').WarpStateV5 | { state: import('../services/JoinReducer.js').WarpStateV5, receipts: import('../types/TickReceipt.js').TickReceipt[] }>}
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
 * @param {WarpRuntime} graph
 * @param {{ kind: 'working_set', workingSetId: string, ceiling?: number|null }} source
 * @param {boolean} collectReceipts
 * @returns {Promise<import('../services/JoinReducer.js').WarpStateV5 | { state: import('../services/JoinReducer.js').WarpStateV5, receipts: import('../types/TickReceipt.js').TickReceipt[] }>}
 */
async function materializeWorkingSetSource(graph, source, collectReceipts) {
  if (collectReceipts) {
    return await graph.materializeWorkingSet(
      source.workingSetId,
      {
        receipts: true,
        ceiling: source.ceiling ?? null,
      },
    );
  }
  return await graph.materializeWorkingSet(
    source.workingSetId,
    {
      ceiling: source.ceiling ?? null,
    },
  );
}

/**
 * @param {WarpRuntime} graph
 * @param {WorldlineSource} source
 * @param {boolean} collectReceipts
 * @returns {Promise<import('../services/JoinReducer.js').WarpStateV5 | { state: import('../services/JoinReducer.js').WarpStateV5, receipts: import('../types/TickReceipt.js').TickReceipt[] }>}
 */
async function materializeSource(graph, source, collectReceipts) {
  if (source.kind === 'live') {
    return await materializeLiveSource(graph, source, collectReceipts);
  }

  if (source.kind === 'coordinate') {
    return await materializeCoordinateSource(graph, source, collectReceipts);
  }

  return await materializeWorkingSetSource(graph, source, collectReceipts);
}

/**
 * First-class read-side history handle over WARP selectors.
 */
export default class Worldline {
  /**
   * @param {{ graph: WarpRuntime, source?: WorldlineSource }} options
   */
  constructor({ graph, source }) {
    /** @type {WarpRuntime} */
    this._graph = graph;

    /** @type {WorldlineSource} */
    this._source = cloneWorldlineSource(source);
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
      source: cloneWorldlineSource(options?.source || this._source),
    }));
  }

  /**
   * Materializes the pinned worldline source into a detached snapshot.
   *
   * @param {{ receipts?: false } | { receipts: true }} [options]
   * @returns {Promise<import('../services/JoinReducer.js').WarpStateV5 | { state: import('../services/JoinReducer.js').WarpStateV5, receipts: import('../types/TickReceipt.js').TickReceipt[] }>}
   */
  async materialize(options = undefined) {
    const detached = await openDetachedReadGraph(this._graph);
    const collectReceipts = !!options?.receipts;
    return await materializeSource(detached, this._source, collectReceipts);
  }

  /**
   * Creates an observer pinned to this worldline source.
   *
   * @param {string} name
   * @param {ObserverConfig} config
   * @returns {Promise<import('./ObserverView.js').default>}
   */
  async observer(name, config) {
    return await this._graph.observer(name, config, {
      source: cloneWorldlineSource(this._source),
    });
  }
}

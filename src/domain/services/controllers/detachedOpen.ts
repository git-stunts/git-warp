/**
 * Shared helper for opening detached (read-only) WarpRuntime clones.
 *
 * Used by QueryController and MaterializeController for snapshot
 * isolation. Will be replaced by DetachedGraphFactory once DI is wired.
 */

import type WarpRuntime from '../../WarpRuntime.js';

type DetachedOpenOptions = Parameters<typeof WarpRuntime.open>[0];

function coreOptions(graph: WarpRuntime): DetachedOpenOptions {
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
  };
}

function addCachePorts(opts: DetachedOpenOptions, g: WarpRuntime): void {
  if (g._checkpointPolicy) { opts.checkpointPolicy = g._checkpointPolicy; }
  if (g._logger) { opts.logger = g._logger; }
  if (g._seekCache) { opts.seekCache = g._seekCache; }
}

function addStoragePorts(opts: DetachedOpenOptions, g: WarpRuntime): void {
  if (g._blobStorage) { opts.blobStorage = g._blobStorage; }
  if (g._patchBlobStorage) { opts.patchBlobStorage = g._patchBlobStorage; }
}

function addConfigPorts(opts: DetachedOpenOptions, g: WarpRuntime): void {
  if (g._trustConfig !== undefined && g._trustConfig !== null) { opts.trust = g._trustConfig; }
  if (g._patchJournal !== undefined && g._patchJournal !== null) { opts.patchJournal = g._patchJournal; }
}

function addStoresPorts(opts: DetachedOpenOptions, g: WarpRuntime): void {
  if (g._checkpointStore !== undefined && g._checkpointStore !== null) { opts.checkpointStore = g._checkpointStore; }
  if (g._indexStore !== undefined && g._indexStore !== null) { opts.indexStore = g._indexStore; }
}

/** Opens a detached WarpRuntime clone for read-only snapshot queries. */
export async function openDetachedGraph(graph: WarpRuntime): Promise<WarpRuntime> {
  const opts = coreOptions(graph);
  addCachePorts(opts, graph);
  addStoragePorts(opts, graph);
  addConfigPorts(opts, graph);
  addStoresPorts(opts, graph);
  const Ctor = graph.constructor as typeof WarpRuntime;
  return await Ctor.open(opts);
}

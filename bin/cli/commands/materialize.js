import WebCryptoAdapter from '../../../src/infrastructure/adapters/WebCryptoAdapter.js';
import WarpGraph from '../../../src/domain/WarpGraph.js';
import { EXIT_CODES, notFoundError } from '../infrastructure.js';
import { createPersistence, listGraphNames, readActiveCursor, emitCursorWarning } from '../shared.js';

/** @typedef {import('../types.js').CliOptions} CliOptions */
/** @typedef {import('../types.js').Persistence} Persistence */

/**
 * Materializes a single graph, creates a checkpoint, and returns summary stats.
 * @param {{persistence: Persistence, graphName: string, writerId: string, ceiling?: number}} params
 * @returns {Promise<{graph: string, nodes: number, edges: number, properties: number, checkpoint: string|null, writers: Record<string, number>, patchCount: number}>}
 */
async function materializeOneGraph({ persistence, graphName, writerId, ceiling }) {
  const graph = await WarpGraph.open({ persistence, graphName, writerId, crypto: new WebCryptoAdapter() });
  await graph.materialize(ceiling !== undefined ? { ceiling } : undefined);
  const nodes = await graph.getNodes();
  const edges = await graph.getEdges();
  const checkpoint = ceiling !== undefined ? null : await graph.createCheckpoint();
  const status = await graph.status();

  // Build per-writer patch counts for the view renderer
  /** @type {Record<string, number>} */
  const writers = {};
  let totalPatchCount = 0;
  for (const wId of Object.keys(status.frontier)) {
    const patches = await graph.getWriterPatches(wId);
    writers[wId] = patches.length;
    totalPatchCount += patches.length;
  }

  const properties = await graph.getPropertyCount();

  return {
    graph: graphName,
    nodes: nodes.length,
    edges: edges.length,
    properties,
    checkpoint,
    writers,
    patchCount: totalPatchCount,
  };
}

/**
 * Handles the `materialize` command: materializes and checkpoints all graphs.
 * @param {{options: CliOptions}} params
 * @returns {Promise<{payload: *, exitCode: number}>}
 */
export default async function handleMaterialize({ options }) {
  const { persistence } = await createPersistence(options.repo);
  const graphNames = await listGraphNames(persistence);

  if (graphNames.length === 0) {
    return {
      payload: { graphs: [] },
      exitCode: EXIT_CODES.OK,
    };
  }

  const targets = options.graph
    ? [options.graph]
    : graphNames;

  if (options.graph && !graphNames.includes(options.graph)) {
    throw notFoundError(`Graph not found: ${options.graph}`);
  }

  const results = [];
  let cursorWarningEmitted = false;
  for (const name of targets) {
    try {
      const cursor = await readActiveCursor(persistence, name);
      const ceiling = cursor ? cursor.tick : undefined;
      if (cursor && !cursorWarningEmitted) {
        emitCursorWarning({ active: true, tick: cursor.tick, maxTick: null }, null);
        cursorWarningEmitted = true;
      }
      const result = await materializeOneGraph({
        persistence,
        graphName: name,
        writerId: options.writer,
        ceiling,
      });
      results.push(result);
    } catch (error) {
      results.push({
        graph: name,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const allFailed = results.every((r) => /** @type {*} */ (r).error); // TODO(ts-cleanup): type CLI payload
  return {
    payload: { graphs: results },
    exitCode: allFailed ? EXIT_CODES.INTERNAL : EXIT_CODES.OK,
  };
}

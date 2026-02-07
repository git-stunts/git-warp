/**
 * Layout engine facade.
 *
 * Orchestrates: converter → ELK adapter → ELK runner → PositionedGraph.
 */

export {
  queryResultToGraphData,
  pathResultToGraphData,
  rawGraphToGraphData,
} from './converters.js';

export { toElkGraph, getDefaultLayoutOptions } from './elkAdapter.js';
export { runLayout } from './elkLayout.js';

import { toElkGraph } from './elkAdapter.js';
import { runLayout } from './elkLayout.js';

/**
 * Full pipeline: graphData → PositionedGraph.
 *
 * @param {{ nodes: Array, edges: Array }} graphData - Normalised graph data
 * @param {{ type?: string, layoutOptions?: Object }} [options]
 * @returns {Promise<Object>} PositionedGraph
 */
export async function layoutGraph(graphData, options = {}) {
  const elkGraph = toElkGraph(graphData, options);
  return await runLayout(elkGraph);
}

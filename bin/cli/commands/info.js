import WebCryptoAdapter from '../../../src/infrastructure/adapters/WebCryptoAdapter.js';
import WarpGraph from '../../../src/domain/WarpGraph.js';
import {
  buildCheckpointRef,
  buildCoverageRef,
  buildWritersPrefix,
  parseWriterIdFromRef,
} from '../../../src/domain/utils/RefLayout.js';
import { notFoundError } from '../infrastructure.js';
import { createPersistence, listGraphNames, readActiveCursor, readCheckpointDate } from '../shared.js';

/** @typedef {import('../types.js').CliOptions} CliOptions */
/** @typedef {import('../types.js').Persistence} Persistence */
/** @typedef {import('../types.js').GraphInfoResult} GraphInfoResult */

/**
 * Collects metadata about a single graph (writer count, refs, patches, checkpoint).
 * @param {Persistence} persistence
 * @param {string} graphName
 * @param {Object} [options]
 * @param {boolean} [options.includeWriterIds=false]
 * @param {boolean} [options.includeRefs=false]
 * @param {boolean} [options.includeWriterPatches=false]
 * @param {boolean} [options.includeCheckpointDate=false]
 * @returns {Promise<GraphInfoResult>}
 */
async function getGraphInfo(persistence, graphName, {
  includeWriterIds = false,
  includeRefs = false,
  includeWriterPatches = false,
  includeCheckpointDate = false,
} = {}) {
  const writersPrefix = buildWritersPrefix(graphName);
  const writerRefs = typeof persistence.listRefs === 'function'
    ? await persistence.listRefs(writersPrefix)
    : [];
  const writerIds = /** @type {string[]} */ (writerRefs
    .map((ref) => parseWriterIdFromRef(ref))
    .filter(Boolean)
    .sort());

  /** @type {GraphInfoResult} */
  const info = {
    name: graphName,
    writers: {
      count: writerIds.length,
    },
  };

  if (includeWriterIds) {
    info.writers.ids = writerIds;
  }

  if (includeRefs || includeCheckpointDate) {
    const checkpointRef = buildCheckpointRef(graphName);
    const checkpointSha = await persistence.readRef(checkpointRef);

    /** @type {{ref: string, sha: string|null, date?: string|null}} */
    const checkpoint = { ref: checkpointRef, sha: checkpointSha || null };

    if (includeCheckpointDate && checkpointSha) {
      const checkpointDate = await readCheckpointDate(persistence, checkpointSha);
      checkpoint.date = checkpointDate;
    }

    info.checkpoint = checkpoint;

    if (includeRefs) {
      const coverageRef = buildCoverageRef(graphName);
      const coverageSha = await persistence.readRef(coverageRef);
      info.coverage = { ref: coverageRef, sha: coverageSha || null };
    }
  }

  if (includeWriterPatches && writerIds.length > 0) {
    const graph = await WarpGraph.open({
      persistence,
      graphName,
      writerId: 'cli',
      crypto: new WebCryptoAdapter(),
    });
    /** @type {Record<string, number>} */
    const writerPatches = {};
    for (const writerId of writerIds) {
      const patches = await graph.getWriterPatches(writerId);
      writerPatches[/** @type {string} */ (writerId)] = patches.length;
    }
    info.writerPatches = writerPatches;
  }

  return info;
}

/**
 * Handles the `info` command: summarizes graphs in the repository.
 * @param {{options: CliOptions}} params
 * @returns {Promise<{repo: string, graphs: GraphInfoResult[]}>}
 */
export default async function handleInfo({ options }) {
  const { persistence } = await createPersistence(options.repo);
  const graphNames = await listGraphNames(persistence);

  if (options.graph && !graphNames.includes(options.graph)) {
    throw notFoundError(`Graph not found: ${options.graph}`);
  }

  const detailGraphs = new Set();
  if (options.graph) {
    detailGraphs.add(options.graph);
  } else if (graphNames.length === 1) {
    detailGraphs.add(graphNames[0]);
  }

  // In view mode, include extra data for visualization
  const isViewMode = Boolean(options.view);

  const graphs = [];
  for (const name of graphNames) {
    const includeDetails = detailGraphs.has(name);
    const info = await getGraphInfo(persistence, name, {
      includeWriterIds: includeDetails || isViewMode,
      includeRefs: includeDetails || isViewMode,
      includeWriterPatches: isViewMode,
      includeCheckpointDate: isViewMode,
    });
    const activeCursor = await readActiveCursor(persistence, name);
    if (activeCursor) {
      info.cursor = { active: true, tick: activeCursor.tick, mode: activeCursor.mode };
    } else {
      info.cursor = { active: false };
    }
    graphs.push(info);
  }

  return {
    repo: options.repo,
    graphs,
  };
}

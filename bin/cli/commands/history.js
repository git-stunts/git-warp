import { summarizeOps } from '../../../src/visualization/renderers/ascii/history.js';
import { EXIT_CODES, usageError, notFoundError } from '../infrastructure.js';
import { openGraph, applyCursorCeiling, emitCursorWarning } from '../shared.js';

/** @typedef {import('../types.js').CliOptions} CliOptions */

/** @param {string[]} args */
function parseHistoryArgs(args) {
  /** @type {{node: string|null}} */
  const options = { node: null };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];

    if (arg === '--node') {
      const value = args[i + 1];
      if (!value) {
        throw usageError('Missing value for --node');
      }
      options.node = value;
      i += 1;
      continue;
    }

    if (arg.startsWith('--node=')) {
      options.node = arg.slice('--node='.length);
      continue;
    }

    if (arg.startsWith('-')) {
      throw usageError(`Unknown history option: ${arg}`);
    }

    throw usageError(`Unexpected history argument: ${arg}`);
  }

  return options;
}

/**
 * @param {*} patch
 * @param {string} nodeId
 */
function patchTouchesNode(patch, nodeId) {
  const ops = Array.isArray(patch?.ops) ? patch.ops : [];
  for (const op of ops) {
    if (op.node === nodeId) {
      return true;
    }
    if (op.from === nodeId || op.to === nodeId) {
      return true;
    }
  }
  return false;
}

/**
 * Handles the `history` command: shows patch history for a writer.
 * @param {{options: CliOptions, args: string[]}} params
 * @returns {Promise<{payload: *, exitCode: number}>}
 */
export default async function handleHistory({ options, args }) {
  const historyOptions = parseHistoryArgs(args);
  const { graph, graphName, persistence } = await openGraph(options);
  const cursorInfo = await applyCursorCeiling(graph, persistence, graphName);
  emitCursorWarning(cursorInfo, null);

  const writerId = options.writer;
  let patches = await graph.getWriterPatches(writerId);
  if (cursorInfo.active) {
    patches = patches.filter((/** @type {*} */ { patch }) => patch.lamport <= /** @type {number} */ (cursorInfo.tick)); // TODO(ts-cleanup): type CLI payload
  }
  if (patches.length === 0) {
    throw notFoundError(`No patches found for writer: ${writerId}`);
  }

  const entries = patches
    .filter((/** @type {*} */ { patch }) => !historyOptions.node || patchTouchesNode(patch, historyOptions.node)) // TODO(ts-cleanup): type CLI payload
    .map((/** @type {*} */ { patch, sha }) => ({ // TODO(ts-cleanup): type CLI payload
      sha,
      schema: patch.schema,
      lamport: patch.lamport,
      opCount: Array.isArray(patch.ops) ? patch.ops.length : 0,
      opSummary: Array.isArray(patch.ops) ? summarizeOps(patch.ops) : undefined,
    }));

  const payload = {
    graph: graphName,
    writer: writerId,
    nodeFilter: historyOptions.node,
    entries,
  };

  return { payload, exitCode: EXIT_CODES.OK };
}

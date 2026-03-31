import { EXIT_CODES, usageError, notFoundError, parseCommandArgs } from '../infrastructure.js';
import { openGraph } from '../shared.js';
import { z } from 'zod';

/** @typedef {import('../types.js').CliOptions} CliOptions */

const PATCH_OPTIONS = {
  writer: { type: 'string' },
  limit: { type: 'string' },
};

const patchSchema = z.object({
  writer: z.string().optional(),
  limit: z.coerce.number().int().positive().optional(),
}).strict();

/**
 * Collects all patches across all writers (or a single writer).
 * @param {import('../types.js').WarpGraphInstance} graph
 * @param {string|null} writerFilter
 * @returns {Promise<Array<{sha: string, writer: string, patch: {schema?: number, lamport: number, ops?: Array<Record<string, unknown>>, context?: Record<string, unknown>}}>>}
 */
async function collectPatches(graph, writerFilter) {
  const writers = (writerFilter !== null && writerFilter !== undefined && writerFilter.length > 0) ? [writerFilter] : await graph.discoverWriters();
  const all = [];
  for (const writerId of writers) {
    const patches = await graph.getWriterPatches(writerId);
    for (const { patch, sha } of patches) {
      all.push({ sha, writer: writerId, patch });
    }
  }
  // Sort by lamport ascending
  all.sort((a, b) => (a.patch.lamport ?? 0) - (b.patch.lamport ?? 0));
  return all;
}

/**
 * Handles the `patch` command: show or list decoded patches.
 * @param {{options: CliOptions, args: string[]}} params
 * @returns {Promise<{payload: unknown, exitCode: number}>}
 */
export default async function handlePatch({ options, args }) {
  // First positional is the subaction: show or list
  const subaction = args[0];
  const rest = args.slice(1);

  if (subaction === 'show') {
    return await handlePatchShow({ options, args: rest });
  }
  if (subaction === 'list') {
    return await handlePatchList({ options, args: rest });
  }
  if (subaction === undefined || subaction === null || subaction.length === 0) {
    throw usageError('Usage: warp-graph patch <show|list> [options]\n  show <sha>   Decode and display a single patch\n  list         List all patches');
  }
  throw usageError(`Unknown patch subaction: ${subaction}. Use: show, list`);
}

/**
 * Decodes and displays a single patch by SHA prefix.
 *
 * @param {{options: CliOptions, args: string[]}} params
 * @returns {Promise<{payload: unknown, exitCode: number}>}
 */
async function handlePatchShow({ options, args }) {
  if (args[0] === undefined || args[0] === null || args[0].length === 0) {
    throw usageError('Usage: warp-graph patch show <sha>');
  }
  const targetSha = args[0];
  const { graph, graphName } = await openGraph(options);
  const allPatches = await collectPatches(graph, null);

  const match = allPatches.find((p) => p.sha === targetSha || p.sha.startsWith(targetSha));
  if (!match) {
    throw notFoundError(`Patch not found: ${targetSha}`);
  }

  const payload = {
    graph: graphName,
    sha: match.sha,
    writer: match.writer,
    lamport: match.patch.lamport,
    schema: match.patch.schema,
    ops: match.patch.ops,
    context: match.patch.context,
  };

  return { payload, exitCode: EXIT_CODES.OK };
}

/**
 * Lists all patches, optionally filtered by writer.
 *
 * @param {{options: CliOptions, args: string[]}} params
 * @returns {Promise<{payload: unknown, exitCode: number}>}
 */
async function handlePatchList({ options, args }) {
  const { values } = parseCommandArgs(args, PATCH_OPTIONS, patchSchema);
  const { graph, graphName } = await openGraph(options);
  const writerFilter = (values.writer !== undefined && values.writer !== null && values.writer.length > 0) ? values.writer : null;
  const allPatches = await collectPatches(graph, writerFilter);

  const limit = values.limit ?? allPatches.length;
  const entries = allPatches.slice(0, limit).map((p) => ({
    sha: p.sha.slice(0, 7),
    fullSha: p.sha,
    writer: p.writer,
    lamport: p.patch.lamport,
    opCount: Array.isArray(p.patch.ops) ? p.patch.ops.length : 0,
    nodeIds: extractNodeIds(Array.isArray(p.patch.ops) ? p.patch.ops : []),
  }));

  const payload = {
    graph: graphName,
    total: allPatches.length,
    showing: entries.length,
    writerFilter,
    entries,
  };

  return { payload, exitCode: EXIT_CODES.OK };
}

/**
 * Extracts unique node IDs touched by a patch's operations.
 *
 * @param {Array<Record<string, unknown>>} ops - Raw patch operation objects
 * @returns {string[]} Sorted array of unique node identifiers
 */
function extractNodeIds(ops) {
  if (!Array.isArray(ops)) {
    return [];
  }
  /** @type {Set<string>} */
  const ids = new Set();
  for (const op of ops) {
    if (typeof op.node === 'string' && op.node.length > 0) {
      ids.add(op.node);
    }
    if (typeof op.from === 'string' && op.from.length > 0) {
      ids.add(op.from);
    }
    if (typeof op.to === 'string' && op.to.length > 0) {
      ids.add(op.to);
    }
  }
  return /** @type {string[]} */ ([...ids].sort());
}

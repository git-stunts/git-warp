import { EXIT_CODES, usageError, notFoundError, parseCommandArgs } from '../infrastructure.ts';
import { openGraph } from '../shared.ts';
import { z } from 'zod';
import type { CliOptions, WarpGraphInstance } from '../types.ts';

const PATCH_OPTIONS = {
  writer: { type: 'string' },
  limit: { type: 'string' },
};

const patchSchema = z.object({
  writer: z.string().optional(),
  limit: z.coerce.number().int().positive().optional(),
}).strict();

/** Collects all patches across all writers (or a single writer). */
async function collectPatches(graph: WarpGraphInstance, writerFilter: string | null): Promise<Array<{ sha: string; writer: string; patch: { schema?: number; lamport: number; ops?: Array<Record<string, unknown>>; context?: Record<string, unknown> } }>> {
  const writers = (writerFilter !== null && writerFilter !== undefined && writerFilter.length > 0) ? [writerFilter] : await graph.discoverWriters();
  const all: Array<{ sha: string; writer: string; patch: { schema?: number; lamport: number; ops?: Array<Record<string, unknown>>; context?: Record<string, unknown> } }> = [];
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

/** Handles the `patch` command: show or list decoded patches. */
export default async function handlePatch({ options, args }: { options: CliOptions; args: string[] }): Promise<{ payload: unknown; exitCode: number }> {
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

/** Decodes and displays a single patch by SHA prefix. */
async function handlePatchShow({ options, args }: { options: CliOptions; args: string[] }): Promise<{ payload: unknown; exitCode: number }> {
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

/** Lists all patches, optionally filtered by writer. */
async function handlePatchList({ options, args }: { options: CliOptions; args: string[] }): Promise<{ payload: unknown; exitCode: number }> {
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

/** Extracts unique node IDs touched by a patch's operations. */
function extractNodeIds(ops: Array<Record<string, unknown>>): string[] {
  if (!Array.isArray(ops)) {
    return [];
  }
  const ids: Set<string> = new Set();
  for (const op of ops) {
    if (typeof op['node'] === 'string' && op['node'].length > 0) {
      ids.add(op['node']);
    }
    if (typeof op['from'] === 'string' && op['from'].length > 0) {
      ids.add(op['from']);
    }
    if (typeof op['to'] === 'string' && op['to'].length > 0) {
      ids.add(op['to']);
    }
  }
  return [...ids].sort();
}

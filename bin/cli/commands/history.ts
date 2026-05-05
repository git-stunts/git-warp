import { EXIT_CODES, parseCommandArgs } from '../infrastructure.ts';
import { openGraph, applyCursorCeiling, emitCursorWarning } from '../shared.ts';
import { historySchema } from '../schemas.ts';
import type { CliOptions, WarpGraphInstance } from '../types.ts';

const HISTORY_OPTIONS = {
  node: { type: 'string' },
};

type WriterPatchEntry = Awaited<ReturnType<WarpGraphInstance['getWriterPatches']>>[number];
type PatchOp = WriterPatchEntry['patch']['ops'][number];

type HistoryEntry = {
  readonly sha: string;
  readonly fullSha: string;
  readonly writer: string;
  readonly lamport: number;
  readonly opCount: number;
};

type HistoryPayload = {
  readonly graph: string;
  readonly writer: string;
  readonly node: string | null;
  readonly entries: readonly HistoryEntry[];
};

function opNodeMatches(op: PatchOp, nodeId: string): boolean {
  return 'node' in op && op.node === nodeId;
}

function opFromMatches(op: PatchOp, nodeId: string): boolean {
  return 'from' in op && op.from === nodeId;
}

function opToMatches(op: PatchOp, nodeId: string): boolean {
  return 'to' in op && op.to === nodeId;
}

function opTouchesNode(op: PatchOp, nodeId: string): boolean {
  return opNodeMatches(op, nodeId) || opFromMatches(op, nodeId) || opToMatches(op, nodeId);
}

function patchTouchesNode(entry: WriterPatchEntry, nodeId: string | null): boolean {
  if (nodeId === null) {
    return true;
  }
  return entry.patch.ops.some((op) => opTouchesNode(op, nodeId));
}

function toHistoryEntry(entry: WriterPatchEntry, writer: string): HistoryEntry {
  return {
    sha: entry.sha.slice(0, 7),
    fullSha: entry.sha,
    writer,
    lamport: entry.patch.lamport,
    opCount: entry.patch.ops.length,
  };
}

/** Handles `git warp history`: lists a writer's patch chain. */
export default async function handleHistory({ options, args }: { options: CliOptions; args: string[] }): Promise<{ payload: HistoryPayload; exitCode: number }> {
  const { values } = parseCommandArgs(args, HISTORY_OPTIONS, historySchema);
  const { graph, graphName, persistence } = await openGraph(options);
  const cursorInfo = await applyCursorCeiling(graph, persistence, graphName);
  emitCursorWarning(cursorInfo, null);

  const node = values.node ?? null;
  const patches = await graph.getWriterPatches(options.writer);
  const entries = patches
    .filter((entry) => patchTouchesNode(entry, node))
    .sort((a, b) => a.patch.lamport - b.patch.lamport)
    .map((entry) => toHistoryEntry(entry, options.writer));

  return {
    payload: { graph: graphName, writer: options.writer, node, entries },
    exitCode: EXIT_CODES.OK,
  };
}

import { diffStates, type StateDiffResult } from '../../../src/domain/services/state/StateDiff.ts';
import {
  clearActiveCursor,
  readSavedCursor,
  writeSavedCursor,
  deleteSavedCursor,
  listSavedCursors,
} from './seekCursorHelpers.ts';
import {
  buildTickReceipt,
  computeFrontierHash,
  countPatchesAtTick,
  serializePerWriter,
} from '../time-travel-shared.ts';
import { EXIT_CODES, usageError, notFoundError, parseCommandArgs } from '../infrastructure.ts';
import { seekSchema } from '../schemas.ts';
import { openGraph, readActiveCursor, writeActiveCursor, wireSeekCache } from '../shared.ts';
import type { WarpState } from '../../../src/domain/services/JoinReducer.ts';
import type { CliOptions, Persistence, WarpGraphInstance, WriterTickInfo, CursorBlob, SeekSpec } from '../types.ts';

// ============================================================================
// Seek Arg Parser
// ============================================================================

const SEEK_OPTIONS = {
  tick: { type: 'string' },
  latest: { type: 'boolean', default: false },
  save: { type: 'string' },
  load: { type: 'string' },
  list: { type: 'boolean', default: false },
  drop: { type: 'string' },
  'clear-cache': { type: 'boolean', default: false },
  'no-persistent-cache': { type: 'boolean', default: false },
  diff: { type: 'boolean', default: false },
  'diff-limit': { type: 'string', default: '2000' },
};

const ABSOLUTE_TICK_PATTERN = /^[0-9]+$/u;
const RELATIVE_TICK_PATTERN = /^[+-][0-9]+$/u;

/** Parses raw CLI args into a validated seek specification. */
function parseSeekArgs(args: string[]): SeekSpec {
  const { values } = parseCommandArgs(args, SEEK_OPTIONS, seekSchema);
  return values as SeekSpec;
}

// ============================================================================
// Tick Resolution
// ============================================================================

function parseRelativeTickDelta(tickValue: string): number {
  if (!RELATIVE_TICK_PATTERN.test(tickValue)) {
    throw usageError(`Invalid tick delta: ${tickValue}`);
  }
  const delta = Number(tickValue);
  if (!Number.isInteger(delta)) {
    throw usageError(`Invalid tick delta: ${tickValue}`);
  }
  return delta;
}

function parseAbsoluteTick(tickValue: string): number {
  if (!ABSOLUTE_TICK_PATTERN.test(tickValue)) {
    throw usageError(`Invalid tick value: ${tickValue}. Must be a non-negative integer, or +N/-N for relative.`);
  }
  const n = Number(tickValue);
  if (!Number.isInteger(n)) {
    throw usageError(`Invalid tick value: ${tickValue}. Must be a non-negative integer, or +N/-N for relative.`);
  }
  return n;
}

/** Resolves a tick string (absolute or relative delta) to a concrete tick number. */
function resolveTickValue(tickValue: string, currentTick: number | null, ticks: number[], maxTick: number): number {
  if (tickValue.startsWith('+') || tickValue.startsWith('-')) {
    const delta = parseRelativeTickDelta(tickValue);
    const base = currentTick ?? 0;
    const allPoints = (ticks.length > 0 && ticks[0] === 0) ? [...ticks] : [0, ...ticks];
    const currentIdx = allPoints.indexOf(base);
    const startIdx = currentIdx === -1 ? 0 : currentIdx;
    const targetIdx = Math.max(0, Math.min(allPoints.length - 1, startIdx + delta));
    return allPoints[targetIdx] ?? 0;
  }

  const n = parseAbsoluteTick(tickValue);
  return Math.min(n, maxTick);
}

// ============================================================================
// Seek Helpers
// ============================================================================

/** Extracts node and edge counts from a cursor blob, returning nulls if absent. */
function readSeekCounts(cursor: CursorBlob | null): { nodes: number | null; edges: number | null } {
  if (!cursor || typeof cursor !== 'object') {
    return { nodes: null, edges: null };
  }
  const nodes = typeof cursor.nodes === 'number' && Number.isFinite(cursor.nodes) ? cursor.nodes : null;
  const edges = typeof cursor.edges === 'number' && Number.isFinite(cursor.edges) ? cursor.edges : null;
  return { nodes, edges };
}

/** Computes the delta between the previous cursor counts and new counts, if the frontier hash matches. */
function computeSeekStateDiff(prevCursor: CursorBlob | null, next: { nodes: number; edges: number }, frontierHash: string): { nodes: number; edges: number } | null {
  const prev = readSeekCounts(prevCursor);
  if (prev.nodes === null || prev.edges === null) {
    return null;
  }
  const prevFrontierHash = typeof prevCursor?.frontierHash === 'string' ? prevCursor.frontierHash : null;
  if (typeof prevFrontierHash !== 'string' || prevFrontierHash.length === 0 || prevFrontierHash !== frontierHash) {
    return null;
  }
  return {
    nodes: next.nodes - prev.nodes,
    edges: next.edges - prev.edges,
  };
}

/** Materializes two tick states and computes the structural diff between them. */
async function computeStructuralDiff({ graph, prevTick, currentTick, diffLimit }: { graph: WarpGraphInstance; prevTick: number | null; currentTick: number; diffLimit: number }): Promise<{ structuralDiff: unknown; diffBaseline: string; baselineTick: number | null; truncated: boolean; totalChanges: number; shownChanges: number }> {
  let beforeState: WarpState | null = null;
  let diffBaseline = 'empty';
  let baselineTick: number | null = null;

  if (prevTick !== null && prevTick === currentTick) {
    const empty = { nodes: { added: [], removed: [] }, edges: { added: [], removed: [] }, props: { set: [], removed: [] } };
    return { structuralDiff: empty, diffBaseline: 'tick', baselineTick: prevTick, truncated: false, totalChanges: 0, shownChanges: 0 };
  }

  if (prevTick !== null && prevTick > 0) {
    await graph.materialize({ ceiling: prevTick });
    beforeState = graph._cachedState;
    diffBaseline = 'tick';
    baselineTick = prevTick;
  }

  await graph.materialize({ ceiling: currentTick });
  const afterState = graph._cachedState;
  if (!afterState) {
    const empty = { nodes: { added: [], removed: [] }, edges: { added: [], removed: [] }, props: { set: [], removed: [] } };
    return applyDiffLimit(empty as StateDiffResult, diffBaseline, baselineTick, diffLimit);
  }
  const diff = diffStates(beforeState, afterState);

  return applyDiffLimit(diff, diffBaseline, baselineTick, diffLimit);
}

/** Truncates a structural diff to the specified limit, returning metadata about truncation. */
function applyDiffLimit(diff: StateDiffResult, diffBaseline: string, baselineTick: number | null, diffLimit: number): { structuralDiff: StateDiffResult; diffBaseline: string; baselineTick: number | null; truncated: boolean; totalChanges: number; shownChanges: number } {
  const totalChanges =
    diff.nodes.added.length + diff.nodes.removed.length +
    diff.edges.added.length + diff.edges.removed.length +
    diff.props.set.length + diff.props.removed.length;

  if (totalChanges <= diffLimit) {
    return { structuralDiff: diff, diffBaseline, baselineTick, truncated: false, totalChanges, shownChanges: totalChanges };
  }

  let remaining = diffLimit;
  /** Caps an array to the remaining budget and decrements the budget. */
  const cap = (arr: unknown[]): unknown[] => {
    const take = Math.min(arr.length, remaining);
    remaining -= take;
    return arr.slice(0, take);
  };

  const capped = {
    nodes: { added: cap(diff.nodes.added), removed: cap(diff.nodes.removed) },
    edges: { added: cap(diff.edges.added), removed: cap(diff.edges.removed) },
    props: { set: cap(diff.props.set), removed: cap(diff.props.removed) },
  };

  const shownChanges = diffLimit - remaining;
  return { structuralDiff: capped as StateDiffResult, diffBaseline, baselineTick, truncated: true, totalChanges, shownChanges };
}

// ============================================================================
// Seek Status Handler
// ============================================================================

/** Handles the bare `seek` (no action flags) by returning current cursor status. */
async function handleSeekStatus({ graph, graphName, persistence, activeCursor, ticks, maxTick, perWriter, frontierHash }: {
  graph: WarpGraphInstance;
  graphName: string;
  persistence: Persistence;
  activeCursor: CursorBlob | null;
  ticks: number[];
  maxTick: number;
  perWriter: Map<string, WriterTickInfo>;
  frontierHash: string;
}): Promise<{ payload: unknown; exitCode: number }> {
  if (activeCursor) {
    await graph.materialize({ ceiling: activeCursor.tick });
    const nodes = await graph.getNodes();
    const edges = await graph.getEdges();
    const prevCounts = readSeekCounts(activeCursor);
    const prevFrontierHash = typeof activeCursor.frontierHash === 'string' ? activeCursor.frontierHash : null;
    if (prevCounts.nodes === null || prevCounts.edges === null || prevCounts.nodes !== nodes.length || prevCounts.edges !== edges.length || prevFrontierHash !== frontierHash) {
      await writeActiveCursor(persistence, graphName, { tick: activeCursor.tick, mode: activeCursor.mode ?? 'lamport', nodes: nodes.length, edges: edges.length, frontierHash });
    }
    const diff = computeSeekStateDiff(activeCursor, { nodes: nodes.length, edges: edges.length }, frontierHash);
    const tickReceipt = await buildTickReceipt({ tick: activeCursor.tick, perWriter, graph });
    return {
      payload: {
        graph: graphName,
        action: 'status',
        tick: activeCursor.tick,
        maxTick,
        ticks,
        nodes: nodes.length,
        edges: edges.length,
        perWriter: serializePerWriter(perWriter),
        patchCount: countPatchesAtTick(activeCursor.tick, perWriter),
        diff,
        tickReceipt,
        cursor: { active: true, mode: activeCursor.mode, tick: activeCursor.tick, maxTick, name: 'active' },
      },
      exitCode: EXIT_CODES.OK,
    };
  }
  await graph.materialize();
  const nodes = await graph.getNodes();
  const edges = await graph.getEdges();
  const tickReceipt = await buildTickReceipt({ tick: maxTick, perWriter, graph });
  return {
    payload: {
      graph: graphName,
      action: 'status',
      tick: maxTick,
      maxTick,
      ticks,
      nodes: nodes.length,
      edges: edges.length,
      perWriter: serializePerWriter(perWriter),
      patchCount: countPatchesAtTick(maxTick, perWriter),
      diff: null,
      tickReceipt,
      cursor: { active: false },
    },
    exitCode: EXIT_CODES.OK,
  };
}

// ============================================================================
// Main Seek Handler
// ============================================================================

/** Handles the `git warp seek` command across all sub-actions. */
export default async function handleSeek({ options, args }: { options: CliOptions; args: string[] }): Promise<{ payload: unknown; exitCode: number }> {
  const seekSpec = parseSeekArgs(args);
  const { graph, graphName, persistence, plumbing } = await openGraph(options);
  void wireSeekCache({ graph, persistence, plumbing, graphName, seekSpec });

  // Handle --clear-cache before discovering ticks (no materialization needed)
  if (seekSpec.action === 'clear-cache') {
    if (graph.seekCache) {
      await graph.seekCache.clear();
    }
    return {
      payload: { graph: graphName, action: 'clear-cache', message: 'Seek cache cleared.' },
      exitCode: EXIT_CODES.OK,
    };
  }

  const activeCursor = await readActiveCursor(persistence, graphName);
  const { ticks, maxTick, perWriter } = await graph.discoverTicks();
  const frontierHash = await computeFrontierHash(perWriter);
  if (seekSpec.action === 'list') {
    const saved = await listSavedCursors(persistence, graphName);
    return {
      payload: {
        graph: graphName,
        action: 'list',
        cursors: saved,
        activeTick: activeCursor ? activeCursor.tick : null,
        maxTick,
      },
      exitCode: EXIT_CODES.OK,
    };
  }
  if (seekSpec.action === 'drop') {
    const dropName = seekSpec.name as string;
    const existing = await readSavedCursor(persistence, graphName, dropName);
    if (!existing) {
      throw notFoundError(`Saved cursor not found: ${dropName}`);
    }
    await deleteSavedCursor(persistence, graphName, dropName);
    return {
      payload: {
        graph: graphName,
        action: 'drop',
        name: seekSpec.name,
        tick: existing.tick,
      },
      exitCode: EXIT_CODES.OK,
    };
  }
  if (seekSpec.action === 'latest') {
    const prevTick = activeCursor ? activeCursor.tick : null;
    let sdResult: { structuralDiff: unknown; diffBaseline: string; baselineTick: number | null; truncated: boolean; totalChanges: number; shownChanges: number } | null = null;
    if (seekSpec.diff) {
      sdResult = await computeStructuralDiff({ graph, prevTick, currentTick: maxTick, diffLimit: seekSpec.diffLimit });
    }
    await clearActiveCursor(persistence, graphName);
    // When --diff already materialized at maxTick, skip redundant re-materialize
    if (!sdResult) {
      await graph.materialize({ ceiling: maxTick });
    }
    const nodes = await graph.getNodes();
    const edges = await graph.getEdges();
    const diff = computeSeekStateDiff(activeCursor, { nodes: nodes.length, edges: edges.length }, frontierHash);
    const tickReceipt = await buildTickReceipt({ tick: maxTick, perWriter, graph });
    return {
      payload: {
        graph: graphName,
        action: 'latest',
        tick: maxTick,
        maxTick,
        ticks,
        nodes: nodes.length,
        edges: edges.length,
        perWriter: serializePerWriter(perWriter),
        patchCount: countPatchesAtTick(maxTick, perWriter),
        diff,
        tickReceipt,
        cursor: { active: false },
        ...(sdResult ?? {}),
      },
      exitCode: EXIT_CODES.OK,
    };
  }
  if (seekSpec.action === 'save') {
    if (!activeCursor) {
      throw usageError('No active cursor to save. Use --tick first.');
    }
    await writeSavedCursor(persistence, graphName, seekSpec.name as string, activeCursor);
    return {
      payload: {
        graph: graphName,
        action: 'save',
        name: seekSpec.name,
        tick: activeCursor.tick,
      },
      exitCode: EXIT_CODES.OK,
    };
  }
  if (seekSpec.action === 'load') {
    const loadName = seekSpec.name as string;
    const saved = await readSavedCursor(persistence, graphName, loadName);
    if (!saved) {
      throw notFoundError(`Saved cursor not found: ${loadName}`);
    }
    const prevTick = activeCursor ? activeCursor.tick : null;
    let sdResult: { structuralDiff: unknown; diffBaseline: string; baselineTick: number | null; truncated: boolean; totalChanges: number; shownChanges: number } | null = null;
    if (seekSpec.diff) {
      sdResult = await computeStructuralDiff({ graph, prevTick, currentTick: saved.tick, diffLimit: seekSpec.diffLimit });
    }
    // When --diff already materialized at saved.tick, skip redundant call
    if (!sdResult) {
      await graph.materialize({ ceiling: saved.tick });
    }
    const nodes = await graph.getNodes();
    const edges = await graph.getEdges();
    await writeActiveCursor(persistence, graphName, { tick: saved.tick, mode: saved.mode ?? 'lamport', nodes: nodes.length, edges: edges.length, frontierHash });
    const diff = computeSeekStateDiff(activeCursor, { nodes: nodes.length, edges: edges.length }, frontierHash);
    const tickReceipt = await buildTickReceipt({ tick: saved.tick, perWriter, graph });
    return {
      payload: {
        graph: graphName,
        action: 'load',
        name: seekSpec.name,
        tick: saved.tick,
        maxTick,
        ticks,
        nodes: nodes.length,
        edges: edges.length,
        perWriter: serializePerWriter(perWriter),
        patchCount: countPatchesAtTick(saved.tick, perWriter),
        diff,
        tickReceipt,
        cursor: { active: true, mode: saved.mode, tick: saved.tick, maxTick, name: seekSpec.name },
        ...(sdResult ?? {}),
      },
      exitCode: EXIT_CODES.OK,
    };
  }
  if (seekSpec.action === 'tick') {
    const currentTick = activeCursor ? activeCursor.tick : null;
    const resolvedTick = resolveTickValue(seekSpec.tickValue as string, currentTick, ticks, maxTick);
    let sdResult: { structuralDiff: unknown; diffBaseline: string; baselineTick: number | null; truncated: boolean; totalChanges: number; shownChanges: number } | null = null;
    if (seekSpec.diff) {
      sdResult = await computeStructuralDiff({ graph, prevTick: currentTick, currentTick: resolvedTick, diffLimit: seekSpec.diffLimit });
    }
    // When --diff already materialized at resolvedTick, skip redundant call
    if (!sdResult) {
      await graph.materialize({ ceiling: resolvedTick });
    }
    const nodes = await graph.getNodes();
    const edges = await graph.getEdges();
    await writeActiveCursor(persistence, graphName, { tick: resolvedTick, mode: 'lamport', nodes: nodes.length, edges: edges.length, frontierHash });
    const diff = computeSeekStateDiff(activeCursor, { nodes: nodes.length, edges: edges.length }, frontierHash);
    const tickReceipt = await buildTickReceipt({ tick: resolvedTick, perWriter, graph });
    return {
      payload: {
        graph: graphName,
        action: 'tick',
        tick: resolvedTick,
        maxTick,
        ticks,
        nodes: nodes.length,
        edges: edges.length,
        perWriter: serializePerWriter(perWriter),
        patchCount: countPatchesAtTick(resolvedTick, perWriter),
        diff,
        tickReceipt,
        cursor: { active: true, mode: 'lamport', tick: resolvedTick, maxTick, name: 'active' },
        ...(sdResult ?? {}),
      },
      exitCode: EXIT_CODES.OK,
    };
  }

  // status (bare seek)
  return await handleSeekStatus({ graph, graphName, persistence, activeCursor, ticks, maxTick, perWriter, frontierHash });
}

import { summarizeOps } from '../../../src/visualization/renderers/ascii/history.js';
import { diffStates } from '../../../src/domain/services/StateDiff.js';
import {
  buildCursorActiveRef,
  buildCursorSavedRef,
  buildCursorSavedPrefix,
} from '../../../src/domain/utils/RefLayout.js';
import { parseCursorBlob } from '../../../src/domain/utils/parseCursorBlob.js';
import { stableStringify } from '../../presenters/json.js';
import { EXIT_CODES, usageError, notFoundError, parseCommandArgs } from '../infrastructure.js';
import { seekSchema } from '../schemas.js';
import { openGraph, readActiveCursor, writeActiveCursor, wireSeekCache } from '../shared.js';

/** @typedef {import('../types.js').CliOptions} CliOptions */
/** @typedef {import('../types.js').Persistence} Persistence */
/** @typedef {import('../types.js').WarpGraphInstance} WarpGraphInstance */
/** @typedef {import('../types.js').WriterTickInfo} WriterTickInfo */
/** @typedef {import('../types.js').CursorBlob} CursorBlob */
/** @typedef {import('../types.js').SeekSpec} SeekSpec */

// ============================================================================
// Cursor I/O Helpers (seek-only)
// ============================================================================

/**
 * Removes the active seek cursor for a graph, returning to present state.
 *
 * @param {Persistence} persistence
 * @param {string} graphName
 * @returns {Promise<void>}
 */
async function clearActiveCursor(persistence, graphName) {
  const ref = buildCursorActiveRef(graphName);
  const exists = await persistence.readRef(ref);
  if (exists) {
    await persistence.deleteRef(ref);
  }
}

/**
 * Reads a named saved cursor from Git ref storage.
 *
 * @param {Persistence} persistence
 * @param {string} graphName
 * @param {string} name
 * @returns {Promise<CursorBlob|null>}
 */
async function readSavedCursor(persistence, graphName, name) {
  const ref = buildCursorSavedRef(graphName, name);
  const oid = await persistence.readRef(ref);
  if (!oid) {
    return null;
  }
  const buf = await persistence.readBlob(oid);
  return parseCursorBlob(buf, `saved cursor '${name}'`);
}

/**
 * Persists a cursor under a named saved-cursor ref.
 *
 * @param {Persistence} persistence
 * @param {string} graphName
 * @param {string} name
 * @param {CursorBlob} cursor
 * @returns {Promise<void>}
 */
async function writeSavedCursor(persistence, graphName, name, cursor) {
  const ref = buildCursorSavedRef(graphName, name);
  const json = JSON.stringify(cursor);
  const oid = await persistence.writeBlob(Buffer.from(json, 'utf8'));
  await persistence.updateRef(ref, oid);
}

/**
 * Deletes a named saved cursor from Git ref storage.
 *
 * @param {Persistence} persistence
 * @param {string} graphName
 * @param {string} name
 * @returns {Promise<void>}
 */
async function deleteSavedCursor(persistence, graphName, name) {
  const ref = buildCursorSavedRef(graphName, name);
  const exists = await persistence.readRef(ref);
  if (exists) {
    await persistence.deleteRef(ref);
  }
}

/**
 * Lists all saved cursors for a graph.
 *
 * @param {Persistence} persistence
 * @param {string} graphName
 * @returns {Promise<Array<{name: string, tick: number, mode?: string}>>}
 */
async function listSavedCursors(persistence, graphName) {
  const prefix = buildCursorSavedPrefix(graphName);
  const refs = await persistence.listRefs(prefix);
  const cursors = [];
  for (const ref of refs) {
    const name = ref.slice(prefix.length);
    if (name) {
      const oid = await persistence.readRef(ref);
      if (oid) {
        const buf = await persistence.readBlob(oid);
        const cursor = parseCursorBlob(buf, `saved cursor '${name}'`);
        cursors.push({ name, ...cursor });
      }
    }
  }
  return cursors;
}

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

/**
 * @param {string[]} args
 * @returns {SeekSpec}
 */
function parseSeekArgs(args) {
  const { values } = parseCommandArgs(args, SEEK_OPTIONS, seekSchema);
  return /** @type {SeekSpec} */ (values);
}

// ============================================================================
// Tick Resolution
// ============================================================================

/**
 * @param {string} tickValue
 * @param {number|null} currentTick
 * @param {number[]} ticks
 * @param {number} maxTick
 * @returns {number}
 */
function resolveTickValue(tickValue, currentTick, ticks, maxTick) {
  if (tickValue.startsWith('+') || tickValue.startsWith('-')) {
    const delta = parseInt(tickValue, 10);
    if (!Number.isInteger(delta)) {
      throw usageError(`Invalid tick delta: ${tickValue}`);
    }
    const base = currentTick ?? 0;
    const allPoints = (ticks.length > 0 && ticks[0] === 0) ? [...ticks] : [0, ...ticks];
    const currentIdx = allPoints.indexOf(base);
    const startIdx = currentIdx === -1 ? 0 : currentIdx;
    const targetIdx = Math.max(0, Math.min(allPoints.length - 1, startIdx + delta));
    return allPoints[targetIdx];
  }

  const n = parseInt(tickValue, 10);
  if (!Number.isInteger(n) || n < 0) {
    throw usageError(`Invalid tick value: ${tickValue}. Must be a non-negative integer, or +N/-N for relative.`);
  }
  return Math.min(n, maxTick);
}

// ============================================================================
// Seek Helpers
// ============================================================================

/**
 * @param {Map<string, WriterTickInfo>} perWriter
 * @returns {Record<string, WriterTickInfo>}
 */
function serializePerWriter(perWriter) {
  /** @type {Record<string, WriterTickInfo>} */
  const result = {};
  for (const [writerId, info] of perWriter) {
    result[writerId] = { ticks: info.ticks, tipSha: info.tipSha, tickShas: info.tickShas };
  }
  return result;
}

/**
 * @param {number} tick
 * @param {Map<string, WriterTickInfo>} perWriter
 * @returns {number}
 */
function countPatchesAtTick(tick, perWriter) {
  let count = 0;
  for (const [, info] of perWriter) {
    for (const t of info.ticks) {
      if (t <= tick) {
        count++;
      }
    }
  }
  return count;
}

/**
 * @param {Map<string, WriterTickInfo>} perWriter
 * @returns {Promise<string>}
 */
async function computeFrontierHash(perWriter) {
  /** @type {Record<string, string|null>} */
  const tips = {};
  for (const [writerId, info] of perWriter) {
    tips[writerId] = info?.tipSha || null;
  }
  const data = new TextEncoder().encode(stableStringify(tips));
  const digest = await globalThis.crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * @param {CursorBlob|null} cursor
 * @returns {{nodes: number|null, edges: number|null}}
 */
function readSeekCounts(cursor) {
  if (!cursor || typeof cursor !== 'object') {
    return { nodes: null, edges: null };
  }
  const nodes = typeof cursor.nodes === 'number' && Number.isFinite(cursor.nodes) ? cursor.nodes : null;
  const edges = typeof cursor.edges === 'number' && Number.isFinite(cursor.edges) ? cursor.edges : null;
  return { nodes, edges };
}

/**
 * @param {CursorBlob|null} prevCursor
 * @param {{nodes: number, edges: number}} next
 * @param {string} frontierHash
 * @returns {{nodes: number, edges: number}|null}
 */
function computeSeekStateDiff(prevCursor, next, frontierHash) {
  const prev = readSeekCounts(prevCursor);
  if (prev.nodes === null || prev.edges === null) {
    return null;
  }
  const prevFrontierHash = typeof prevCursor?.frontierHash === 'string' ? prevCursor.frontierHash : null;
  if (!prevFrontierHash || prevFrontierHash !== frontierHash) {
    return null;
  }
  return {
    nodes: next.nodes - prev.nodes,
    edges: next.edges - prev.edges,
  };
}

/**
 * @param {{tick: number, perWriter: Map<string, WriterTickInfo>, graph: WarpGraphInstance}} params
 * @returns {Promise<Record<string, {sha: string, opSummary: *}>|null>}
 */
async function buildTickReceipt({ tick, perWriter, graph }) {
  if (!Number.isInteger(tick) || tick <= 0) {
    return null;
  }

  /** @type {Record<string, {sha: string, opSummary: *}>} */
  const receipt = {};

  for (const [writerId, info] of perWriter) {
    const sha = /** @type {*} */ (info?.tickShas)?.[tick]; // TODO(ts-cleanup): type CLI payload
    if (!sha) {
      continue;
    }

    const patch = await graph.loadPatchBySha(sha);
    const ops = Array.isArray(patch?.ops) ? patch.ops : [];
    receipt[writerId] = { sha, opSummary: summarizeOps(ops) };
  }

  return Object.keys(receipt).length > 0 ? receipt : null;
}

/**
 * @param {{graph: WarpGraphInstance, prevTick: number|null, currentTick: number, diffLimit: number}} params
 * @returns {Promise<{structuralDiff: *, diffBaseline: string, baselineTick: number|null, truncated: boolean, totalChanges: number, shownChanges: number}>}
 */
async function computeStructuralDiff({ graph, prevTick, currentTick, diffLimit }) {
  let beforeState = null;
  let diffBaseline = 'empty';
  let baselineTick = null;

  if (prevTick !== null && prevTick === currentTick) {
    const empty = { nodes: { added: [], removed: [] }, edges: { added: [], removed: [] }, props: { set: [], removed: [] } };
    return { structuralDiff: empty, diffBaseline: 'tick', baselineTick: prevTick, truncated: false, totalChanges: 0, shownChanges: 0 };
  }

  if (prevTick !== null && prevTick > 0) {
    await graph.materialize({ ceiling: prevTick });
    beforeState = await graph.getStateSnapshot();
    diffBaseline = 'tick';
    baselineTick = prevTick;
  }

  await graph.materialize({ ceiling: currentTick });
  const afterState = /** @type {*} */ (await graph.getStateSnapshot()); // TODO(ts-cleanup): narrow WarpStateV5
  const diff = diffStates(beforeState, afterState);

  return applyDiffLimit(diff, diffBaseline, baselineTick, diffLimit);
}

/**
 * @param {*} diff
 * @param {string} diffBaseline
 * @param {number|null} baselineTick
 * @param {number} diffLimit
 * @returns {{structuralDiff: *, diffBaseline: string, baselineTick: number|null, truncated: boolean, totalChanges: number, shownChanges: number}}
 */
function applyDiffLimit(diff, diffBaseline, baselineTick, diffLimit) {
  const totalChanges =
    diff.nodes.added.length + diff.nodes.removed.length +
    diff.edges.added.length + diff.edges.removed.length +
    diff.props.set.length + diff.props.removed.length;

  if (totalChanges <= diffLimit) {
    return { structuralDiff: diff, diffBaseline, baselineTick, truncated: false, totalChanges, shownChanges: totalChanges };
  }

  let remaining = diffLimit;
  const cap = (/** @type {any[]} */ arr) => {
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
  return { structuralDiff: capped, diffBaseline, baselineTick, truncated: true, totalChanges, shownChanges };
}

// ============================================================================
// Seek Status Handler
// ============================================================================

/**
 * @param {{graph: WarpGraphInstance, graphName: string, persistence: Persistence, activeCursor: CursorBlob|null, ticks: number[], maxTick: number, perWriter: Map<string, WriterTickInfo>, frontierHash: string}} params
 * @returns {Promise<{payload: *, exitCode: number}>}
 */
async function handleSeekStatus({ graph, graphName, persistence, activeCursor, ticks, maxTick, perWriter, frontierHash }) {
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

/**
 * Handles the `git warp seek` command across all sub-actions.
 * @param {{options: CliOptions, args: string[]}} params
 * @returns {Promise<{payload: *, exitCode: number}>}
 */
export default async function handleSeek({ options, args }) {
  const seekSpec = parseSeekArgs(args);
  const { graph, graphName, persistence } = await openGraph(options);
  void wireSeekCache({ graph, persistence, graphName, seekSpec });

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
    const dropName = /** @type {string} */ (seekSpec.name);
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
    let sdResult = null;
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
        ...sdResult,
      },
      exitCode: EXIT_CODES.OK,
    };
  }
  if (seekSpec.action === 'save') {
    if (!activeCursor) {
      throw usageError('No active cursor to save. Use --tick first.');
    }
    await writeSavedCursor(persistence, graphName, /** @type {string} */ (seekSpec.name), activeCursor);
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
    const loadName = /** @type {string} */ (seekSpec.name);
    const saved = await readSavedCursor(persistence, graphName, loadName);
    if (!saved) {
      throw notFoundError(`Saved cursor not found: ${loadName}`);
    }
    const prevTick = activeCursor ? activeCursor.tick : null;
    let sdResult = null;
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
        ...sdResult,
      },
      exitCode: EXIT_CODES.OK,
    };
  }
  if (seekSpec.action === 'tick') {
    const currentTick = activeCursor ? activeCursor.tick : null;
    const resolvedTick = resolveTickValue(/** @type {string} */ (seekSpec.tickValue), currentTick, ticks, maxTick);
    let sdResult = null;
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
        ...sdResult,
      },
      exitCode: EXIT_CODES.OK,
    };
  }

  // status (bare seek)
  return await handleSeekStatus({ graph, graphName, persistence, activeCursor, ticks, maxTick, perWriter, frontierHash });
}

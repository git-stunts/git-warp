/**
 * Comparison methods for substrate-visible coordinate and working-set reads.
 *
 * These helpers compare only deterministic substrate facts:
 * - visible patch-universe divergence
 * - visible node / edge / property deltas
 * - optional node-local target diffs
 *
 * They do not introduce application semantics.
 *
 * @module domain/warp/comparison.methods
 */

import QueryError from '../errors/QueryError.js';
import { createStateReaderV5 } from '../services/StateReaderV5.js';
import { computeStateHashV5 } from '../services/StateSerializerV5.js';
import { compareVisibleStateV5 } from '../services/VisibleStateComparisonV5.js';
import WorkingSetService from '../services/WorkingSetService.js';
import { computeChecksum } from '../utils/checksumUtils.js';

const COORDINATE_COMPARISON_VERSION = 'coordinate-compare/v1';

/**
 * @typedef {import('../../../index.js').CoordinateComparisonSelectorV1} CoordinateComparisonSelectorV1
 * @typedef {import('../../../index.js').CoordinateComparisonV1} CoordinateComparisonV1
 * @typedef {import('../../../index.js').VisibleStateReaderV5} VisibleStateReaderV5
 */

/**
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
function compareStrings(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * @param {unknown} value
 * @param {string} field
 * @returns {number|null}
 */
function normalizeLamportCeiling(value, field) {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new QueryError(`${field} must be a non-negative integer or null`, {
      code: 'invalid_coordinate',
      context: { field, value },
    });
  }
  return value;
}

/**
 * @param {unknown} value
 * @param {string} field
 * @returns {string|null}
 */
function normalizeOptionalString(value, field) {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new QueryError(`${field} must be a non-empty string when provided`, {
      code: 'invalid_coordinate',
      context: { field, valueType: typeof value },
    });
  }
  return value.trim();
}

/**
 * @param {unknown} value
 * @param {string} field
 * @returns {string}
 */
function normalizeRequiredString(value, field) {
  const normalized = normalizeOptionalString(value, field);
  if (!normalized) {
    throw new QueryError(`${field} must be a non-empty string`, {
      code: 'invalid_coordinate',
      context: { field },
    });
  }
  return normalized;
}

/**
 * @param {Map<string, string>|Record<string, string>} frontier
 * @returns {Array<[string, string]>|null}
 */
function frontierEntries(frontier) {
  if (frontier instanceof Map) {
    return [...frontier.entries()];
  }
  if (frontier && typeof frontier === 'object' && !Array.isArray(frontier)) {
    return Object.entries(frontier);
  }
  return null;
}

/**
 * @param {string} writerId
 * @param {string} sha
 * @param {string} field
 * @returns {void}
 */
function assertFrontierEntry(writerId, sha, field) {
  if (typeof writerId !== 'string' || writerId.length === 0) {
    throw new QueryError(`${field} contains an invalid writer id`, {
      code: 'invalid_coordinate',
      context: { field, writerId },
    });
  }
  if (typeof sha !== 'string' || sha.length === 0) {
    throw new QueryError(`${field} contains an invalid patch sha`, {
      code: 'invalid_coordinate',
      context: { field, writerId, shaType: typeof sha },
    });
  }
}

/**
 * @param {Map<string, string>|Record<string, string>} frontier
 * @param {string} field
 * @returns {Record<string, string>}
 */
function normalizeFrontierRecord(frontier, field) {
  const entries = frontierEntries(frontier);

  if (!entries) {
    throw new QueryError(`${field} must be a frontier map or record`, {
      code: 'invalid_coordinate',
      context: { field },
    });
  }

  const record = /** @type {Record<string, string>} */ ({});
  for (const [writerId, sha] of entries.sort(([a], [b]) => compareStrings(a, b))) {
    assertFrontierEntry(writerId, sha, field);
    record[writerId] = sha;
  }
  return record;
}

/**
 * @param {Record<string, string>} frontierRecord
 * @returns {Map<string, string>}
 */
function frontierRecordToMap(frontierRecord) {
  return new Map(Object.entries(frontierRecord).sort(([a], [b]) => compareStrings(a, b)));
}

/**
 * @param {Map<string, number>} frontier
 * @returns {Record<string, number>}
 */
function observedLamportFrontierToRecord(frontier) {
  const record = /** @type {Record<string, number>} */ ({});
  for (const [writerId, sha] of [...frontier.entries()].sort(([a], [b]) => compareStrings(a, b))) {
    if (typeof sha === 'number' && Number.isFinite(sha)) {
      record[writerId] = sha;
    }
  }
  return record;
}

/**
 * @param {Array<{ patch: import('../types/WarpTypesV2.js').PatchV2, sha: string }>} entries
 * @returns {Record<string, string>}
 */
function patchFrontierFromEntries(entries) {
  const byWriter = new Map();
  for (const entry of entries) {
    const writerId = entry.patch.writer;
    const lamport = entry.patch.lamport ?? 0;
    const current = byWriter.get(writerId);
    if (!current || lamport > current.lamport || (lamport === current.lamport && compareStrings(entry.sha, current.sha) > 0)) {
      byWriter.set(writerId, { lamport, sha: entry.sha });
    }
  }

  return Object.fromEntries(
    [...byWriter.entries()]
      .sort(([a], [b]) => compareStrings(a, b))
      .map(([writerId, current]) => [writerId, current.sha]),
  );
}

/**
 * @param {number|null} left
 * @param {number|null} right
 * @returns {number|null}
 */
function combineCeilings(left, right) {
  if (left === null) {
    return right;
  }
  if (right === null) {
    return left;
  }
  return Math.min(left, right);
}

/**
 * @param {Record<string, string>} frontierRecord
 * @param {number|null} ceiling
 * @returns {{ frontier: Record<string, string>, ceiling: number|null }}
 */
function buildCoordinateRequest(frontierRecord, ceiling) {
  return {
    frontier: { ...frontierRecord },
    ceiling,
  };
}

/**
 * @param {import('../types/WarpTypesV2.js').PatchV2} patch
 * @param {string} entityId
 * @returns {boolean}
 */
function patchTouchesEntity(patch, entityId) {
  const reads = Array.isArray(patch.reads) ? patch.reads : [];
  const writes = Array.isArray(patch.writes) ? patch.writes : [];
  return reads.includes(entityId) || writes.includes(entityId);
}

/**
 * @param {Array<{ patch: import('../types/WarpTypesV2.js').PatchV2, sha: string }>} entries
 * @returns {string[]}
 */
function uniqueSortedPatchShas(entries) {
  return [...new Set(entries.map(({ sha }) => sha))].sort(compareStrings);
}

/**
 * @param {Array<{ patch: import('../types/WarpTypesV2.js').PatchV2, sha: string }>} entries
 * @param {string} targetId
 * @returns {string[]}
 */
function targetPatchShas(entries, targetId) {
  return [...new Set(
    entries
      .filter(({ patch }) => patchTouchesEntity(patch, targetId))
      .map(({ sha }) => sha),
  )].sort(compareStrings);
}

/**
 * @param {VisibleStateReaderV5} reader
 * @param {number} patchCount
 * @returns {{ nodeCount: number, edgeCount: number, nodePropertyCount: number, edgePropertyCount: number, patchCount: number }}
 */
function summarizeVisibleState(reader, patchCount) {
  const nodes = reader.getNodes();
  const edges = reader.getEdges();
  let nodePropertyCount = 0;
  for (const nodeId of nodes) {
    nodePropertyCount += Object.keys(reader.getNodeProps(nodeId) || {}).length;
  }
  let edgePropertyCount = 0;
  for (const edge of edges) {
    edgePropertyCount += Object.keys(edge.props || {}).length;
  }
  return {
    nodeCount: nodes.length,
    edgeCount: edges.length,
    nodePropertyCount,
    edgePropertyCount,
    patchCount,
  };
}

/**
 * @param {Array<{ patch: import('../types/WarpTypesV2.js').PatchV2, sha: string }>} leftEntries
 * @param {Array<{ patch: import('../types/WarpTypesV2.js').PatchV2, sha: string }>} rightEntries
 * @param {string|null} targetId
 * @returns {{
 *   sharedCount: number,
 *   leftOnlyCount: number,
 *   rightOnlyCount: number,
 *   leftOnlyPatchShas: string[],
 *   rightOnlyPatchShas: string[],
 *   target?: {
 *     targetId: string,
 *     leftCount: number,
 *     rightCount: number,
 *     sharedCount: number,
 *     leftOnlyCount: number,
 *     rightOnlyCount: number,
 *     leftOnlyPatchShas: string[],
 *     rightOnlyPatchShas: string[]
 *   }
 * }}
 */
function buildPatchDivergence(leftEntries, rightEntries, targetId) {
  const leftShas = uniqueSortedPatchShas(leftEntries);
  const rightShas = uniqueSortedPatchShas(rightEntries);
  const leftSet = new Set(leftShas);
  const rightSet = new Set(rightShas);
  const leftOnlyPatchShas = leftShas.filter((sha) => !rightSet.has(sha));
  const rightOnlyPatchShas = rightShas.filter((sha) => !leftSet.has(sha));

  const base = {
    sharedCount: leftShas.filter((sha) => rightSet.has(sha)).length,
    leftOnlyCount: leftOnlyPatchShas.length,
    rightOnlyCount: rightOnlyPatchShas.length,
    leftOnlyPatchShas,
    rightOnlyPatchShas,
  };

  if (!targetId) {
    return base;
  }

  const leftTarget = targetPatchShas(leftEntries, targetId);
  const rightTarget = targetPatchShas(rightEntries, targetId);
  const leftTargetSet = new Set(leftTarget);
  const rightTargetSet = new Set(rightTarget);
  const leftOnlyTarget = leftTarget.filter((sha) => !rightTargetSet.has(sha));
  const rightOnlyTarget = rightTarget.filter((sha) => !leftTargetSet.has(sha));

  return {
    ...base,
    target: {
      targetId,
      leftCount: leftTarget.length,
      rightCount: rightTarget.length,
      sharedCount: leftTarget.filter((sha) => rightTargetSet.has(sha)).length,
      leftOnlyCount: leftOnlyTarget.length,
      rightOnlyCount: rightOnlyTarget.length,
      leftOnlyPatchShas: leftOnlyTarget,
      rightOnlyPatchShas: rightOnlyTarget,
    },
  };
}

/**
 * @param {import('../WarpGraph.js').default} graph
 * @param {Record<string, string>} frontierRecord
 * @param {number|null} ceiling
 * @returns {Promise<Array<{ patch: import('../types/WarpTypesV2.js').PatchV2, sha: string }>>}
 */
async function collectPatchEntriesForFrontier(graph, frontierRecord, ceiling) {
  const frontier = frontierRecordToMap(frontierRecord);
  const entries = [];
  for (const writerId of frontier.keys()) {
    const tipSha = frontier.get(writerId);
    if (!tipSha) {
      continue;
    }
    const writerEntries = await graph._loadPatchChainFromSha(tipSha);
    for (const entry of writerEntries) {
      if (ceiling === null || (entry.patch.lamport ?? 0) <= ceiling) {
        entries.push(entry);
      }
    }
  }
  return entries;
}

/**
 * @param {unknown} selector
 * @param {string} field
 * @returns {{
 *   kind: 'live',
 *   ceiling: number|null
 * } | {
 *   kind: 'working_set'|'working_set_base',
 *   workingSetId: string,
 *   ceiling: number|null
 * } | {
 *   kind: 'coordinate',
 *   frontier: Record<string, string>,
 *   ceiling: number|null
 * }}
 */
function normalizeSelector(selector, field) {
  if (!selector || typeof selector !== 'object' || Array.isArray(selector)) {
    throw new QueryError(`${field} must be an object`, {
      code: 'invalid_coordinate',
      context: { field },
    });
  }

  const raw = /** @type {Record<string, unknown>} */ (selector);
  const { kind } = raw;
  if (kind === 'live') {
    return {
      kind,
      ceiling: normalizeLamportCeiling(raw.ceiling, `${field}.ceiling`),
    };
  }

  if (kind === 'working_set' || kind === 'working_set_base') {
    return {
      kind,
      workingSetId: normalizeRequiredString(raw.workingSetId, `${field}.workingSetId`),
      ceiling: normalizeLamportCeiling(raw.ceiling, `${field}.ceiling`),
    };
  }

  if (kind === 'coordinate') {
    return {
      kind,
      frontier: normalizeFrontierRecord(
        /** @type {Map<string, string>|Record<string, string>} */ (raw.frontier),
        `${field}.frontier`,
      ),
      ceiling: normalizeLamportCeiling(raw.ceiling, `${field}.ceiling`),
    };
  }

  throw new QueryError(`${field}.kind is unsupported`, {
    code: 'invalid_coordinate',
    context: { field, kind },
  });
}

/**
 * @param {number|null} ceiling
 * @returns {Record<string, number>}
 */
function optionalCeiling(ceiling) {
  return ceiling === null ? {} : { ceiling };
}

/**
 * @param {string} workingSetId
 * @param {import('../../../index.js').WorkingSetDescriptor} descriptor
 * @returns {{
 *   workingSetId: string,
 *   baseLamportCeiling: number|null,
 *   overlayHeadPatchSha: string|null,
 *   overlayPatchCount: number,
 *   overlayWritable: boolean,
 *   braid: {
 *     readOverlayCount: number,
 *     braidedWorkingSetIds: string[]
 *   }
 * }}
 */
function buildWorkingSetMetadata(workingSetId, descriptor) {
  return {
    workingSetId,
    baseLamportCeiling: descriptor.baseObservation.lamportCeiling,
    overlayHeadPatchSha: descriptor.overlay.headPatchSha,
    overlayPatchCount: descriptor.overlay.patchCount,
    overlayWritable: descriptor.overlay.writable ?? true,
    braid: {
      readOverlayCount: Array.isArray(descriptor.braid?.readOverlays)
        ? descriptor.braid.readOverlays.length
        : 0,
      braidedWorkingSetIds: Array.isArray(descriptor.braid?.readOverlays)
        ? descriptor.braid.readOverlays.map((overlay) => overlay.workingSetId).sort(compareStrings)
        : [],
    },
  };
}

/**
 * @param {import('../WarpGraph.js').default} graph
 * @param {{
 *   requested: Record<string, unknown>,
 *   state: import('../services/JoinReducer.js').WarpStateV5,
 *   patchEntries: Array<{ patch: import('../types/WarpTypesV2.js').PatchV2, sha: string }>,
 *   coordinateKind: 'frontier'|'working_set'|'working_set_base',
 *   lamportCeiling: number|null,
 *   workingSet?: {
 *     workingSetId: string,
 *     baseLamportCeiling: number|null,
 *     overlayHeadPatchSha: string|null,
 *     overlayPatchCount: number,
 *     overlayWritable: boolean,
 *     braid: {
 *       readOverlayCount: number,
 *       braidedWorkingSetIds: string[]
 *     }
 *   }
 * }} params
 * @returns {Promise<{
 *   requested: Record<string, unknown>,
 *   state: import('../services/JoinReducer.js').WarpStateV5,
 *   patchEntries: Array<{ patch: import('../types/WarpTypesV2.js').PatchV2, sha: string }>,
 *   resolved: {
 *     coordinateKind: 'frontier'|'working_set'|'working_set_base',
 *     patchFrontier: Record<string, string>,
 *     patchFrontierDigest: string,
 *     lamportFrontier: Record<string, number>,
 *     lamportFrontierDigest: string,
 *     lamportCeiling: number|null,
 *     stateHash: string,
 *     patchUniverseDigest: string,
 *     summary: {
 *       nodeCount: number,
 *       edgeCount: number,
 *       nodePropertyCount: number,
 *       edgePropertyCount: number,
 *       patchCount: number
 *     },
 *     workingSet?: {
 *       workingSetId: string,
 *       baseLamportCeiling: number|null,
 *       overlayHeadPatchSha: string|null,
 *       overlayPatchCount: number,
 *       overlayWritable: boolean,
 *       braid: {
 *         readOverlayCount: number,
 *         braidedWorkingSetIds: string[]
 *       }
 *     }
 *   }
 * }>}
 */
async function finalizeComparisonSide(graph, params) {
  const {
    requested,
    state,
    patchEntries,
    coordinateKind,
    lamportCeiling,
    workingSet,
  } = params;
  const visiblePatchFrontier = patchFrontierFromEntries(patchEntries);
  const visibleLamportFrontier = observedLamportFrontierToRecord(state.observedFrontier);
  const reader = createStateReaderV5(state);

  return {
    requested,
    state,
    patchEntries,
    resolved: {
      coordinateKind,
      patchFrontier: visiblePatchFrontier,
      patchFrontierDigest: await computeChecksum(visiblePatchFrontier, graph._crypto),
      lamportFrontier: visibleLamportFrontier,
      lamportFrontierDigest: await computeChecksum(visibleLamportFrontier, graph._crypto),
      lamportCeiling,
      stateHash: /** @type {string} */ (
        await computeStateHashV5(state, { crypto: graph._crypto, codec: graph._codec })
      ),
      patchUniverseDigest: await computeChecksum({ patches: uniqueSortedPatchShas(patchEntries) }, graph._crypto),
      summary: summarizeVisibleState(reader, patchEntries.length),
      ...(workingSet ? { workingSet } : {}),
    },
  };
}

/**
 * @param {import('../WarpGraph.js').default} graph
 * @param {{ kind: 'live', ceiling: number|null }} selector
 * @returns {Promise<ReturnType<typeof finalizeComparisonSide>>}
 */
async function resolveLiveComparisonSide(graph, selector) {
  const requestedFrontier = /** @type {Map<string, string>} */ (await graph.getFrontier());
  const requestedRecord = normalizeFrontierRecord(requestedFrontier, 'live.frontier');
  const state = await graph.materializeCoordinate({
    frontier: frontierRecordToMap(requestedRecord),
    ...optionalCeiling(selector.ceiling),
  });
  const patchEntries = await collectPatchEntriesForFrontier(graph, requestedRecord, selector.ceiling);
  return await finalizeComparisonSide(graph, {
    requested: {
      kind: 'live',
      ...optionalCeiling(selector.ceiling),
    },
    state,
    patchEntries,
    coordinateKind: 'frontier',
    lamportCeiling: selector.ceiling,
  });
}

/**
 * @param {import('../WarpGraph.js').default} graph
 * @param {{ kind: 'coordinate', frontier: Record<string, string>, ceiling: number|null }} selector
 * @returns {Promise<ReturnType<typeof finalizeComparisonSide>>}
 */
async function resolveCoordinateComparisonSide(graph, selector) {
  const state = await graph.materializeCoordinate({
    frontier: frontierRecordToMap(selector.frontier),
    ...optionalCeiling(selector.ceiling),
  });
  const patchEntries = await collectPatchEntriesForFrontier(graph, selector.frontier, selector.ceiling);
  return await finalizeComparisonSide(graph, {
    requested: {
      ...buildCoordinateRequest(selector.frontier, selector.ceiling),
      kind: 'coordinate',
    },
    state,
    patchEntries,
    coordinateKind: 'frontier',
    lamportCeiling: selector.ceiling,
  });
}

/**
 * @param {import('../WarpGraph.js').default} graph
 * @param {import('../services/WorkingSetService.js').default} workingSets
 * @param {{ kind: 'working_set', workingSetId: string, ceiling: number|null }} selector
 * @returns {Promise<ReturnType<typeof finalizeComparisonSide>>}
 */
async function resolveWorkingSetComparisonSide(graph, workingSets, selector) {
  const descriptor = await workingSets.getOrThrow(selector.workingSetId);
  const state = await graph.materializeWorkingSet(
    selector.workingSetId,
    selector.ceiling === null ? undefined : { ceiling: selector.ceiling },
  );
  const patchEntries = await workingSets.getPatchEntries(
    selector.workingSetId,
    selector.ceiling === null ? undefined : { ceiling: selector.ceiling },
  );
  return await finalizeComparisonSide(graph, {
    requested: {
      kind: 'working_set',
      workingSetId: selector.workingSetId,
      ...optionalCeiling(selector.ceiling),
    },
    state,
    patchEntries,
    coordinateKind: 'working_set',
    lamportCeiling: selector.ceiling,
    workingSet: buildWorkingSetMetadata(selector.workingSetId, descriptor),
  });
}

/**
 * @param {import('../WarpGraph.js').default} graph
 * @param {import('../services/WorkingSetService.js').default} workingSets
 * @param {{ kind: 'working_set_base', workingSetId: string, ceiling: number|null }} selector
 * @returns {Promise<ReturnType<typeof finalizeComparisonSide>>}
 */
async function resolveWorkingSetBaseComparisonSide(graph, workingSets, selector) {
  const descriptor = await workingSets.getOrThrow(selector.workingSetId);
  const effectiveCeiling = combineCeilings(descriptor.baseObservation.lamportCeiling, selector.ceiling);
  const state = await graph.materializeCoordinate({
    frontier: descriptor.baseObservation.frontier,
    ...optionalCeiling(effectiveCeiling),
  });
  const patchEntries = await collectPatchEntriesForFrontier(
    graph,
    descriptor.baseObservation.frontier,
    effectiveCeiling,
  );
  return await finalizeComparisonSide(graph, {
    requested: {
      kind: 'working_set_base',
      workingSetId: selector.workingSetId,
      frontier: { ...descriptor.baseObservation.frontier },
      baseLamportCeiling: descriptor.baseObservation.lamportCeiling,
      ...optionalCeiling(selector.ceiling),
    },
    state,
    patchEntries,
    coordinateKind: 'working_set_base',
    lamportCeiling: effectiveCeiling,
    workingSet: buildWorkingSetMetadata(selector.workingSetId, descriptor),
  });
}

/**
 * @this {import('../WarpGraph.js').default}
 * @param {{
 *   kind: 'live',
 *   ceiling: number|null
 * } | {
 *   kind: 'working_set'|'working_set_base',
 *   workingSetId: string,
 *   ceiling: number|null
 * } | {
 *   kind: 'coordinate',
 *   frontier: Record<string, string>,
 *   ceiling: number|null
 * }} selector
 * @returns {Promise<{
 *   requested: Record<string, unknown>,
 *   state: import('../services/JoinReducer.js').WarpStateV5,
 *   patchEntries: Array<{ patch: import('../types/WarpTypesV2.js').PatchV2, sha: string }>,
 *   resolved: {
 *     coordinateKind: 'frontier'|'working_set'|'working_set_base',
 *     patchFrontier: Record<string, string>,
 *     patchFrontierDigest: string,
 *     lamportFrontier: Record<string, number>,
 *     lamportFrontierDigest: string,
 *     lamportCeiling: number|null,
 *     stateHash: string,
 *     patchUniverseDigest: string,
 *     summary: {
 *       nodeCount: number,
 *       edgeCount: number,
 *       nodePropertyCount: number,
 *       edgePropertyCount: number,
 *       patchCount: number
 *     },
 *     workingSet?: {
 *       workingSetId: string,
 *       baseLamportCeiling: number|null,
 *       overlayHeadPatchSha: string|null,
 *       overlayPatchCount: number,
 *       overlayWritable: boolean,
 *       braid: {
 *         readOverlayCount: number,
 *         braidedWorkingSetIds: string[]
 *       }
 *     }
 *   }
 * }>}
 */
async function resolveComparisonSide(selector) {
  if (selector.kind === 'live') {
    return await resolveLiveComparisonSide(this, selector);
  }

  if (selector.kind === 'coordinate') {
    return await resolveCoordinateComparisonSide(this, selector);
  }

  const workingSets = new WorkingSetService({ graph: this });
  if (selector.kind === 'working_set') {
    const workingSetSelector = /** @type {{ kind: 'working_set', workingSetId: string, ceiling: number|null }} */ (selector);
    return await resolveWorkingSetComparisonSide(this, workingSets, workingSetSelector);
  }

  const baseSelector = /** @type {{ kind: 'working_set_base', workingSetId: string, ceiling: number|null }} */ (selector);
  return await resolveWorkingSetBaseComparisonSide(this, workingSets, baseSelector);
}

/**
 * Compares a working set against its base observation, the live frontier, or
 * another working set.
 *
 * @this {import('../WarpGraph.js').default}
 * @param {string} workingSetId
 * @param {{
 *   against?: 'base'|'live'|{ kind: 'working_set', workingSetId: string },
 *   ceiling?: number|null,
 *   againstCeiling?: number|null,
 *   targetId?: string|null
 * }} [options]
 * @returns {Promise<CoordinateComparisonV1>}
 */
export async function compareWorkingSet(workingSetId, options = {}) {
  const normalizedWorkingSetId = normalizeRequiredString(workingSetId, 'workingSetId');
  const ceiling = normalizeLamportCeiling(options.ceiling, 'ceiling');
  const againstCeiling = normalizeLamportCeiling(options.againstCeiling, 'againstCeiling');
  const targetId = normalizeOptionalString(options.targetId, 'targetId');
  const against = options.against ?? 'base';

  const left = /** @type {CoordinateComparisonSelectorV1} */ ({
    kind: 'working_set',
    workingSetId: normalizedWorkingSetId,
    ceiling,
  });

  const right = /** @type {CoordinateComparisonSelectorV1} */ (against === 'base'
    ? {
      kind: 'working_set_base',
      workingSetId: normalizedWorkingSetId,
      ceiling: againstCeiling,
    }
    : against === 'live'
      ? {
        kind: 'live',
        ceiling: againstCeiling,
      }
      : (against && typeof against === 'object' && against.kind === 'working_set')
        ? {
          kind: 'working_set',
          workingSetId: normalizeRequiredString(against.workingSetId, 'against.workingSetId'),
          ceiling: againstCeiling,
        }
        : (() => {
          throw new QueryError('against must be base, live, or { kind: "working_set", workingSetId }', {
            code: 'invalid_coordinate',
          });
        })());

  return await this.compareCoordinates({ left, right, targetId });
}

/**
 * Compares two substrate observation selectors.
 *
 * Supported selectors:
 * - `{ kind: 'live', ceiling? }`
 * - `{ kind: 'working_set', workingSetId, ceiling? }`
 * - `{ kind: 'working_set_base', workingSetId, ceiling? }`
 * - `{ kind: 'coordinate', frontier, ceiling? }`
 *
 * @this {import('../WarpGraph.js').default}
 * @param {{
 *   left: {
 *     kind: 'live'|'working_set'|'working_set_base'|'coordinate',
 *     workingSetId?: string,
 *     frontier?: Map<string, string>|Record<string, string>,
 *     ceiling?: number|null
 *   },
 *   right: {
 *     kind: 'live'|'working_set'|'working_set_base'|'coordinate',
 *     workingSetId?: string,
 *     frontier?: Map<string, string>|Record<string, string>,
 *     ceiling?: number|null
 *   },
 *   targetId?: string|null
 * }} options
 * @returns {Promise<CoordinateComparisonV1>}
 */
export async function compareCoordinates(options) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) {
    throw new QueryError('compareCoordinates() requires an options object', {
      code: 'invalid_coordinate',
    });
  }

  const normalizedLeft = normalizeSelector(options.left, 'left');
  const normalizedRight = normalizeSelector(options.right, 'right');
  const targetId = normalizeOptionalString(options.targetId, 'targetId');

  const left = await resolveComparisonSide.call(this, normalizedLeft);
  const right = await resolveComparisonSide.call(this, normalizedRight);
  const visiblePatchDivergence = buildPatchDivergence(left.patchEntries, right.patchEntries, targetId);
  const visibleState = compareVisibleStateV5(left.state, right.state, { targetId });

  const payload = {
    comparisonVersion: COORDINATE_COMPARISON_VERSION,
    left: {
      requested: left.requested,
      resolved: left.resolved,
    },
    right: {
      requested: right.requested,
      resolved: right.resolved,
    },
    visiblePatchDivergence,
    visibleState,
  };
  const comparisonDigest = await computeChecksum(payload, this._crypto);

  return {
    ...payload,
    comparisonDigest,
  };
}

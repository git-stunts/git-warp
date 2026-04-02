/**
 * ComparisonController — substrate-visible coordinate and strand comparison.
 *
 * Extracted from comparison.methods.js. Compares only deterministic
 * substrate facts: visible patch-universe divergence, visible node/edge/
 * property deltas, and optional node-local target diffs.
 *
 * @module domain/services/ComparisonController
 */

import QueryError from '../errors/QueryError.js';
import {
  buildCoordinateComparisonFact,
  buildCoordinateTransferPlanFact,
} from './CoordinateFactExport.js';
import { createStateReaderV5 } from './StateReaderV5.js';
import { computeStateHashV5 } from './StateSerializerV5.js';
import {
  normalizeVisibleStateScopeV1,
  scopeMaterializedStateV5,
  scopePatchEntriesV1,
} from './VisibleStateScopeV1.js';
import { compareVisibleStateV5 } from './VisibleStateComparisonV5.js';
import { planVisibleStateTransferV5 } from './VisibleStateTransferPlannerV5.js';
import StrandService from './StrandService.js';
import { computeChecksum } from '../utils/checksumUtils.js';
import { callInternalRuntimeMethod } from '../utils/callInternalRuntimeMethod.js';

const COORDINATE_COMPARISON_VERSION = 'coordinate-compare/v1';
const COORDINATE_TRANSFER_PLAN_VERSION = 'coordinate-transfer-plan/v1';

/**
 * @typedef {import('../../../index.js').VisibleStateScopePrefixFilterV1} VisibleStateScopePrefixFilterV1
 * @typedef {import('../../../index.js').VisibleStateScopeV1} VisibleStateScopeV1
 * @typedef {import('../../../index.js').VisibleStateReaderV5} VisibleStateReaderV5
 * @typedef {import('../../../index.js').CoordinateComparisonSelectorV1} CoordinateComparisonSelectorV1
 * @typedef {import('../../../index.js').CoordinateTransferPlanSelectorV1} CoordinateTransferPlanSelectorV1
 * @typedef {import('../../../index.js').StrandDescriptor} StrandDescriptorV1
 * @typedef {import('../../../index.js').CoordinateComparisonV1} CoordinateComparisonV1
 * @typedef {import('../../../index.js').CoordinateTransferPlanV1} CoordinateTransferPlanV1
 * @typedef {{ left: Record<string, unknown>, right: Record<string, unknown>, targetId?: string|null, scope?: VisibleStateScopeV1|null }} InternalCompareCoordinatesOptions
 * @typedef {{ source: Record<string, unknown>, target: Record<string, unknown>, scope?: VisibleStateScopeV1|null }} InternalPlanCoordinateTransferOptions
 */

/**
 * Internal normalized selector shape after validation.
 *
 * @typedef {Object} NormalizedSelector
 * @property {string} kind - Selector kind (live, strand, strand_base, coordinate)
 * @property {number|null} [ceiling] - Optional lamport ceiling
 * @property {string} [strandId] - Strand identifier (for strand/strand_base kinds)
 * @property {Record<string, string>} [frontier] - Frontier record (for coordinate kind)
 */

/**
 * Resolved comparison side with state, entries, and metadata.
 *
 * @typedef {Object} ResolvedComparisonSide
 * @property {Record<string, unknown>} requested - Original requested selector
 * @property {import('./JoinReducer.js').WarpStateV5} state - Materialized state
 * @property {Array<{ patch: import('../types/WarpTypesV2.js').PatchV2, sha: string }>} patchEntries - Patch entries
 * @property {Record<string, unknown>} resolved - Resolved metadata with digests
 */

/**
 * Deterministically compares two strings.
 *
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
function compareStrings(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Validates and normalizes a lamport ceiling value.
 *
 * @param {unknown} value - Raw ceiling value
 * @param {string} field - Field name for error context
 * @returns {number|null}
 */
function normalizeLamportCeiling(value, field) {
  if (value === undefined || value === null) {
    return null;
  }
  assertValidLamport(value, field);
  return value;
}

/**
 * Asserts that a value is a valid non-negative integer lamport clock.
 *
 * @param {unknown} value - Raw value to validate
 * @param {string} field - Field name for error context
 * @returns {asserts value is number}
 */
function assertValidLamport(value, field) {
  const isInvalid = typeof value !== 'number' || !Number.isInteger(value) || value < 0;
  if (isInvalid) {
    throw new QueryError(`${field} must be a non-negative integer or null`, {
      code: 'invalid_coordinate',
      context: { field, value },
    });
  }
}

/**
 * Validates and normalizes an optional string.
 *
 * @param {unknown} value - Raw string value
 * @param {string} field - Field name for error context
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
 * Validates and normalizes a required string.
 *
 * @param {unknown} value - Raw string value
 * @param {string} field - Field name for error context
 * @returns {string}
 */
function normalizeRequiredString(value, field) {
  const normalized = normalizeOptionalString(value, field);
  if (normalized === null) {
    throw new QueryError(`${field} must be a non-empty string`, {
      code: 'invalid_coordinate',
      context: { field },
    });
  }
  return normalized;
}

/**
 * Extracts entries from a frontier Map or Record.
 *
 * @param {Map<string, string>|Record<string, string>} frontier
 * @returns {Array<[string, string]>|null}
 */
function frontierEntries(frontier) {
  if (frontier instanceof Map) {
    return [...frontier.entries()];
  }
  if (!isPlainObject(frontier)) {
    return null;
  }
  return Object.entries(frontier);
}

/**
 * Returns true if value is a non-null, non-array plain object.
 *
 * @param {unknown} value - Value to check
 * @returns {boolean}
 */
function isPlainObject(value) {
  return value !== null && value !== undefined && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Asserts that a frontier entry has valid writerId and SHA.
 *
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
 * Validates and normalizes a frontier into a sorted Record.
 *
 * @param {Map<string, string>|Record<string, string>} frontier - Raw frontier
 * @param {string} field - Field name for error context
 * @returns {Record<string, string>}
 */
function normalizeFrontierRecord(frontier, field) {
  const entries = frontierEntries(frontier);

  if (entries === null) {
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
 * Converts a frontier Record into a sorted Map.
 *
 * @param {Record<string, string>} frontierRecord
 * @returns {Map<string, string>}
 */
function frontierRecordToMap(frontierRecord) {
  const sortedEntries = Object.entries(frontierRecord).sort(([a], [b]) => compareStrings(a, b));
  return new Map(sortedEntries);
}

/**
 * Updates the writer's highest patch in the tracking map.
 *
 * @param {Map<string, { lamport: number, sha: string }>} byWriter
 * @param {string} writerId
 * @param {{ lamport: number, sha: string }} patchInfo
 * @private
 */
function updateWriterHighestPatch(byWriter, writerId, patchInfo) {
  const current = byWriter.get(writerId);
  const isNewer = !current || patchInfo.lamport > current.lamport || (patchInfo.lamport === current.lamport && compareStrings(patchInfo.sha, current.sha) > 0);
  if (isNewer) {
    byWriter.set(writerId, patchInfo);
  }
}

/**
 * Extracts the highest patch SHA per writer from a set of patch entries.
 *
 * @param {Array<{ patch: import('../types/WarpTypesV2.js').PatchV2, sha: string }>} entries
 * @returns {Record<string, string>}
 */
function patchFrontierFromEntries(entries) {
  /** @type {Map<string, { lamport: number, sha: string }>} */
  const byWriter = new Map();
  for (const entry of entries) {
    const lamport = entry.patch.lamport ?? 0;
    updateWriterHighestPatch(byWriter, entry.patch.writer, { lamport, sha: entry.sha });
  }

  const sortedEntries = [...byWriter.entries()].sort(([a], [b]) => compareStrings(a, b));
  const record = /** @type {Record<string, string>} */ ({});
  for (const [writerId, info] of sortedEntries) {
    record[writerId] = info.sha;
  }
  return record;
}

/**
 * Extracts the highest lamport timestamp per writer from patch entries.
 *
 * @param {Array<{ patch: import('../types/WarpTypesV2.js').PatchV2, sha: string }>} entries
 * @returns {Record<string, number>}
 */
function lamportFrontierFromEntries(entries) {
  /** @type {Map<string, number>} */
  const byWriter = new Map();
  for (const entry of entries) {
    const writerId = entry.patch.writer;
    const lamport = entry.patch.lamport ?? 0;
    const current = byWriter.get(writerId);
    if (current === undefined || lamport > current) {
      byWriter.set(writerId, lamport);
    }
  }

  const sortedEntries = [...byWriter.entries()].sort(([a], [b]) => compareStrings(a, b));
  return /** @type {Record<string, number>} */ (Object.fromEntries(sortedEntries));
}

/**
 * Combines two lamport ceilings by taking the minimum.
 *
 * @param {number|null} left
 * @param {number|null} right
 * @returns {number|null}
 */
function combineCeilings(left, right) {
  if (left === null) { return right; }
  if (right === null) { return left; }
  return Math.min(left, right);
}

/**
 * Builds a coordinate request object for internal materialization.
 *
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
 * Checks if a patch touches a specific entity ID in its reads or writes.
 *
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
 * Returns a unique sorted list of patch SHAs from entries.
 *
 * @param {Array<{ patch: import('../types/WarpTypesV2.js').PatchV2, sha: string }>} entries
 * @returns {string[]}
 */
function uniqueSortedPatchShas(entries) {
  const shas = entries.map(({ sha }) => sha);
  return [...new Set(shas)].sort(compareStrings);
}

/**
 * Returns a unique sorted list of patch SHAs that touched a target ID.
 *
 * @param {Array<{ patch: import('../types/WarpTypesV2.js').PatchV2, sha: string }>} entries
 * @param {string} targetId
 * @returns {string[]}
 */
function targetPatchShas(entries, targetId) {
  const filtered = entries.filter(({ patch }) => patchTouchesEntity(patch, targetId));
  const shas = filtered.map(({ sha }) => sha);
  return [...new Set(shas)].sort(compareStrings);
}

/**
 * Computes node and property counts for a visible state.
 *
 * @param {VisibleStateReaderV5} reader
 * @param {number} patchCount
 * @returns {{ nodeCount: number, edgeCount: number, nodePropertyCount: number, edgePropertyCount: number, patchCount: number }}
 */
function summarizeVisibleState(reader, patchCount) {
  const nodes = reader.getNodes();
  const edges = reader.getEdges();
  let nodePropertyCount = 0;
  for (const nodeId of nodes) {
    const props = reader.getNodeProps(nodeId) ?? {};
    nodePropertyCount += Object.keys(props).length;
  }
  let edgePropertyCount = 0;
  for (const edge of edges) {
    const props = edge.props ?? {};
    edgePropertyCount += Object.keys(props).length;
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
 * Computes target-specific patch divergence.
 *
 * @param {Array<{ patch: import('../types/WarpTypesV2.js').PatchV2, sha: string }>} leftEntries
 * @param {Array<{ patch: import('../types/WarpTypesV2.js').PatchV2, sha: string }>} rightEntries
 * @param {string} targetId
 * @returns {Record<string, unknown>}
 * @private
 */
function buildTargetDivergence(leftEntries, rightEntries, targetId) {
  const leftTarget = targetPatchShas(leftEntries, targetId);
  const rightTarget = targetPatchShas(rightEntries, targetId);
  const rightTargetSet = new Set(rightTarget);
  const leftTargetSet = new Set(leftTarget);

  const leftOnly = leftTarget.filter((sha) => !rightTargetSet.has(sha));
  const rightOnly = rightTarget.filter((sha) => !leftTargetSet.has(sha));

  return {
    targetId,
    leftCount: leftTarget.length,
    rightCount: rightTarget.length,
    sharedCount: leftTarget.filter((sha) => rightTargetSet.has(sha)).length,
    leftOnlyCount: leftOnly.length,
    rightOnlyCount: rightOnly.length,
    leftOnlyPatchShas: leftOnly,
    rightOnlyPatchShas: rightOnly,
  };
}

/**
 * Computes visible patch divergence between two sides.
 *
 * @param {Array<{ patch: import('../types/WarpTypesV2.js').PatchV2, sha: string }>} leftEntries
 * @param {Array<{ patch: import('../types/WarpTypesV2.js').PatchV2, sha: string }>} rightEntries
 * @param {string|null} targetId
 * @returns {Record<string, unknown>}
 */
function buildPatchDivergenceImpl(leftEntries, rightEntries, targetId) {
  const leftShas = uniqueSortedPatchShas(leftEntries);
  const rightShas = uniqueSortedPatchShas(rightEntries);
  const rightSet = new Set(rightShas);
  const leftSet = new Set(leftShas);
  const leftOnly = leftShas.filter((sha) => !rightSet.has(sha));
  const rightOnly = rightShas.filter((sha) => !leftSet.has(sha));

  const result = {
    sharedCount: leftShas.filter((sha) => rightSet.has(sha)).length,
    leftOnlyCount: leftOnly.length,
    rightOnlyCount: rightOnly.length,
    leftOnlyPatchShas: leftOnly,
    rightOnlyPatchShas: rightOnly,
  };

  if (targetId !== null && targetId !== undefined && targetId !== '') {
    Object.assign(result, { target: buildTargetDivergence(leftEntries, rightEntries, targetId) });
  }

  return result;
}

/**
 * Collects writer entries for a specific writer tip.
 *
 * @param {import('../WarpRuntime.js').default} graph
 * @param {{ tipSha: string, ceiling: number|null }} params
 * @returns {Promise<Array<{ patch: import('../types/WarpTypesV2.js').PatchV2, sha: string }>>}
 * @private
 */
async function collectWriterEntries(graph, { tipSha, ceiling }) {
  const entries = [];
  const writerEntries = await graph._loadPatchChainFromSha(tipSha);
  for (const entry of writerEntries) {
    const lamport = entry.patch.lamport ?? 0;
    if (ceiling === null || lamport <= ceiling) {
      entries.push(entry);
    }
  }
  return entries;
}

/**
 * Collects all patches reachable from a frontier, filtered by ceiling.
 *
 * @param {import('../WarpRuntime.js').default} graph
 * @param {Record<string, string>} frontierRecord
 * @param {number|null} ceiling
 * @returns {Promise<Array<{ patch: import('../types/WarpTypesV2.js').PatchV2, sha: string }>>}
 */
async function collectPatchEntriesForFrontier(graph, frontierRecord, ceiling) {
  const frontier = frontierRecordToMap(frontierRecord);
  const results = [];
  for (const tipSha of frontier.values()) {
    if (tipSha) {
      results.push(await collectWriterEntries(graph, { tipSha, ceiling }));
    }
  }
  return results.flat();
}

/**
 * Normalizes a coordinate selector into a canonical internal shape.
 *
 * @param {unknown} selector - Raw selector from API
 * @param {string} field - Field name for error context
 * @returns {Record<string, unknown>}
 */
function normalizeSelector(selector, field) {
  const raw = /** @type {Record<string, unknown>} */ (selector);
  const kind = extractSelectorKind(raw);

  /** @type {Record<string, (r: Record<string, unknown>, f: string) => Record<string, unknown>>} */
  const handlers = {
    live: normalizeLiveSelector,
    coordinate: normalizeCoordinateSelector,
  };
  const handler = handlers[kind];
  if (handler !== undefined) {
    return handler(raw, field);
  }
  if (kind === 'strand' || kind === 'strand_base') {
    return normalizeStrandSelector(raw, kind, field);
  }
  throw new QueryError(`${field}.kind is unsupported`, { code: 'invalid_coordinate', context: { field, kind } });
}

/**
 * Extracts the kind string from a raw selector record.
 *
 * @param {Record<string, unknown>} raw - Selector record
 * @returns {string}
 */
function extractSelectorKind(raw) {
  const r = /** @type {{ kind?: unknown }} */ (raw);
  return typeof r.kind === 'string' ? r.kind : '';
}

/**
 * Normalizes a 'live' kind selector.
 *
 * @param {Record<string, unknown>} raw - Parsed selector record
 * @param {string} field - Field name for error context
 * @returns {Record<string, unknown>}
 */
function normalizeLiveSelector(raw, field) {
  const r = /** @type {{ ceiling?: unknown }} */ (raw);
  return { kind: 'live', ceiling: normalizeLamportCeiling(r.ceiling, `${field}.ceiling`) };
}

/**
 * Normalizes a 'strand' or 'strand_base' kind selector.
 *
 * @param {Record<string, unknown>} raw - Parsed selector record
 * @param {string} kind - The selector kind
 * @param {string} field - Field name for error context
 * @returns {Record<string, unknown>}
 */
function normalizeStrandSelector(raw, kind, field) {
  const r = /** @type {{ strandId?: unknown, ceiling?: unknown }} */ (raw);
  return {
    kind,
    strandId: normalizeRequiredString(r.strandId, `${field}.strandId`),
    ceiling: normalizeLamportCeiling(r.ceiling, `${field}.ceiling`),
  };
}

/**
 * Normalizes a 'coordinate' kind selector.
 *
 * @param {Record<string, unknown>} raw - Parsed selector record
 * @param {string} field - Field name for error context
 * @returns {Record<string, unknown>}
 */
function normalizeCoordinateSelector(raw, field) {
  const r = /** @type {{ frontier?: unknown, ceiling?: unknown }} */ (raw);
  const f = /** @type {Map<string, string>|Record<string, string>} */ (r.frontier);
  return {
    kind: 'coordinate',
    frontier: normalizeFrontierRecord(f, `${field}.frontier`),
    ceiling: normalizeLamportCeiling(r.ceiling, `${field}.ceiling`),
  };
}

/**
 * Wraps a lamport ceiling in an options object if not null.
 *
 * @param {number|null} ceiling
 * @returns {Record<string, number>}
 */
function optionalCeiling(ceiling) {
  return ceiling === null ? {} : { ceiling };
}

/**
 * Builds metadata for a strand descriptor.
 *
 * @param {string} strandId
 * @param {StrandDescriptorV1} descriptor
 * @returns {Record<string, unknown>}
 */
function buildStrandMetadata(strandId, descriptor) {
  const { braid, baseObservation, overlay } = descriptor;
  const readOverlays = braid?.readOverlays ?? [];

  return {
    strandId,
    baseLamportCeiling: baseObservation.lamportCeiling,
    overlayHeadPatchSha: overlay.headPatchSha,
    overlayPatchCount: overlay.patchCount,
    overlayWritable: overlay.writable ?? true,
    braid: {
      readOverlayCount: readOverlays.length,
      braidedStrandIds: readOverlays.map((/** @type {{ strandId: string }} */ o) => o.strandId).sort(compareStrings),
    },
  };
}

/**
 * Finalizes one side of a coordinate comparison with digests and summary.
 *
 * @param {import('../WarpRuntime.js').default} graph
 * @param {{
 *   requested: Record<string, unknown>,
 *   state: import('./JoinReducer.js').WarpStateV5,
 *   patchEntries: Array<{ patch: import('../types/WarpTypesV2.js').PatchV2, sha: string }>,
 *   coordinateKind: 'frontier'|'strand'|'strand_base',
 *   lamportCeiling: number|null,
 *   strand?: Record<string, unknown>
 * }} params
 * @param {VisibleStateScopeV1|null} scope
 * @returns {Promise<Record<string, unknown>>}
 */
async function finalizeComparisonSide(graph, params, scope) {
  const { requested, state, patchEntries, coordinateKind, lamportCeiling, strand } = params;
  const scopedState = scopeMaterializedStateV5(state, scope);
  const scopedPatchEntries = scopePatchEntriesV1(patchEntries, scope);
  const visiblePatchFrontier = patchFrontierFromEntries(scopedPatchEntries);
  const visibleLamportFrontier = lamportFrontierFromEntries(scopedPatchEntries);
  const reader = createStateReaderV5(scopedState);

  const stateHash = await computeStateHashV5(scopedState, { crypto: graph._crypto, codec: graph._codec });
  const patchShas = uniqueSortedPatchShas(scopedPatchEntries);

  return {
    requested,
    state: scopedState,
    patchEntries: scopedPatchEntries,
    resolved: {
      coordinateKind,
      patchFrontier: visiblePatchFrontier,
      patchFrontierDigest: await computeChecksum(visiblePatchFrontier, graph._crypto),
      lamportFrontier: visibleLamportFrontier,
      lamportFrontierDigest: await computeChecksum(visibleLamportFrontier, graph._crypto),
      lamportCeiling,
      stateHash: /** @type {string} */ (stateHash),
      patchUniverseDigest: await computeChecksum({ patches: patchShas }, graph._crypto),
      summary: summarizeVisibleState(reader, scopedPatchEntries.length),
      ...(strand !== undefined ? { strand } : {}),
    },
  };
}

/**
 * Resolves the 'live' coordinate side.
 *
 * @param {import('../WarpRuntime.js').default} graph
 * @param {NormalizedSelector} selector
 * @param {VisibleStateScopeV1|null} scope
 * @returns {Promise<Record<string, unknown>>}
 * @private
 */
async function resolveLiveComparisonSide(graph, selector, scope) {
  const ceiling = selector.ceiling ?? null;
  const requestedFrontier = /** @type {Map<string, string>} */ (await graph.getFrontier());
  const requestedRecord = normalizeFrontierRecord(requestedFrontier, 'live.frontier');
  const state = await graph.materializeCoordinate({
    frontier: frontierRecordToMap(requestedRecord),
    ...optionalCeiling(ceiling),
  });
  const patchEntries = await collectPatchEntriesForFrontier(graph, requestedRecord, ceiling);
  return await finalizeComparisonSide(graph, {
    requested: { kind: 'live', ...optionalCeiling(ceiling) },
    state,
    patchEntries,
    coordinateKind: 'frontier',
    lamportCeiling: ceiling,
  }, scope);
}

/**
 * Resolves an explicit 'coordinate' side.
 *
 * @param {import('../WarpRuntime.js').default} graph
 * @param {NormalizedSelector} selector
 * @param {VisibleStateScopeV1|null} scope
 * @returns {Promise<Record<string, unknown>>}
 * @private
 */
async function resolveCoordinateComparisonSide(graph, selector, scope) {
  const ceiling = selector.ceiling ?? null;
  const frontier = /** @type {Record<string, string>} */ (selector.frontier ?? {});
  const state = await graph.materializeCoordinate({
    frontier: frontierRecordToMap(frontier),
    ...optionalCeiling(ceiling),
  });
  const patchEntries = await collectPatchEntriesForFrontier(graph, frontier, ceiling);
  return await finalizeComparisonSide(graph, {
    requested: { ...buildCoordinateRequest(frontier, ceiling), kind: 'coordinate' },
    state,
    patchEntries,
    coordinateKind: 'frontier',
    lamportCeiling: ceiling,
  }, scope);
}

/**
 * Resolves a 'strand' coordinate side.
 *
 * @param {import('../WarpRuntime.js').default} graph
 * @param {NormalizedSelector} selector
 * @param {VisibleStateScopeV1|null} scope
 * @returns {Promise<Record<string, unknown>>}
 * @private
 */
async function resolveStrandComparisonSide(graph, selector, scope) {
  const ceiling = selector.ceiling ?? null;
  const strandId = /** @type {string} */ (selector.strandId ?? '');
  const strands = new StrandService({ graph });
  const descriptor = await strands.getOrThrow(strandId);
  const state = /** @type {import('./JoinReducer.js').WarpStateV5} */ (await callInternalRuntimeMethod(
    graph,
    'materializeStrand',
    strandId,
    ceiling === null ? undefined : { ceiling },
  ));
  const patchEntries = await strands.getPatchEntries(
    strandId,
    ceiling === null ? undefined : { ceiling },
  );
  return await finalizeComparisonSide(graph, {
    requested: { kind: 'strand', strandId, ...optionalCeiling(ceiling) },
    state,
    patchEntries,
    coordinateKind: 'strand',
    lamportCeiling: ceiling,
    strand: buildStrandMetadata(strandId, descriptor),
  }, scope);
}

/**
 * Resolves a 'strand_base' coordinate side.
 *
 * @param {import('../WarpRuntime.js').default} graph
 * @param {NormalizedSelector} selector
 * @param {VisibleStateScopeV1|null} scope
 * @returns {Promise<Record<string, unknown>>}
 * @private
 */
async function resolveStrandBaseComparisonSide(graph, selector, scope) {
  const ceiling = selector.ceiling ?? null;
  const strandId = /** @type {string} */ (selector.strandId ?? '');
  const strands = new StrandService({ graph });
  const descriptor = await strands.getOrThrow(strandId);
  const effectiveCeiling = combineCeilings(descriptor.baseObservation.lamportCeiling, ceiling);
  const state = await graph.materializeCoordinate({
    frontier: descriptor.baseObservation.frontier,
    ...optionalCeiling(effectiveCeiling),
  });
  const patchEntries = await collectPatchEntriesForFrontier(graph, descriptor.baseObservation.frontier, effectiveCeiling);
  return await finalizeComparisonSide(graph, {
    requested: {
      kind: 'strand_base',
      strandId,
      frontier: { ...descriptor.baseObservation.frontier },
      baseLamportCeiling: descriptor.baseObservation.lamportCeiling,
      ...optionalCeiling(ceiling),
    },
    state,
    patchEntries,
    coordinateKind: 'strand_base',
    lamportCeiling: effectiveCeiling,
    strand: buildStrandMetadata(strandId, /** @type {StrandDescriptorV1} */ (descriptor)),
  }, scope);
}

/**
 * Dispatches coordinate side resolution based on selector kind.
 *
 * @param {import('../WarpRuntime.js').default} graph
 * @param {NormalizedSelector} selector
 * @param {VisibleStateScopeV1|null} [scope]
 * @returns {Promise<Record<string, unknown>>}
 * @private
 */
async function resolveComparisonSide(graph, selector, scope = null) {
  if (selector.kind === 'live') {
    return await resolveLiveComparisonSide(graph, selector, scope);
  }

  if (selector.kind === 'coordinate') {
    return await resolveCoordinateComparisonSide(graph, selector, scope);
  }

  if (selector.kind === 'strand') {
    return await resolveStrandComparisonSide(graph, selector, scope);
  }

  return await resolveStrandBaseComparisonSide(graph, selector, scope);
}

/**
 * Checks whether a value is a strand-shaped object with kind 'strand'.
 *
 * @param {unknown} value - Value to check
 * @returns {value is { kind: 'strand', strandId: unknown }}
 */
function isStrandObject(value) {
  return value !== null && typeof value === 'object' && /** @type {{ kind?: unknown }} */ (value).kind === 'strand';
}

/**
 * Normalizes the 'against' option for strand comparison.
 *
 * @param {string} normalizedStrandId
 * @param {unknown} against
 * @param {number|null} againstCeiling
 * @returns {Record<string, unknown>}
 * @private
 */
function normalizeAgainstSelector(normalizedStrandId, against, againstCeiling) {
  if (against === 'base') {
    return { kind: 'strand_base', strandId: normalizedStrandId, ceiling: againstCeiling };
  }
  if (against === 'live') {
    return { kind: 'live', ceiling: againstCeiling };
  }
  if (isStrandObject(against)) {
    const obj = /** @type {Record<string, unknown>} */ (against);
    const o = /** @type {{ strandId?: unknown }} */ (obj);
    return { kind: 'strand', strandId: normalizeRequiredString(o.strandId, 'against.strandId'), ceiling: againstCeiling };
  }
  throw new QueryError('against must be base, live, or { kind: "strand", strandId }', { code: 'invalid_coordinate' });
}

/**
 * Compares a strand against its base observation, the live frontier, or
 * another strand.
 *
 * @param {import('../WarpRuntime.js').default} graph
 * @param {string} strandId
 * @param {{
 *   against?: 'base'|'live'|{ kind: 'strand', strandId: string },
 *   ceiling?: number|null,
 *   againstCeiling?: number|null,
 *   targetId?: string|null,
 *   scope?: VisibleStateScopeV1|null
 * }} [options]
 * @returns {Promise<CoordinateComparisonV1>}
 */
async function compareStrandImpl(graph, strandId, options = {}) {
  const normalizedStrandId = normalizeRequiredString(strandId, 'strandId');
  const ceiling = normalizeLamportCeiling(options.ceiling, 'ceiling');
  const againstCeiling = normalizeLamportCeiling(options.againstCeiling, 'againstCeiling');
  const targetId = normalizeOptionalString(options.targetId, 'targetId');
  const scope = normalizeVisibleStateScopeV1(options.scope, 'scope');

  const left = { kind: 'strand', strandId: normalizedStrandId, ceiling };
  const right = normalizeAgainstSelector(normalizedStrandId, options.against ?? 'base', againstCeiling);

  return await compareCoordinatesImpl(graph, {
    left: /** @type {CoordinateComparisonSelectorV1} */ (left),
    right: /** @type {CoordinateComparisonSelectorV1} */ (right),
    targetId,
    ...(scope ? { scope } : {}),
  });
}

/**
 * Reads a content blob by OID from storage.
 *
 * @param {import('../WarpRuntime.js').default} graph
 * @param {string} oid
 * @returns {Promise<Uint8Array>}
 */
async function readContentBlobByOid(graph, oid) {
  const buf = (graph._blobStorage !== null && graph._blobStorage !== undefined)
    ? await graph._blobStorage.retrieve(oid)
    : await graph._persistence.readBlob(oid);
  if (!(buf instanceof Uint8Array)) {
    throw new QueryError(`content blob '${oid}' is missing from the object store`, { code: 'invalid_coordinate', context: { oid } });
  }
  return buf;
}

/**
 * Normalizes the 'into' option for strand transfer.
 *
 * @param {string} normalizedStrandId
 * @param {unknown} into
 * @param {number|null} intoCeiling
 * @returns {Record<string, unknown>}
 * @private
 */
function normalizeIntoSelector(normalizedStrandId, into, intoCeiling) {
  if (into === 'base') {
    return { kind: 'strand_base', strandId: normalizedStrandId, ceiling: intoCeiling };
  }
  if (into === 'live') {
    return { kind: 'live', ceiling: intoCeiling };
  }
  if (isStrandObject(into)) {
    const obj = /** @type {Record<string, unknown>} */ (into);
    const o = /** @type {{ strandId?: unknown }} */ (obj);
    return { kind: 'strand', strandId: normalizeRequiredString(o.strandId, 'into.strandId'), ceiling: intoCeiling };
  }
  throw new QueryError('into must be base, live, or { kind: "strand", strandId }', { code: 'invalid_coordinate' });
}

/**
 * Plans a deterministic transfer from one strand into live truth, its
 * pinned base observation, or another strand.
 *
 * @param {import('../WarpRuntime.js').default} graph
 * @param {string} strandId
 * @param {{
 *   into?: 'base'|'live'|{ kind: 'strand', strandId: string },
 *   ceiling?: number|null,
 *   intoCeiling?: number|null,
 *   scope?: VisibleStateScopeV1|null
 * }} [options]
 * @returns {Promise<CoordinateTransferPlanV1>}
 */
async function planStrandTransferImpl(graph, strandId, options = {}) {
  const normalizedStrandId = normalizeRequiredString(strandId, 'strandId');
  const ceiling = normalizeLamportCeiling(options.ceiling, 'ceiling');
  const intoCeiling = normalizeLamportCeiling(options.intoCeiling, 'intoCeiling');
  const scope = normalizeVisibleStateScopeV1(options.scope, 'scope');

  const source = { kind: 'strand', strandId: normalizedStrandId, ceiling };
  const target = normalizeIntoSelector(normalizedStrandId, options.into ?? 'live', intoCeiling);

  return await planCoordinateTransferImpl(graph, {
    source: /** @type {CoordinateTransferPlanSelectorV1} */ (source),
    target: /** @type {CoordinateTransferPlanSelectorV1} */ (target),
    ...(scope ? { scope } : {}),
  });
}

/**
 * Asserts that transfer options are valid.
 *
 * @param {unknown} options
 * @returns {void}
 */
function assertTransferOptions(options) {
  const isInvalid = options === null || options === undefined || typeof options !== 'object' || Array.isArray(options);
  if (isInvalid) {
    throw new QueryError('planCoordinateTransfer() requires an options object', { code: 'invalid_coordinate' });
  }
}

/**
 * Finalizes a transfer plan with digests and metadata.
 *
 * @param {{
 *   graph: import('../WarpRuntime.js').default,
 *   sourceSide: ResolvedComparisonSide,
 *   targetSide: ResolvedComparisonSide,
 *   transfer: Awaited<ReturnType<typeof planVisibleStateTransferV5>>,
 *   comparisonDigest: string,
 *   scope: VisibleStateScopeV1|null
 * }} params
 * @returns {Promise<CoordinateTransferPlanV1>}
 */
async function finalizeTransferPlan(params) {
  const { graph, sourceSide, targetSide, transfer, comparisonDigest, scope } = params;
  const changed = transfer.summary.opCount > 0;
  const sides = {
    source: { requested: sourceSide.requested, resolved: sourceSide.resolved },
    target: { requested: targetSide.requested, resolved: targetSide.resolved },
  };
  const fact = buildCoordinateTransferPlanFact({
    transferVersion: COORDINATE_TRANSFER_PLAN_VERSION, comparisonDigest,
    ...(scope ? { scope } : {}), changed, ...sides,
    summary: transfer.summary, ops: transfer.ops,
  });
  const digest = await computeChecksum(/** @type {Record<string, unknown>} */ (/** @type {unknown} */ (fact)), graph._crypto);
  /** @type {CoordinateTransferPlanV1} */
  const plan = /** @type {CoordinateTransferPlanV1} */ (/** @type {unknown} */ ({
    transferVersion: COORDINATE_TRANSFER_PLAN_VERSION,
    transferDigest: /** @type {string} */ (digest),
    comparisonDigest,
    changed,
    ...sides,
    summary: transfer.summary,
    ops: transfer.ops,
  }));
  if (scope) { plan.scope = scope; }
  return plan;
}

/**
 * Plans a deterministic transfer between two substrate observation selectors.
 *
 * @param {import('../WarpRuntime.js').default} graph
 * @param {{
 *   source: Record<string, unknown>,
 *   target: Record<string, unknown>,
 *   scope?: VisibleStateScopeV1|null
 * }} options
 * @returns {Promise<CoordinateTransferPlanV1>}
 */
async function planCoordinateTransferImpl(graph, options) {
  assertTransferOptions(options);

  const normalizedSource = /** @type {NormalizedSelector} */ (normalizeSelector(options.source, 'source'));
  const normalizedTarget = /** @type {NormalizedSelector} */ (normalizeSelector(options.target, 'target'));
  const scope = normalizeVisibleStateScopeV1(options.scope, 'scope');
  const comp = await compareCoordinatesImpl(graph, {
    left: /** @type {CoordinateComparisonSelectorV1} */ (/** @type {unknown} */ (normalizedSource)),
    right: /** @type {CoordinateComparisonSelectorV1} */ (/** @type {unknown} */ (normalizedTarget)),
    ...(scope !== null && scope !== undefined ? { scope } : {}),
  });
  const sourceSide = /** @type {ResolvedComparisonSide} */ (await resolveComparisonSide(graph, normalizedSource, scope));
  const targetSide = /** @type {ResolvedComparisonSide} */ (await resolveComparisonSide(graph, normalizedTarget, scope));
  /** Loads node content blob by OID. @type {(nodeId: string, meta: { oid: string }) => Promise<Uint8Array>} */
  const loadNodeContent = async (_nodeId, meta) => await readContentBlobByOid(graph, meta.oid);
  /** Loads edge content blob by OID. @type {(edge: unknown, meta: { oid: string }) => Promise<Uint8Array>} */
  const loadEdgeContent = async (_edge, meta) => await readContentBlobByOid(graph, meta.oid);
  const transfer = await planVisibleStateTransferV5(createStateReaderV5(sourceSide.state), createStateReaderV5(targetSide.state), {
    loadNodeContent,
    loadEdgeContent,
  });
  return await finalizeTransferPlan({ graph, sourceSide, targetSide, transfer, comparisonDigest: comp.comparisonDigest, scope });
}

/**
 * Validates and extracts normalized inputs for coordinate comparison.
 *
 * @param {{
 *   left: Record<string, unknown>,
 *   right: Record<string, unknown>,
 *   targetId?: string|null,
 *   scope?: VisibleStateScopeV1|null
 * }} options - Raw comparison options
 * @returns {{ normalizedLeft: NormalizedSelector, normalizedRight: NormalizedSelector, targetId: string|null, scope: VisibleStateScopeV1|null }}
 */
function extractComparisonInputs(options) {
  assertComparisonOptions(options);
  return {
    normalizedLeft: /** @type {NormalizedSelector} */ (normalizeSelector(options.left, 'left')),
    normalizedRight: /** @type {NormalizedSelector} */ (normalizeSelector(options.right, 'right')),
    targetId: normalizeOptionalString(options.targetId, 'targetId'),
    scope: normalizeVisibleStateScopeV1(options.scope, 'scope'),
  };
}

/**
 * Asserts that comparison options are a valid object.
 *
 * @param {unknown} options - Options to validate
 * @returns {void}
 */
function assertComparisonOptions(options) {
  const isInvalid = options === null || options === undefined || typeof options !== 'object' || Array.isArray(options);
  if (isInvalid) {
    throw new QueryError('compareCoordinates() requires an options object', { code: 'invalid_coordinate' });
  }
}

/**
 * Compares two substrate observation selectors.
 *
 * @param {import('../WarpRuntime.js').default} graph
 * @param {{
 *   left: Record<string, unknown>,
 *   right: Record<string, unknown>,
 *   targetId?: string|null,
 *   scope?: VisibleStateScopeV1|null
 * }} options
 * @returns {Promise<CoordinateComparisonV1>}
 */
async function compareCoordinatesImpl(graph, options) {
  const { normalizedLeft, normalizedRight, targetId, scope } = extractComparisonInputs(options);

  const left = /** @type {ResolvedComparisonSide} */ (await resolveComparisonSide(graph, normalizedLeft, scope));
  const right = /** @type {ResolvedComparisonSide} */ (await resolveComparisonSide(graph, normalizedRight, scope));
  const visiblePatchDivergence = buildPatchDivergenceImpl(left.patchEntries, right.patchEntries, targetId);
  const visibleState = compareVisibleStateV5(left.state, right.state, { targetId });

  const fact = buildCoordinateComparisonFact({
    comparisonVersion: COORDINATE_COMPARISON_VERSION,
    ...(scope !== null && scope !== undefined ? { scope } : {}),
    left: { requested: left.requested, resolved: left.resolved },
    right: { requested: right.requested, resolved: right.resolved },
    visiblePatchDivergence,
    visibleState,
  });
  const digest = await computeChecksum(/** @type {Record<string, unknown>} */ (/** @type {unknown} */ (fact)), graph._crypto);

  return /** @type {CoordinateComparisonV1} */ ({ ...fact, comparisonDigest: digest });
}

// ── Controller class ──────────────────────────────────────────────────────────

/**
 * The host interface that ComparisonController depends on.
 *
 * @typedef {import('../WarpRuntime.js').default} ComparisonHost
 */

export default class ComparisonController {
  /** @type {ComparisonHost} */
  _host;

  /**
   * Creates a ComparisonController bound to a WarpRuntime host.
   * @param {ComparisonHost} host
   */
  constructor(host) {
    this._host = host;
  }

  /**
   * Builds a deterministic patch divergence analysis between two sets of patch entries.
   * @param {Array<{ patch: import('../types/WarpTypesV2.js').PatchV2, sha: string }>} leftEntries
   * @param {Array<{ patch: import('../types/WarpTypesV2.js').PatchV2, sha: string }>} rightEntries
   * @param {string|null} [targetId]
   * @returns {Record<string, unknown>}
   */
  buildPatchDivergence(leftEntries, rightEntries, targetId) {
    return buildPatchDivergenceImpl(leftEntries, rightEntries, targetId ?? null);
  }

  /**
   * Compares a strand against its base, live truth, or another strand.
   * @param {string} strandId
   * @param {Record<string, unknown>} [options]
   * @returns {Promise<CoordinateComparisonV1>}
   */
  async compareStrand(strandId, options = {}) {
    return await compareStrandImpl(this._host, strandId, options);
  }

  /**
   * Plans a transfer from one strand into another observation point.
   * @param {string} strandId
   * @param {Record<string, unknown>} [options]
   * @returns {Promise<CoordinateTransferPlanV1>}
   */
  async planStrandTransfer(strandId, options = {}) {
    return await planStrandTransferImpl(this._host, strandId, options);
  }

  /**
   * Plans a deterministic transfer between two substrate observation selectors.
   * @param {{ source: Record<string, unknown>, target: Record<string, unknown>, scope?: VisibleStateScopeV1|null }} options
   * @returns {Promise<CoordinateTransferPlanV1>}
   */
  async planCoordinateTransfer(options) {
    return await planCoordinateTransferImpl(this._host, options);
  }

  /**
   * Compares two substrate observation selectors.
   * @param {{ left: Record<string, unknown>, right: Record<string, unknown>, targetId?: string|null, scope?: VisibleStateScopeV1|null }} options
   * @returns {Promise<CoordinateComparisonV1>}
   */
  async compareCoordinates(options) {
    return await compareCoordinatesImpl(this._host, options);
  }
}

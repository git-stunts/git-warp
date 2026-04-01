import HealthCheckService from '../../../src/domain/services/HealthCheckService.js';
import ClockAdapter from '../../../src/infrastructure/adapters/ClockAdapter.js';
import { buildCheckpointRef, buildCoverageRef } from '../../../src/domain/utils/RefLayout.js';
import { EXIT_CODES } from '../infrastructure.js';
import { openGraph, applyCursorCeiling, emitCursorWarning, readCheckpointDate, createHookInstaller } from '../shared.js';

/** @typedef {import('../types.js').CliOptions} CliOptions */
/** @typedef {import('../types.js').Persistence} Persistence */
/** @typedef {import('../types.js').WarpGraphInstance} WarpGraphInstance */

/**
 * Performs a health check on the graph persistence.
 *
 * @param {Persistence} persistence - The persistence adapter
 * @returns {Promise<{status: string, components: {repository: {status: string, latencyMs: number}, index: {status: string, loaded: boolean, shardCount?: number}}, cachedAt?: string}>}
 */
async function getHealth(persistence) {
  const clock = ClockAdapter.global();
  const corePersistence = /** @type {import('../../../src/domain/types/WarpPersistence.js').CorePersistence} */ (/** @type {unknown} */ (persistence));
  const healthService = new HealthCheckService({ persistence: corePersistence, clock });
  return await healthService.getHealth();
}

/**
 * Collects garbage collection metrics for the graph.
 *
 * @param {WarpGraphInstance} graph - The graph instance
 * @returns {Promise<{totalTombstones: number, tombstoneRatio: number} | null>}
 */
async function getGcMetrics(graph) {
  await graph.materialize();
  return graph.getGCMetrics();
}

/**
 * Collects current head SHAs for all writers in the graph.
 *
 * @param {WarpGraphInstance} graph - The graph instance
 * @returns {Promise<Array<{writerId: string, sha: string}>>}
 */
async function collectWriterHeads(graph) {
  const frontier = await graph.getFrontier();
  const heads = [...frontier.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([writerId, sha]) => ({ writerId, sha }));
  return heads;
}

/**
 * Loads checkpoint information for a graph.
 *
 * @param {Persistence} persistence - The persistence adapter
 * @param {string} graphName - Name of the graph
 * @returns {Promise<{ref: string, sha: string|null, date: string|null, ageSeconds: number|null}>}
 */
async function loadCheckpointInfo(persistence, graphName) {
  const checkpointRef = buildCheckpointRef(graphName);
  const checkpointSha = (await persistence.readRef(checkpointRef)) ?? '';
  const checkpointDate = await readCheckpointDate(persistence, checkpointSha);
  const checkpointAgeSeconds = computeAgeSeconds(checkpointDate);

  return {
    ref: checkpointRef,
    sha: checkpointSha !== '' ? checkpointSha : null,
    date: checkpointDate,
    ageSeconds: checkpointAgeSeconds,
  };
}

/**
 * Computes the age in seconds for a ISO date string.
 *
 * @param {string|null} checkpointDate - ISO date string
 * @returns {number|null} Age in seconds or null if invalid
 */
function computeAgeSeconds(checkpointDate) {
  if (checkpointDate === null || checkpointDate === undefined || checkpointDate === '') {
    return null;
  }
  const parsed = Date.parse(checkpointDate);
  if (Number.isNaN(parsed)) {
    return null;
  }
  return Math.max(0, Math.floor((Date.now() - parsed) / 1000));
}

/**
 * Loads coverage information for a graph.
 *
 * @param {Persistence} persistence - The persistence adapter
 * @param {string} graphName - Name of the graph
 * @param {Array<{writerId: string, sha: string}>} writerHeads - Current writer heads
 * @returns {Promise<{ref: string, sha: string|null, missingWriters: string[]}>}
 */
async function loadCoverageInfo(persistence, graphName, writerHeads) {
  const coverageRef = buildCoverageRef(graphName);
  const coverageSha = (await persistence.readRef(coverageRef)) ?? '';
  const missingWriters = coverageSha !== ''
    ? await findMissingWriters(persistence, writerHeads, coverageSha)
    : [];

  return {
    ref: coverageRef,
    sha: coverageSha !== '' ? coverageSha : null,
    missingWriters: missingWriters.sort(),
  };
}

/**
 * Identifies writers whose heads are not reachable from the coverage commit.
 *
 * @param {Persistence} persistence - The persistence adapter
 * @param {Array<{writerId: string, sha: string}>} writerHeads - Current writer heads
 * @param {string} coverageSha - SHA of the coverage commit
 * @returns {Promise<string[]>} List of writer IDs missing from coverage
 */
async function findMissingWriters(persistence, writerHeads, coverageSha) {
  const missing = [];
  for (const head of writerHeads) {
    const reachable = await persistence.isAncestor(head.sha, coverageSha);
    if (!reachable) {
      missing.push(head.writerId);
    }
  }
  return missing;
}

/**
 * Builds the structured payload for the check command result.
 *
 * @param {{repo: string, graphName: string, health: unknown, checkpoint: unknown, writerHeads: Array<{writerId: string, sha: string}>, coverage: unknown, gcMetrics: unknown, hook: unknown|null, status: unknown|null}} params
 * @returns {Record<string, unknown>}
 */
function buildCheckPayload({
  repo,
  graphName,
  health,
  checkpoint,
  writerHeads,
  coverage,
  gcMetrics,
  hook,
  status,
}) {
  return {
    repo,
    graph: graphName,
    health,
    checkpoint,
    writers: { count: writerHeads.length, heads: writerHeads },
    coverage,
    gc: gcMetrics,
    hook: hook ?? null,
    status: status ?? null,
  };
}

/**
 * Returns the status of WARP git hooks for a repository.
 *
 * @param {string} repoPath - Path to the git repository
 * @returns {{ installed: boolean, version?: string, current?: boolean, foreign?: boolean, hookPath: string }|null}
 */
function getHookStatusForCheck(repoPath) {
  try {
    const installer = createHookInstaller();
    return installer.getHookStatus(repoPath);
  } catch {
    return null;
  }
}

/**
 * Handles the `check` command: reports graph health, GC, and hook status.
 *
 * @param {{options: CliOptions}} params
 * @returns {Promise<{payload: unknown, exitCode: number}>}
 */
export async function handleCheck({ options }) {
  const { graph, graphName, persistence } = await openGraph(options);
  const cursorInfo = await applyCursorCeiling(graph, persistence, graphName);
  emitCursorWarning(cursorInfo, null);
  const health = await getHealth(persistence);
  const gcMetrics = await getGcMetrics(graph);
  const status = await graph.status();
  const writerHeads = await collectWriterHeads(graph);
  const checkpoint = await loadCheckpointInfo(persistence, graphName);
  const coverage = await loadCoverageInfo(persistence, graphName, writerHeads);
  const hook = getHookStatusForCheck(options.repo);

  return {
    payload: buildCheckPayload({
      repo: options.repo,
      graphName,
      health,
      checkpoint,
      writerHeads,
      coverage,
      gcMetrics,
      hook,
      status,
    }),
    exitCode: EXIT_CODES.OK,
  };
}

export default handleCheck;

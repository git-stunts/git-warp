import HealthCheckService from '../../../src/domain/services/HealthCheckService.js';
import ClockAdapter from '../../../src/infrastructure/adapters/ClockAdapter.js';
import { buildCheckpointRef, buildCoverageRef } from '../../../src/domain/utils/RefLayout.js';
import { EXIT_CODES } from '../infrastructure.js';
import { openGraph, applyCursorCeiling, emitCursorWarning, readCheckpointDate, createHookInstaller } from '../shared.js';

/** @typedef {import('../types.js').CliOptions} CliOptions */
/** @typedef {import('../types.js').Persistence} Persistence */
/** @typedef {import('../types.js').WarpGraphInstance} WarpGraphInstance */

/** @param {Persistence} persistence */
async function getHealth(persistence) {
  const clock = ClockAdapter.global();
  const healthService = new HealthCheckService({ persistence: /** @type {*} */ (persistence), clock }); // TODO(ts-cleanup): narrow port type
  return await healthService.getHealth();
}

/** @param {WarpGraphInstance} graph */
async function getGcMetrics(graph) {
  await graph.materialize();
  return graph.getGCMetrics();
}

/** @param {WarpGraphInstance} graph */
async function collectWriterHeads(graph) {
  const frontier = await graph.getFrontier();
  return [...frontier.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([writerId, sha]) => ({ writerId, sha }));
}

/**
 * @param {Persistence} persistence
 * @param {string} graphName
 */
async function loadCheckpointInfo(persistence, graphName) {
  const checkpointRef = buildCheckpointRef(graphName);
  const checkpointSha = await persistence.readRef(checkpointRef);
  const checkpointDate = await readCheckpointDate(persistence, checkpointSha);
  const checkpointAgeSeconds = computeAgeSeconds(checkpointDate);

  return {
    ref: checkpointRef,
    sha: checkpointSha || null,
    date: checkpointDate,
    ageSeconds: checkpointAgeSeconds,
  };
}

/** @param {string|null} checkpointDate */
function computeAgeSeconds(checkpointDate) {
  if (!checkpointDate) {
    return null;
  }
  const parsed = Date.parse(checkpointDate);
  if (Number.isNaN(parsed)) {
    return null;
  }
  return Math.max(0, Math.floor((Date.now() - parsed) / 1000));
}

/**
 * @param {Persistence} persistence
 * @param {string} graphName
 * @param {Array<{writerId: string, sha: string}>} writerHeads
 */
async function loadCoverageInfo(persistence, graphName, writerHeads) {
  const coverageRef = buildCoverageRef(graphName);
  const coverageSha = await persistence.readRef(coverageRef);
  const missingWriters = coverageSha
    ? await findMissingWriters(persistence, writerHeads, coverageSha)
    : [];

  return {
    ref: coverageRef,
    sha: coverageSha || null,
    missingWriters: missingWriters.sort(),
  };
}

/**
 * @param {Persistence} persistence
 * @param {Array<{writerId: string, sha: string}>} writerHeads
 * @param {string} coverageSha
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
 * @param {{repo: string, graphName: string, health: *, checkpoint: *, writerHeads: Array<{writerId: string, sha: string}>, coverage: *, gcMetrics: *, hook: *|null, status: *|null}} params
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
    writers: {
      count: writerHeads.length,
      heads: writerHeads,
    },
    coverage,
    gc: gcMetrics,
    hook: hook || null,
    status: status || null,
  };
}

/** @param {string} repoPath */
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
 * @param {{options: CliOptions}} params
 * @returns {Promise<{payload: *, exitCode: number}>}
 */
export default async function handleCheck({ options }) {
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

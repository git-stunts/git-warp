import HealthCheckService from '../../../src/domain/services/HealthCheckService.ts';
import { buildCheckpointRef, buildCoverageRef } from '../../../src/domain/utils/RefLayout.ts';
import type { CorePersistence } from '../../../src/domain/types/WarpPersistence.ts';
import { EXIT_CODES } from '../infrastructure.ts';
import { openGraph, applyCursorCeiling, emitCursorWarning, readCheckpointDate, createHookInstaller } from '../shared.ts';
import type { CliOptions, Persistence, WarpGraphInstance } from '../types.ts';

/** Performs a health check on the graph persistence. */
async function getHealth(persistence: Persistence): Promise<{ status: string; components: { repository: { status: string; latencyMs: number }; index: { status: string; loaded: boolean; shardCount?: number } }; cachedAt?: string }> {
  const corePersistence = persistence as unknown as CorePersistence;
  const healthService = new HealthCheckService({ persistence: corePersistence });
  return await healthService.getHealth(0);
}

/** Collects garbage collection metrics for the graph. */
async function getGcMetrics(graph: WarpGraphInstance): Promise<{ totalTombstones: number; tombstoneRatio: number } | null> {
  await graph.materialize();
  return graph.getGCMetrics();
}

/** Collects current head SHAs for all writers in the graph. */
async function collectWriterHeads(graph: WarpGraphInstance): Promise<Array<{ writerId: string; sha: string }>> {
  const frontier = await graph.getFrontier();
  const heads = [...frontier.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([writerId, sha]) => ({ writerId, sha }));
  return heads;
}

/** Loads checkpoint information for a graph. */
async function loadCheckpointInfo(persistence: Persistence, graphName: string): Promise<{ ref: string; sha: string | null; date: string | null; ageSeconds: number | null }> {
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

/** Computes the age in seconds for a ISO date string. */
function computeAgeSeconds(checkpointDate: string | null): number | null {
  if (checkpointDate === null || checkpointDate === undefined || checkpointDate === '') {
    return null;
  }
  const parsed = Date.parse(checkpointDate);
  if (Number.isNaN(parsed)) {
    return null;
  }
  return Math.max(0, Math.floor((Date.now() - parsed) / 1000));
}

/** Loads coverage information for a graph. */
async function loadCoverageInfo(persistence: Persistence, graphName: string, writerHeads: Array<{ writerId: string; sha: string }>): Promise<{ ref: string; sha: string | null; missingWriters: string[] }> {
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

/** Identifies writers whose heads are not reachable from the coverage commit. */
async function findMissingWriters(persistence: Persistence, writerHeads: Array<{ writerId: string; sha: string }>, coverageSha: string): Promise<string[]> {
  const missing: string[] = [];
  for (const head of writerHeads) {
    const reachable = await persistence.isAncestor(head.sha, coverageSha);
    if (!reachable) {
      missing.push(head.writerId);
    }
  }
  return missing;
}

/** Builds the structured payload for the check command result. */
interface CheckPayloadInput {
  readonly repo: string;
  readonly graphName: string;
  readonly health: unknown;
  readonly checkpoint: unknown;
  readonly writerHeads: Array<{ writerId: string; sha: string }>;
  readonly coverage: unknown;
  readonly gcMetrics: unknown;
  readonly hook: unknown;
  readonly status: unknown;
}

function buildCheckPayload(input: CheckPayloadInput): Record<string, unknown> {
  const { repo, graphName, health, checkpoint, writerHeads, coverage, gcMetrics, hook, status } = input;
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

/** Returns the status of WARP git hooks for a repository. */
async function getHookStatusForCheck(repoPath: string): Promise<{ installed: boolean; version?: string; current?: boolean; foreign?: boolean; hookPath: string } | null> {
  try {
    const installer = createHookInstaller();
    return await installer.getHookStatus(repoPath);
  } catch {
    return null;
  }
}

/** Handles the `check` command: reports graph health, GC, and hook status. */
export async function handleCheck({ options }: { options: CliOptions }): Promise<{ payload: unknown; exitCode: number }> {
  const { graph, graphName, persistence } = await openGraph(options);
  const cursorInfo = await applyCursorCeiling(graph, persistence, graphName);
  emitCursorWarning(cursorInfo, null);
  const health = await getHealth(persistence);
  const gcMetrics = await getGcMetrics(graph);
  const status = await graph.status();
  const writerHeads = await collectWriterHeads(graph);
  const checkpoint = await loadCheckpointInfo(persistence, graphName);
  const coverage = await loadCoverageInfo(persistence, graphName, writerHeads);
  const hook = await getHookStatusForCheck(options.repo);

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

import WebCryptoAdapter from '../../../src/infrastructure/adapters/WebCryptoAdapter.ts';
import type { CorePersistence } from '../../../src/domain/types/WarpPersistence.ts';
import { openRuntimeHostProduct } from '../../../src/domain/warp/RuntimeHostProduct.ts';
import type RuntimeStorageProviderPort from '../../../src/ports/RuntimeStorageProviderPort.ts';
import {
  buildCheckpointRef,
  buildCoverageRef,
  buildWritersPrefix,
  parseWriterIdFromRef,
} from '../../../src/domain/utils/RefLayout.ts';
import { notFoundError } from '../infrastructure.ts';
import { createPersistence, listGraphNames, readActiveCursor, readCheckpointDate } from '../shared.ts';
import type { CliOptions, Persistence, GraphInfoResult } from '../types.ts';

/** Collects metadata about a single graph (writer count, refs, patches, checkpoint). */
async function getGraphInfo(persistence: Persistence, runtimeStorage: RuntimeStorageProviderPort, graphName: string, {
  includeWriterIds = false,
  includeRefs = false,
  includeWriterPatches = false,
  includeCheckpointDate = false,
}: { includeWriterIds?: boolean; includeRefs?: boolean; includeWriterPatches?: boolean; includeCheckpointDate?: boolean } = {}): Promise<GraphInfoResult> {
  const writersPrefix = buildWritersPrefix(graphName);
  const writerRefs = typeof persistence.listRefs === 'function'
    ? await persistence.listRefs(writersPrefix)
    : [];
  const writerIds: string[] = writerRefs
    .map((ref) => parseWriterIdFromRef(ref))
    .filter(Boolean)
    .sort() as string[];

  const info: GraphInfoResult = {
    name: graphName,
    writers: {
      count: writerIds.length,
    },
  };

  if (includeWriterIds) {
    info.writers.ids = writerIds;
  }

  if (includeRefs || includeCheckpointDate) {
    const checkpointRef = buildCheckpointRef(graphName);
    const checkpointSha = await persistence.readRef(checkpointRef);

    const checkpoint: { ref: string; sha: string | null; date?: string | null } = { ref: checkpointRef, sha: (checkpointSha !== null && checkpointSha !== undefined && checkpointSha.length > 0) ? checkpointSha : null };

    if (includeCheckpointDate && typeof checkpointSha === 'string' && checkpointSha.length > 0) {
      const checkpointDate = await readCheckpointDate(persistence, checkpointSha);
      checkpoint.date = checkpointDate;
    }

    info.checkpoint = checkpoint;

    if (includeRefs) {
      const coverageRef = buildCoverageRef(graphName);
      const coverageSha = await persistence.readRef(coverageRef);
      info.coverage = { ref: coverageRef, sha: (coverageSha !== null && coverageSha !== undefined && coverageSha.length > 0) ? coverageSha : null };
    }
  }

  if (includeWriterPatches && writerIds.length > 0) {
    const graph = await openRuntimeHostProduct({
      persistence: persistence as unknown as CorePersistence,
      runtimeStorage,
      graphName,
      writerId: 'cli',
      crypto: new WebCryptoAdapter(),
    });
    const writerPatches: Record<string, number> = {};
    for (const writerId of writerIds) {
      const patches = await graph.getWriterPatches(writerId);
      writerPatches[writerId] = patches.length;
    }
    info.writerPatches = writerPatches;
  }

  return info;
}

/** Handles the `info` command: summarizes graphs in the repository. */
export default async function handleInfo({ options }: { options: CliOptions }): Promise<{ repo: string; graphs: GraphInfoResult[] }> {
  const { persistence, runtimeStorage } = await createPersistence(options.repo);
  const graphNames = await listGraphNames(persistence);

  if (typeof options.graph === 'string' && options.graph.length > 0 && !graphNames.includes(options.graph)) {
    throw notFoundError(`Graph not found: ${options.graph}`);
  }

  const detailGraphs = new Set<string>();
  if (typeof options.graph === 'string' && options.graph.length > 0) {
    detailGraphs.add(options.graph);
  } else if (graphNames.length === 1 && graphNames[0] !== undefined) {
    detailGraphs.add(graphNames[0]);
  }

  // In view mode, include extra data for visualization
  const isViewMode = Boolean(options.view);

  const graphs: GraphInfoResult[] = [];
  for (const name of graphNames) {
    const includeDetails = detailGraphs.has(name);
    const info = await getGraphInfo(persistence, runtimeStorage, name, {
      includeWriterIds: includeDetails || isViewMode,
      includeRefs: includeDetails || isViewMode,
      includeWriterPatches: isViewMode,
      includeCheckpointDate: isViewMode,
    });
    const activeCursor = await readActiveCursor(persistence, name);
    if (activeCursor) {
      info.cursor = {
        active: true,
        tick: activeCursor.tick,
        ...(activeCursor.mode !== undefined ? { mode: activeCursor.mode } : {}),
      };
    } else {
      info.cursor = { active: false };
    }
    graphs.push(info);
  }

  return {
    repo: options.repo,
    graphs,
  };
}

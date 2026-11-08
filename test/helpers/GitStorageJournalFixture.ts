/**
 * Production Git storage fixtures for materialize tests: open a runtime host
 * on `GitStorage`, and append a crafted patch to a writer chain without any
 * retained materialization (as after a sync into a fresh clone).
 */

import Patch from '../../src/domain/types/Patch.ts';
import GitStorage from '../../src/application/GitStorage.ts';
import { getDefaultRuntimeHostNodePorts } from '../../src/application/RuntimeHostNodeDefaults.ts';
import { resolveWarpStorage } from '../../src/application/WarpStorageRegistry.ts';
import { openRuntimeHostProduct } from '../../src/domain/warp/RuntimeHostProduct.ts';
import GitCasRepositoryAdapter from '../../src/infrastructure/adapters/GitCasRepositoryAdapter.ts';
import { openDefaultGitPlumbing } from '../../src/infrastructure/adapters/GitPlumbingRuntimeAdapter.ts';
import GitTimelineHistoryAdapter from '../../src/infrastructure/adapters/GitTimelineHistoryAdapter.ts';
import { createGitRepo } from './warpGraphTestUtils.ts';

export const JOURNAL_GRAPH = 'g';

export type GitStorageHost = Awaited<ReturnType<typeof openRuntimeHostProduct>>;

export async function withGitStorageHost<T>(
  cwd: string,
  writerId: string,
  work: (host: GitStorageHost) => Promise<T>,
): Promise<T> {
  const ports = getDefaultRuntimeHostNodePorts();
  const storage = await GitStorage.open({ cwd });
  try {
    const binding = resolveWarpStorage(storage);
    const host = await openRuntimeHostProduct({
      persistence: binding.history,
      runtimeStorage: binding.runtimeStorage,
      graphName: JOURNAL_GRAPH,
      writerId,
      codec: ports.codec,
      crypto: ports.crypto,
      trustCrypto: ports.trustCrypto,
      commitMessageCodec: ports.commitMessageCodec,
    });
    return await work(host);
  } finally {
    await storage.close();
  }
}

export async function appendJournalPatch(cwd: string, patch: Patch, parent: string | null = null): Promise<string> {
  const ports = getDefaultRuntimeHostNodePorts();
  const plumbing = await openDefaultGitPlumbing(cwd);
  const history = new GitTimelineHistoryAdapter({ plumbing });
  const repo = new GitCasRepositoryAdapter({ plumbing, history });
  try {
    const services = repo.createMigrationStorageServices({
      timelineName: JOURNAL_GRAPH,
      codec: ports.codec,
      crypto: ports.crypto,
      commitMessageCodec: ports.commitMessageCodec,
    });
    const published = await services.patchJournal.appendPatch({
      patch,
      graph: JOURNAL_GRAPH,
      writer: patch.writer,
      targetRef: `refs/warp/${JOURNAL_GRAPH}/writers/${patch.writer}`,
      expectedHead: parent,
      parent,
      attachments: [],
    });
    return published.sha;
  } finally {
    await repo.close();
    await history.close();
  }
}

export async function inGitRepo<T>(label: string, work: (cwd: string) => Promise<T>): Promise<T> {
  const repo = await createGitRepo(label);
  try {
    return await work(repo.tempDir);
  } finally {
    await repo.cleanup();
  }
}

/** Appends patches with no retained materialization; opening a host first writes the substrate marker. */
export async function appendJournalOnly(cwd: string, patches: readonly Patch[]): Promise<void> {
  await withGitStorageHost(cwd, 'init', async () => { /* writes the substrate marker */ });
  const tips = new Map<string, string>();
  for (const patch of patches) {
    tips.set(patch.writer, await appendJournalPatch(cwd, patch, tips.get(patch.writer) ?? null));
  }
}

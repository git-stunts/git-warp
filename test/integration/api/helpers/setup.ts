/**
 * Runtime-agnostic setup helper for API integration tests.
 *
 * Uses Node.js fs/os APIs which are available via node: specifiers
 * in Node, Bun, and (with --allow-all) Deno.
 */
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import Plumbing from '@git-stunts/plumbing';
import GitTimelineHistoryAdapter from '../../../../src/infrastructure/adapters/GitTimelineHistoryAdapter.ts';
import GitCasRepositoryAdapter from '../../../../src/infrastructure/adapters/GitCasRepositoryAdapter.ts';
import WarpCore from '../../../../src/domain/WarpCore.ts';
import WebCryptoAdapter from '../../../../src/infrastructure/adapters/WebCryptoAdapter.ts';
import defaultCodec from '../../../../src/infrastructure/codecs/CborCodec.ts';

/**
 * Creates a temporary git repository with persistence adapter, codec, and crypto.
 *
 * @param {string} [label='api-test'] - Label for the temp directory prefix
 * @returns {Promise<{persistence: Object, plumbing: Object, tempDir: string, codec: typeof defaultCodec, crypto: WebCryptoAdapter, cleanup: () => Promise<void>, openGraph: (graphName: string, writerId: string, opts?: Object) => Promise<Object>}>}
 */
export async function createTestRepo(label = 'api-test') {
  const tempDir = await mkdtemp(join(tmpdir(), `warp-${label}-`));
  const codec = defaultCodec;
  const crypto = new WebCryptoAdapter();

  try {
    const plumbing = await Plumbing.createDefault({ cwd: tempDir });
    await plumbing.execute({ args: ['init'] });
    await plumbing.execute({ args: ['config', 'user.email', 'test@test.com'] });
    await plumbing.execute({ args: ['config', 'user.name', 'Test'] });
    const persistence = new GitTimelineHistoryAdapter({ plumbing });
    const runtimeStorage = new GitCasRepositoryAdapter({ plumbing, history: persistence });

    /**
     * Opens a graph core with WebCryptoAdapter pre-configured.
     * @param {string} graphName - Name of the graph to open
     * @param {string} writerId - Writer identity
     * @param {Object} [opts={}] - Additional options forwarded to WarpCore.open
     * @returns {Promise<Object>} Opened graph core
     */
    /**
     * @param {string} graphName
     * @param {string} writerId
     * @param {Object} [opts]
     */
    async function openGraph(graphName, writerId, opts = {}) {
      return WarpCore.open({
        runtimeStorage,
        stateCache: null,
        ...opts,
        persistence,
        graphName,
        writerId,
        codec,
        crypto,
      });
    }

    return {
      persistence,
      plumbing,
      tempDir,
      codec,
      crypto,
      openGraph,
      async cleanup() {
        await rm(tempDir, { recursive: true, force: true });
      },
    };
  } catch (err) {
    await rm(tempDir, { recursive: true, force: true });
    throw err;
  }
}

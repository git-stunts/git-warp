/**
 * Runtime-agnostic setup helper for API integration tests.
 *
 * Uses Node.js fs/os APIs which are available via node: specifiers
 * in Node, Bun, and (with --allow-all) Deno.
 */
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
// @ts-expect-error - no declaration file for @git-stunts/plumbing
import Plumbing from '@git-stunts/plumbing';
import GitGraphAdapter from '../../../../src/infrastructure/adapters/GitGraphAdapter.js';
import WarpGraph from '../../../../src/domain/WarpGraph.js';
import WebCryptoAdapter from '../../../../src/infrastructure/adapters/WebCryptoAdapter.js';

/**
 * Creates a temporary git repository with persistence adapter and crypto.
 *
 * @param {string} [label='api-test'] - Label for the temp directory prefix
 * @returns {Promise<{persistence: Object, tempDir: string, crypto: WebCryptoAdapter, cleanup: () => Promise<void>, openGraph: (graphName: string, writerId: string, opts?: Object) => Promise<Object>}>}
 */
export async function createTestRepo(label = 'api-test') {
  const tempDir = await mkdtemp(join(tmpdir(), `warp-${label}-`));
  const crypto = new WebCryptoAdapter();

  try {
    const plumbing = Plumbing.createDefault({ cwd: tempDir });
    await plumbing.execute({ args: ['init'] });
    await plumbing.execute({ args: ['config', 'user.email', 'test@test.com'] });
    await plumbing.execute({ args: ['config', 'user.name', 'Test'] });
    const persistence = new GitGraphAdapter({ plumbing });

    /**
     * Opens a WarpGraph with WebCryptoAdapter pre-configured.
     * @param {string} graphName - Name of the graph to open
     * @param {string} writerId - Writer identity
     * @param {Object} [opts={}] - Additional options forwarded to WarpGraph.open
     * @returns {Promise<Object>} Opened WarpGraph instance
     */
    async function openGraph(graphName, writerId, opts = {}) {
      return WarpGraph.open({
        ...opts,
        persistence,
        graphName,
        writerId,
        crypto,
      });
    }

    return {
      persistence,
      tempDir,
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

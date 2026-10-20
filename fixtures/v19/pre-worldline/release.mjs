// Loads the v19.1.0 release from a built worktree of its tag.
//
// Shared by generate.mjs and census.mjs. Every import resolves into the
// release's own `dist`, never into the current source tree.
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

export const RELEASE_TAG = 'v19.1.0';
export const RELEASE_COMMIT = '20a9b7f76d07195de0782f0852102434bdd200d3';
const FIXED_DATE = '2026-01-01T00:00:00Z';

// A hook or wrapper shell can export these. Git honors them over `-C` and
// cwd, so the generator would write into the caller's repository. Clearing
// them here also isolates the git children the release runtime spawns.
for (const name of [
  'GIT_DIR',
  'GIT_WORK_TREE',
  'GIT_COMMON_DIR',
  'GIT_INDEX_FILE',
  'GIT_OBJECT_DIRECTORY',
  'GIT_ALTERNATE_OBJECT_DIRECTORIES',
  'GIT_PREFIX',
]) {
  delete process.env[name];
}

export function git(cwd, args) {
  return execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8' }).trim();
}

/** Fixes author and committer identity and time so commit ids reproduce. */
export function pinFixtureClock() {
  for (const role of ['AUTHOR', 'COMMITTER']) {
    process.env[`GIT_${role}_NAME`] = 'Git Warp Fixture';
    process.env[`GIT_${role}_EMAIL`] = 'fixture@git-warp.local';
    process.env[`GIT_${role}_DATE`] = FIXED_DATE;
  }
}

/**
 * Opens the release at `release` against the repository at `repository`.
 *
 * `withRuntime` uses the public Runtime API. `withHost` opens the release's
 * internal RuntimeHost for calls the public API omits (ownerless strands,
 * braids, patch and strand reads).
 */
export async function openRelease(release, repository) {
  const head = git(release, ['rev-parse', 'HEAD']);
  if (head !== RELEASE_COMMIT) {
    throw new Error(`${release} is at ${head}, not ${RELEASE_TAG} (${RELEASE_COMMIT})`);
  }
  const dist = (path) => import(pathToFileURL(join(release, 'dist', path)).href);
  const { Runtime } = await dist('index.js');
  const { intent } = await dist('advanced.js');
  const { default: GitStorage } = await dist('src/application/GitStorage.js');
  const { resolveWarpStorage } = await dist('src/application/WarpStorageRegistry.js');
  const { getDefaultRuntimeHostNodePorts } = await dist(
    'src/application/RuntimeHostNodeDefaults.js',
  );
  const { openRuntimeHostProduct } = await dist('src/domain/warp/RuntimeHostProduct.js');

  async function withRuntime(writer, work) {
    const runtime = await Runtime.open({ at: repository, writer });
    try {
      return await work(runtime);
    } finally {
      await runtime.close();
    }
  }

  async function withHost(graphName, writerId, work) {
    const storage = await GitStorage.open({ cwd: repository });
    try {
      const binding = resolveWarpStorage(storage);
      const ports = getDefaultRuntimeHostNodePorts();
      const host = await openRuntimeHostProduct({
        persistence: binding.history,
        runtimeStorage: binding.runtimeStorage,
        graphName,
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

  return { intent, withRuntime, withHost };
}

/**
 * Shared setup for BATS seed scripts.
 * Resolves project root, dynamic-imports WarpCore + GitTimelineHistoryAdapter +
 * NodeCryptoAdapter + runtime codec defaults, and creates persistence/
 * crypto adapters for the repo at REPO_PATH.
 */
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import GitPlumbing, { ShellRunnerFactory } from '@git-stunts/plumbing';

const projectRoot = process.env['PROJECT_ROOT'] || resolve(import.meta.dirname, '../../..');
const repoPath = process.env['REPO_PATH'];

function moduleUrl(preferredBuiltPath: string, sourcePath: string): string {
  const builtPath = resolve(projectRoot, preferredBuiltPath);
  const modulePath = existsSync(builtPath) ? builtPath : resolve(projectRoot, sourcePath);
  return pathToFileURL(modulePath).href;
}

const warpCoreUrl = moduleUrl('dist/src/domain/WarpCore.js', 'src/domain/WarpCore.ts');
const adapterUrl = moduleUrl(
  'dist/src/infrastructure/adapters/GitTimelineHistoryAdapter.js',
  'src/infrastructure/adapters/GitTimelineHistoryAdapter.ts',
);
const cryptoUrl = moduleUrl(
  'dist/src/infrastructure/adapters/NodeCryptoAdapter.js',
  'src/infrastructure/adapters/NodeCryptoAdapter.ts',
);
const repositoryStorageUrl = moduleUrl(
  'dist/src/infrastructure/adapters/GitCasRepositoryAdapter.js',
  'src/infrastructure/adapters/GitCasRepositoryAdapter.ts',
);
const runtimeNodeDefaultsUrl = moduleUrl(
  'dist/src/application/RuntimeHostNodeDefaults.js',
  'src/application/RuntimeHostNodeDefaults.ts',
);
const { default: WarpCore } = await import(warpCoreUrl);
const { default: GitTimelineHistoryAdapter } = await import(adapterUrl);
const { default: NodeCryptoAdapter } = await import(cryptoUrl);
const { default: GitCasRepositoryAdapter } = await import(repositoryStorageUrl);
const { installDefaultRuntimeHostNodePorts } = await import(runtimeNodeDefaultsUrl);

installDefaultRuntimeHostNodePorts();

const runner = ShellRunnerFactory.create();
const plumbing = new GitPlumbing({ cwd: repoPath, runner });
const persistence = new GitTimelineHistoryAdapter({ plumbing });
const crypto = new NodeCryptoAdapter();
const runtimeStorage = new GitCasRepositoryAdapter({ plumbing, history: persistence });

async function openGraph(graphName: string, writerId: string, options = {}) {
  return await WarpCore.open({
    ...options,
    persistence,
    runtimeStorage,
    graphName,
    writerId,
    crypto,
  });
}

function createTrustChain() {
  return runtimeStorage.createTrustChain(crypto);
}

export { openGraph, persistence, crypto, createTrustChain };

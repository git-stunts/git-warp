/**
 * Shared setup for BATS seed scripts.
 * Resolves project root, dynamic-imports WarpCore + GitGraphAdapter +
 * NodeCryptoAdapter, and creates persistence/crypto adapters for the
 * repo at REPO_PATH.
 */
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import GitPlumbing, { ShellRunnerFactory } from '@git-stunts/plumbing';

const projectRoot = process.env['PROJECT_ROOT'] || resolve(import.meta.dirname, '../../..');
const repoPath = process.env['REPO_PATH'];

const warpCoreUrl = pathToFileURL(resolve(projectRoot, 'src/domain/WarpCore.ts')).href;
const adapterUrl = pathToFileURL(resolve(projectRoot, 'src/infrastructure/adapters/GitGraphAdapter.ts')).href;
const cryptoUrl = pathToFileURL(resolve(projectRoot, 'src/infrastructure/adapters/NodeCryptoAdapter.ts')).href;
const { default: WarpCore } = await import(warpCoreUrl);
const { default: GitGraphAdapter } = await import(adapterUrl);
const { default: NodeCryptoAdapter } = await import(cryptoUrl);

const runner = ShellRunnerFactory.create();
const plumbing = new GitPlumbing({ cwd: repoPath, runner });
const persistence = new GitGraphAdapter({ plumbing });
const crypto = new NodeCryptoAdapter();

async function openGraph(graphName: string, writerId: string, options = {}) {
  return await WarpCore.open({
    ...options,
    persistence,
    graphName,
    writerId,
    crypto,
  });
}

export { openGraph, persistence, crypto, plumbing };

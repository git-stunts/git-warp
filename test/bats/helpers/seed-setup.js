/**
 * Shared setup for BATS seed scripts.
 * Resolves project root, dynamic-imports WarpGraph + GitGraphAdapter +
 * NodeCryptoAdapter, and creates persistence/crypto adapters for the
 * repo at REPO_PATH.
 */
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
// @ts-expect-error - no declaration file for @git-stunts/plumbing
import GitPlumbing, { ShellRunnerFactory } from '@git-stunts/plumbing';

const projectRoot = process.env.PROJECT_ROOT || resolve(import.meta.dirname, '../../..');
const repoPath = process.env.REPO_PATH;

const warpGraphUrl = pathToFileURL(resolve(projectRoot, 'src/domain/WarpGraph.js')).href;
const adapterUrl = pathToFileURL(resolve(projectRoot, 'src/infrastructure/adapters/GitGraphAdapter.js')).href;
const cryptoUrl = pathToFileURL(resolve(projectRoot, 'src/infrastructure/adapters/NodeCryptoAdapter.js')).href;
const { default: WarpGraph } = await import(warpGraphUrl);
const { default: GitGraphAdapter } = await import(adapterUrl);
const { default: NodeCryptoAdapter } = await import(cryptoUrl);

const runner = ShellRunnerFactory.create();
const plumbing = new GitPlumbing({ cwd: repoPath, runner });
const persistence = new GitGraphAdapter({ plumbing });
const crypto = new NodeCryptoAdapter();

export { WarpGraph, persistence, crypto };

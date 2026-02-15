/**
 * Seeds a graph with audit + trust configured.
 * Creates patches under writer "alice", enables audit,
 * then initializes trust from existing writer refs.
 * Used by cli-trust.bats. Expects REPO_PATH env var.
 */
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
// @ts-expect-error - no declaration file for @git-stunts/plumbing
import GitPlumbing, { ShellRunnerFactory } from '@git-stunts/plumbing';

const projectRoot = process.env.PROJECT_ROOT || resolve(import.meta.dirname, '../../..');
const repoPath = process.env.REPO_PATH;
if (!repoPath) {
  throw new Error('REPO_PATH environment variable is required');
}

const warpGraphUrl = pathToFileURL(resolve(projectRoot, 'src/domain/WarpGraph.js')).href;
const adapterUrl = pathToFileURL(resolve(projectRoot, 'src/infrastructure/adapters/GitGraphAdapter.js')).href;
const cryptoUrl = pathToFileURL(resolve(projectRoot, 'src/infrastructure/adapters/NodeCryptoAdapter.js')).href;
const trustServiceUrl = pathToFileURL(resolve(projectRoot, 'src/domain/services/TrustService.js')).href;

const { default: WarpGraph } = await import(warpGraphUrl);
const { default: GitGraphAdapter } = await import(adapterUrl);
const { default: NodeCryptoAdapter } = await import(cryptoUrl);
const { default: TrustService } = await import(trustServiceUrl);

const runner = ShellRunnerFactory.create();
const plumbing = new GitPlumbing({ cwd: repoPath, runner });
const persistence = new GitGraphAdapter({ plumbing });
const crypto = new NodeCryptoAdapter();

// Create graph with audit enabled
const graph = await WarpGraph.open({
  persistence,
  graphName: 'demo',
  writerId: 'alice',
  crypto,
  audit: true,
});

await graph.materialize();

const p1 = await graph.createPatch();
await p1
  .addNode('user:alice')
  .setProperty('user:alice', 'role', 'engineering')
  .commit();

const p2 = await graph.createPatch();
await p2
  .addNode('user:bob')
  .setProperty('user:bob', 'role', 'sales')
  .commit();

// Initialize trust from existing writers
const trustService = new TrustService({
  persistence,
  graphName: 'demo',
  crypto,
});

await trustService.initFromWriters(['alice']);

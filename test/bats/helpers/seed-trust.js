/**
 * Seeds a graph with trust records for BATS tests.
 *
 * Creates:
 * 1. A "demo" graph with writer "alice" (3 nodes, 1 edge)
 * 2. A trust record chain: KEY_ADD(root) → KEY_ADD(key2) → WRITER_BIND_ADD(alice)
 *
 * This means "alice" is a trusted writer; any other writer (e.g. "bob") is untrusted.
 *
 * Expects REPO_PATH env var.
 */

import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
// @ts-expect-error - no declaration file for @git-stunts/plumbing
import GitPlumbing, { ShellRunnerFactory } from '@git-stunts/plumbing';

const projectRoot = process.env['PROJECT_ROOT'] || resolve(import.meta.dirname, '../../..');
const repoPath = process.env['REPO_PATH'];

const warpGraphUrl = pathToFileURL(resolve(projectRoot, 'src/domain/WarpRuntime.js')).href;
const adapterUrl = pathToFileURL(resolve(projectRoot, 'src/infrastructure/adapters/GitGraphAdapter.js')).href;
const cryptoUrl = pathToFileURL(resolve(projectRoot, 'src/infrastructure/adapters/NodeCryptoAdapter.js')).href;
const trustRecordServiceUrl = pathToFileURL(resolve(projectRoot, 'src/domain/trust/TrustRecordService.js')).href;
const goldenRecordsUrl = pathToFileURL(resolve(projectRoot, 'test/unit/domain/trust/fixtures/goldenRecords.js')).href;
const defaultCodecUrl = pathToFileURL(resolve(projectRoot, 'src/domain/utils/defaultCodec.ts')).href;

const { default: WarpRuntime } = await import(warpGraphUrl);
const { default: GitGraphAdapter } = await import(adapterUrl);
const { default: NodeCryptoAdapter } = await import(cryptoUrl);
const { TrustRecordService } = await import(trustRecordServiceUrl);
const { KEY_ADD_1, KEY_ADD_2, WRITER_BIND_ADD_ALICE } = await import(goldenRecordsUrl);
const { default: defaultCodec } = await import(defaultCodecUrl);

const runner = ShellRunnerFactory.create();
const plumbing = new GitPlumbing({ cwd: repoPath, runner });
const persistence = new GitGraphAdapter({ plumbing });
const crypto = new NodeCryptoAdapter();

// 1. Seed graph data as "alice"
const graph = await WarpRuntime.open({
  persistence,
  graphName: 'demo',
  writerId: 'alice',
  crypto,
});

const patch = await graph.createPatch();
await patch
  .addNode('user:alice')
  .setProperty('user:alice', 'role', 'engineering')
  .addNode('user:bob')
  .addEdge('user:alice', 'user:bob', 'follows')
  .commit();

// 2. Seed trust records (use real CBOR codec so CLI can read them back)
const trustService = new TrustRecordService({ persistence, codec: defaultCodec });

// Append genesis: KEY_ADD for root key
await trustService.appendRecord('demo', KEY_ADD_1, { skipSignatureVerify: true });

// Append KEY_ADD for secondary key
await trustService.appendRecord('demo', KEY_ADD_2, { skipSignatureVerify: true });

// Append WRITER_BIND_ADD for alice → root key
await trustService.appendRecord('demo', WRITER_BIND_ADD_ALICE, { skipSignatureVerify: true });

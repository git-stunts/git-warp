/**
 * Seeds a graph with trust records and multiple writers for BATS trust-sync tests.
 *
 * Creates:
 * 1. A "demo" graph with writer "alice" (trusted) — 2 nodes, 1 edge
 * 2. A trust record chain: KEY_ADD(root) → KEY_ADD(key2) → WRITER_BIND_ADD(alice)
 * 3. A second writer "bob" (untrusted) — 1 node
 *
 * This means "alice" is trusted and "bob" is untrusted.
 *
 * Expects REPO_PATH env var.
 */

import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createTrustChain, openGraph } from './seed-setup.ts';

const projectRoot = process.env['PROJECT_ROOT'] || resolve(import.meta.dirname, '../../..');

const trustRecordServiceUrl = pathToFileURL(resolve(projectRoot, 'src/domain/trust/TrustRecordService.ts')).href;
const goldenRecordsUrl = pathToFileURL(resolve(projectRoot, 'test/unit/domain/trust/fixtures/goldenRecords.ts')).href;

const { TrustRecordService } = await import(trustRecordServiceUrl);
const { KEY_ADD_1, KEY_ADD_2, WRITER_BIND_ADD_ALICE } = await import(goldenRecordsUrl);

// 1. Seed graph data as "alice" (trusted writer)
const graphAlice = await openGraph('demo', 'alice');

const patchAlice = await graphAlice.createPatch();
await patchAlice
  .addNode('user:alice')
  .setProperty('user:alice', 'role', 'engineering')
  .addNode('user:bob')
  .addEdge('user:alice', 'user:bob', 'follows')
  .commit();

// 2. Seed trust records (use GitTrustChainAdapter for git-cas persistence)
const trustChain = createTrustChain();
const trustService = new TrustRecordService(trustChain);

await trustService.appendRecord('demo', KEY_ADD_1, { skipSignatureVerify: true });
await trustService.appendRecord('demo', KEY_ADD_2, { skipSignatureVerify: true });
await trustService.appendRecord('demo', WRITER_BIND_ADD_ALICE, { skipSignatureVerify: true });

// 3. Seed graph data as "bob" (untrusted writer)
const graphBob = await openGraph('demo', 'bob');

const patchBob = await graphBob.createPatch();
await patchBob
  .addNode('user:eve')
  .setProperty('user:eve', 'role', 'unknown')
  .commit();

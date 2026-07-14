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
import { createTrustChain, openGraph } from './seed-setup.ts';

const projectRoot = process.env['PROJECT_ROOT'] || resolve(import.meta.dirname, '../../..');

const trustRecordServiceUrl = pathToFileURL(resolve(projectRoot, 'src/domain/trust/TrustRecordService.ts')).href;
const goldenRecordsUrl = pathToFileURL(resolve(projectRoot, 'test/unit/domain/trust/fixtures/goldenRecords.ts')).href;

const { TrustRecordService } = await import(trustRecordServiceUrl);
const { KEY_ADD_1, KEY_ADD_2, WRITER_BIND_ADD_ALICE } = await import(goldenRecordsUrl);

// 1. Seed graph data as "alice"
const graph = await openGraph('demo', 'alice');

const patch = await graph.createPatch();
await patch
  .addNode('user:alice')
  .setProperty('user:alice', 'role', 'engineering')
  .addNode('user:bob')
  .addEdge('user:alice', 'user:bob', 'follows')
  .commit();

// 2. Seed trust records (use GitTrustChainAdapter for git-cas persistence)
const trustChain = createTrustChain();
const trustService = new TrustRecordService(trustChain);

// Append genesis: KEY_ADD for root key
await trustService.appendRecord('demo', KEY_ADD_1, { skipSignatureVerify: true });

// Append KEY_ADD for secondary key
await trustService.appendRecord('demo', KEY_ADD_2, { skipSignatureVerify: true });

// Append WRITER_BIND_ADD for alice → root key
await trustService.appendRecord('demo', WRITER_BIND_ADD_ALICE, { skipSignatureVerify: true });

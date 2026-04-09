/**
 * B65 — Sync divergence logging tests.
 *
 * Verifies that processSyncRequest() logs E_SYNC_DIVERGENCE
 * when a writer's chain has forked, rather than silently swallowing.
 */

import { describe, it, expect, vi } from 'vitest';
import { processSyncRequest } from '../../../../src/domain/services/sync/SyncProtocol.js';
import { encodePatchMessage } from '../../../../src/domain/services/codec/WarpMessageCodec.js';
import { encode } from '../../../../src/infrastructure/codecs/CborCodec.js';
import VersionVector from '../../../../src/domain/crdt/VersionVector.ts';
import { CborPatchJournalAdapter } from '../../../../src/infrastructure/adapters/CborPatchJournalAdapter.js';
import { CborCodec } from '../../../../src/infrastructure/codecs/CborCodec.js';

const SHA_A = 'a'.repeat(40);
const SHA_B = 'b'.repeat(40);
const SHA_C = 'c'.repeat(40);
const OID_A = '1'.repeat(40);
const OID_B = '2'.repeat(40);

function createTestPatch(/** @type {any} */ { writer, lamport }) {
  return { schema: 2, writer, lamport, ops: [], context: VersionVector.empty() };
}

function setupCommit(/** @type {Record<string, any>} */ commits, /** @type {Record<string, any>} */ blobs, /** @type {string} */ sha, /** @type {any} */ patch, /** @type {string} */ patchOid, /** @type {string[]} */ parents = []) {
  const message = encodePatchMessage({
    graph: 'events',
    writer: patch.writer,
    lamport: patch.lamport,
    patchOid,
    schema: 2,
  });
  commits[sha] = { message, parents };
  blobs[patchOid] = encode(patch);
}

function createMockPersistence(/** @type {Record<string, any>} */ commits = {}, /** @type {Record<string, any>} */ blobs = {}) {
  return {
    showNode: vi.fn(async (/** @type {any} */ sha) => {
      if (commits[sha]?.message) { return commits[sha].message; }
      throw new Error(`Commit not found: ${sha}`);
    }),
    getNodeInfo: vi.fn(async (/** @type {any} */ sha) => {
      if (commits[sha]) {
        return { sha, message: commits[sha].message, author: 'test', date: new Date().toISOString(), parents: commits[sha].parents || [] };
      }
      throw new Error(`Commit not found: ${sha}`);
    }),
    readBlob: vi.fn(async (/** @type {any} */ oid) => {
      if (blobs[oid]) { return blobs[oid]; }
      throw new Error(`Blob not found: ${oid}`);
    }),
  };
}

function createPatchJournal(/** @type {any} */ persistence) {
  return new CborPatchJournalAdapter({
    codec: new CborCodec(),
    blobPort: persistence,
    commitPort: persistence,
  });
}

function createMockLogger() {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(() => createMockLogger()),
  };
}

describe('B65 — Sync divergence logging', () => {
  it('logs E_SYNC_DIVERGENCE when a writer chain has forked', async () => {
    const commits = {};
    const blobs = {};

    // Two disconnected chains: SHA_A and SHA_B are not connected
    const patchA = createTestPatch({ writer: 'w1', lamport: 1 });
    const patchB = createTestPatch({ writer: 'w1', lamport: 2 });
    setupCommit(commits, blobs, SHA_A, patchA, OID_A, []);
    setupCommit(commits, blobs, SHA_B, patchB, OID_B, []); // No parent — diverged

    const persistence = createMockPersistence(commits, blobs);
    const logger = createMockLogger();

    // Remote (requester) claims SHA_A, local has SHA_B for same writer
    const request = { type: 'sync-request', frontier: { w1: SHA_A } };
    const localFrontier = new Map([['w1', SHA_B]]);

    const response = await processSyncRequest(
      /** @type {*} */ (request), localFrontier, /** @type {any} */ (persistence), 'events', { patchJournal: createPatchJournal(persistence), logger },
    );

    // Should return empty patches (diverged writer skipped)
    expect(response.patches).toHaveLength(0);

    // Logger should have been called with divergence context
    expect(logger.warn).toHaveBeenCalledTimes(1);
    const [message, context] = /** @type {any[]} */ (logger.warn.mock.calls[0]);
    expect(message).toContain('divergence');
    expect(context.code).toBe('E_SYNC_DIVERGENCE');
    expect(context.graphName).toBe('events');
    expect(context.writerId).toBe('w1');
    expect(context.localSha).toBe(SHA_B);
    expect(context.remoteSha).toBe(SHA_A);
  });

  it('does not log when no divergence occurs', async () => {
    const commits = {};
    const blobs = {};

    // Normal chain: SHA_A -> SHA_B
    const patchA = createTestPatch({ writer: 'w1', lamport: 1 });
    const patchB = createTestPatch({ writer: 'w1', lamport: 2 });
    setupCommit(commits, blobs, SHA_A, patchA, OID_A, []);
    setupCommit(commits, blobs, SHA_B, patchB, OID_B, [SHA_A]);

    const persistence = createMockPersistence(commits, blobs);
    const logger = createMockLogger();

    const request = { type: 'sync-request', frontier: { w1: SHA_A } };
    const localFrontier = new Map([['w1', SHA_B]]);

    const response = await processSyncRequest(
      /** @type {*} */ (request), localFrontier, /** @type {any} */ (persistence), 'events', { patchJournal: createPatchJournal(persistence), logger },
    );

    expect(response.patches).toHaveLength(1);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('works without a logger (backward compatible)', async () => {
    const commits = {};
    const blobs = {};

    const patchA = createTestPatch({ writer: 'w1', lamport: 1 });
    const patchB = createTestPatch({ writer: 'w1', lamport: 2 });
    setupCommit(commits, blobs, SHA_A, patchA, OID_A, []);
    setupCommit(commits, blobs, SHA_B, patchB, OID_B, []); // Diverged

    const persistence = createMockPersistence(commits, blobs);

    // No logger passed — should not throw
    const request = { type: 'sync-request', frontier: { w1: SHA_A } };
    const localFrontier = new Map([['w1', SHA_B]]);

    const response = await processSyncRequest(
      /** @type {*} */ (request), localFrontier, /** @type {any} */ (persistence), 'events', { patchJournal: createPatchJournal(persistence) },
    );

    expect(response.patches).toHaveLength(0);
  });

  it('still returns patches for non-diverged writers alongside diverged ones', async () => {
    const commits = {};
    const blobs = {};

    // w1 diverged, w2 is fine
    const patchW1 = createTestPatch({ writer: 'w1', lamport: 1 });
    const patchW2 = createTestPatch({ writer: 'w2', lamport: 1 });
    setupCommit(commits, blobs, SHA_A, patchW1, OID_A, []); // w1 diverged
    setupCommit(commits, blobs, SHA_C, patchW2, '7'.repeat(40), []);

    const persistence = createMockPersistence(commits, blobs);
    const logger = createMockLogger();

    // Requester has SHA_B for w1 (diverged) and doesn't have w2
    const request = { type: 'sync-request', frontier: { w1: SHA_B } };
    const localFrontier = new Map([['w1', SHA_A], ['w2', SHA_C]]);

    const response = await processSyncRequest(
      /** @type {*} */ (request), localFrontier, /** @type {any} */ (persistence), 'events', { patchJournal: createPatchJournal(persistence), logger },
    );

    // w1 skipped (diverged), w2 returned
    expect(response.patches).toHaveLength(1);
    expect(response.patches[0]?.writerId).toBe('w2');
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });
});

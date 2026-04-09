import { describe, it, expect, vi } from 'vitest';
import {
  loadPatchRange,
  computeSyncDelta,
  createSyncRequest,
  processSyncRequest,
  applySyncResponse,
  syncNeeded,
  createEmptySyncResponse,
} from '../../../../src/domain/services/sync/SyncProtocol.js';
import {
  createEmptyState,
  reduceV5 as _reduceV5,
} from '../../../../src/domain/services/JoinReducer.ts';
/** @type {(...args: any[]) => any} */
const reduceV5 = _reduceV5;
import { createFrontier } from '../../../../src/domain/services/Frontier.js';
import { createDot } from '../../../../src/domain/crdt/Dot.ts';
import ORSet from '../../../../src/domain/crdt/ORSet.ts';
import VersionVector from '../../../../src/domain/crdt/VersionVector.ts';
import { encodePatchMessage } from '../../../../src/domain/services/codec/WarpMessageCodec.js';
import { encode } from '../../../../src/infrastructure/codecs/CborCodec.js';
import { CborPatchJournalAdapter } from '../../../../src/infrastructure/adapters/CborPatchJournalAdapter.js';
import { CborCodec } from '../../../../src/infrastructure/codecs/CborCodec.js';

// -----------------------------------------------------------------------------
// Test Fixtures and Helpers
// -----------------------------------------------------------------------------

// Valid 40-character hex SHAs for testing
const SHA_A = 'a'.repeat(40);
const SHA_B = 'b'.repeat(40);
const SHA_C = 'c'.repeat(40);

// Valid 40-character hex OIDs for patch blobs
const OID_A = '1'.repeat(40);
const OID_B = '2'.repeat(40);
const OID_C = '3'.repeat(40);

/**
 * Creates a test patch with the given operations.
 */
/** @returns {any} */
function createTestPatch({ writer = /** @type {any} */ (undefined), lamport = /** @type {any} */ (undefined), ops = /** @type {any} */ (undefined), context = /** @type {any} */ (undefined) }) {
  return {
    schema: 2,
    writer,
    lamport,
    ops: ops || [],
    context: context || VersionVector.empty(),
  };
}

/**
 * Creates a NodeAdd operation.
 */
/** @param {any} node @param {any} dot */
function createNodeAddOp(node, dot) {
  return { type: 'NodeAdd', node, dot };
}

/**
 * Creates a mock persistence layer for testing.
 */
/** @returns {any} */
function createMockPersistence(commits = /** @type {any} */ ({}), blobs = /** @type {any} */ ({})) {
  return {
    showNode: vi.fn(async sha => {
      if (commits[sha]?.message) {
        return commits[sha].message;
      }
      throw new Error(`Commit not found: ${sha}`);
    }),

    getNodeInfo: vi.fn(async sha => {
      if (commits[sha]) {
        return {
          sha,
          message: commits[sha].message,
          author: 'test',
          date: new Date().toISOString(),
          parents: commits[sha].parents || [],
        };
      }
      throw new Error(`Commit not found: ${sha}`);
    }),

    readBlob: vi.fn(async oid => {
      if (blobs[oid]) {
        return blobs[oid];
      }
      throw new Error(`Blob not found: ${oid}`);
    }),
  };
}

/**
 * Creates a CborPatchJournalAdapter wired to the given mock persistence's blob ops.
 * @param {ReturnType<typeof createMockPersistence>} persistence
 * @returns {CborPatchJournalAdapter}
 */
function createPatchJournal(persistence) {
  return new CborPatchJournalAdapter({
    codec: new CborCodec(),
    blobPort: persistence,
    commitPort: persistence,
  });
}

/**
 * Creates a commit message and blob for a test patch.
 */
/** @param {any} commits @param {any} blobs @param {any} sha @param {any} patch @param {any} patchOid @param {any[]} parents */
function setupCommit(commits, blobs, sha, patch, patchOid, parents = []) {
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

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

describe('SyncProtocol', () => {
  describe('computeSyncDelta', () => {
    it('identifies new writers for local', () => {
      const local = new Map([['w1', SHA_A]]);
      const remote = new Map([
        ['w1', SHA_A],
        ['w2', SHA_B],
      ]);

      const delta = computeSyncDelta(local, remote);

      expect(delta.newWritersForLocal).toEqual(['w2']);
      expect(delta.needFromRemote.get('w2')).toEqual({ from: null, to: SHA_B });
    });

    it('identifies new writers for remote', () => {
      const local = new Map([
        ['w1', SHA_A],
        ['w2', SHA_B],
      ]);
      const remote = new Map([['w1', SHA_A]]);

      const delta = computeSyncDelta(local, remote);

      expect(delta.newWritersForRemote).toEqual(['w2']);
      expect(delta.needFromLocal.get('w2')).toEqual({ from: null, to: SHA_B });
    });

    it('identifies missing patches when heads differ', () => {
      const local = new Map([['w1', SHA_A]]);
      const remote = new Map([['w1', SHA_C]]);

      const delta = computeSyncDelta(local, remote);

      expect(delta.needFromRemote.get('w1')).toEqual({ from: SHA_A, to: SHA_C });
    });

    it('returns empty when frontiers match', () => {
      const local = new Map([
        ['w1', SHA_A],
        ['w2', SHA_B],
      ]);
      const remote = new Map([
        ['w1', SHA_A],
        ['w2', SHA_B],
      ]);

      const delta = computeSyncDelta(local, remote);

      expect(delta.needFromRemote.size).toBe(0);
      expect(delta.needFromLocal.size).toBe(0);
      expect(delta.newWritersForLocal).toEqual([]);
      expect(delta.newWritersForRemote).toEqual([]);
    });

    it('handles empty frontiers', () => {
      const local = new Map();
      const remote = new Map([['w1', SHA_A]]);

      const delta = computeSyncDelta(local, remote);

      expect(delta.needFromRemote.get('w1')).toEqual({ from: null, to: SHA_A });
      expect(delta.newWritersForLocal).toEqual(['w1']);
    });

    it('handles both sides having new writers', () => {
      const local = new Map([['w1', SHA_A]]);
      const remote = new Map([['w2', SHA_B]]);

      const delta = computeSyncDelta(local, remote);

      expect(delta.needFromRemote.get('w2')).toEqual({ from: null, to: SHA_B });
      expect(delta.needFromLocal.get('w1')).toEqual({ from: null, to: SHA_A });
      expect(delta.newWritersForLocal).toEqual(['w2']);
      expect(delta.newWritersForRemote).toEqual(['w1']);
    });
  });

  describe('loadPatchRange', () => {
    it('returns patches in chronological order', async () => {
      const commits = {};
      const blobs = {};

      // Create chain: SHA_A -> SHA_B -> SHA_C
      const patchA = createTestPatch({ writer: 'w1', lamport: 1, ops: [] });
      const patchB = createTestPatch({ writer: 'w1', lamport: 2, ops: [] });
      const patchC = createTestPatch({ writer: 'w1', lamport: 3, ops: [] });

      setupCommit(commits, blobs, SHA_A, patchA, OID_A, []);
      setupCommit(commits, blobs, SHA_B, patchB, OID_B, [SHA_A]);
      setupCommit(commits, blobs, SHA_C, patchC, OID_C, [SHA_B]);

      const persistence = createMockPersistence(commits, blobs);

      // Load from SHA_A (exclusive) to SHA_C (inclusive)
      const patches = await loadPatchRange(persistence, 'events', 'w1', SHA_A, SHA_C, { patchJournal: createPatchJournal(persistence) });

      expect(patches).toHaveLength(2);
      expect(/** @type {any} */ (patches)[0].sha).toBe(SHA_B);
      expect(/** @type {any} */ (patches)[0].patch.lamport).toBe(2);
      expect(/** @type {any} */ (patches)[1].sha).toBe(SHA_C);
      expect(/** @type {any} */ (patches)[1].patch.lamport).toBe(3);
    });

    it('returns all patches when fromSha is null', async () => {
      const commits = {};
      const blobs = {};

      // Create chain: SHA_A -> SHA_B
      const patchA = createTestPatch({ writer: 'w1', lamport: 1, ops: [] });
      const patchB = createTestPatch({ writer: 'w1', lamport: 2, ops: [] });

      setupCommit(commits, blobs, SHA_A, patchA, OID_A, []);
      setupCommit(commits, blobs, SHA_B, patchB, OID_B, [SHA_A]);

      const persistence = createMockPersistence(commits, blobs);

      const patches = await loadPatchRange(persistence, 'events', 'w1', null, SHA_B, { patchJournal: createPatchJournal(persistence) });

      expect(patches).toHaveLength(2);
      expect(/** @type {any} */ (patches)[0].sha).toBe(SHA_A);
      expect(/** @type {any} */ (patches)[1].sha).toBe(SHA_B);
    });

    it('detects divergence when fromSha is not an ancestor', async () => {
      const commits = {};
      const blobs = {};

      // Create two separate chains that don't connect
      const patchA = createTestPatch({ writer: 'w1', lamport: 1, ops: [] });
      const patchB = createTestPatch({ writer: 'w1', lamport: 2, ops: [] });

      setupCommit(commits, blobs, SHA_A, patchA, OID_A, []);
      setupCommit(commits, blobs, SHA_B, patchB, OID_B, []); // No parent - diverged

      const persistence = createMockPersistence(commits, blobs);

      await expect(loadPatchRange(persistence, 'events', 'w1', SHA_A, SHA_B, { patchJournal: createPatchJournal(persistence) })).rejects.toThrow(
        /Divergence detected/
      );
    });

    it('returns single patch when fromSha is direct parent', async () => {
      const commits = {};
      const blobs = {};

      const patchA = createTestPatch({ writer: 'w1', lamport: 1, ops: [] });
      const patchB = createTestPatch({ writer: 'w1', lamport: 2, ops: [] });

      setupCommit(commits, blobs, SHA_A, patchA, OID_A, []);
      setupCommit(commits, blobs, SHA_B, patchB, OID_B, [SHA_A]);

      const persistence = createMockPersistence(commits, blobs);

      const patches = await loadPatchRange(persistence, 'events', 'w1', SHA_A, SHA_B, { patchJournal: createPatchJournal(persistence) });

      expect(patches).toHaveLength(1);
      expect(/** @type {any} */ (patches)[0].sha).toBe(SHA_B);
    });
  });

  describe('createSyncRequest', () => {
    it('creates request with frontier as plain object', () => {
      const frontier = new Map([
        ['w1', SHA_A],
        ['w2', SHA_B],
      ]);

      const request = createSyncRequest(frontier);

      expect(request.type).toBe('sync-request');
      expect(request.frontier).toEqual({
        w1: SHA_A,
        w2: SHA_B,
      });
    });

    it('handles empty frontier', () => {
      const frontier = new Map();

      const request = createSyncRequest(frontier);

      expect(request.type).toBe('sync-request');
      expect(request.frontier).toEqual({});
    });
  });

  describe('processSyncRequest', () => {
    it('returns patches the requester needs', async () => {
      const commits = {};
      const blobs = {};

      // Local has SHA_B, remote (requester) has SHA_A
      const patchA = createTestPatch({
        writer: 'w1',
        lamport: 1,
        ops: [createNodeAddOp('x', createDot('w1', 1))],
      });
      const patchB = createTestPatch({
        writer: 'w1',
        lamport: 2,
        ops: [createNodeAddOp('y', createDot('w1', 2))],
      });

      setupCommit(commits, blobs, SHA_A, patchA, OID_A, []);
      setupCommit(commits, blobs, SHA_B, patchB, OID_B, [SHA_A]);

      const persistence = createMockPersistence(commits, blobs);

      const request = { type: 'sync-request', frontier: { w1: SHA_A } };
      const localFrontier = new Map([['w1', SHA_B]]);

      const response = await processSyncRequest(/** @type {any} */ (request), localFrontier, persistence, 'events', { patchJournal: createPatchJournal(persistence) });

      expect(response.type).toBe('sync-response');
      expect(response.patches).toHaveLength(1);
      expect(/** @type {any} */ (response.patches)[0].sha).toBe(SHA_B);
      expect(/** @type {any} */ (response.patches)[0].writerId).toBe('w1');
    });

    it('includes local frontier in response', async () => {
      const commits = {};
      const blobs = {};

      // Setup both writers' commits so they exist
      const patchA = createTestPatch({ writer: 'w1', lamport: 1, ops: [] });
      const patchB = createTestPatch({ writer: 'w2', lamport: 1, ops: [] });
      setupCommit(commits, blobs, SHA_A, patchA, OID_A, []);
      setupCommit(commits, blobs, SHA_B, patchB, OID_B, []);

      const persistence = createMockPersistence(commits, blobs);

      // Requester only knows about w1
      const request = { type: 'sync-request', frontier: { w1: SHA_A } };
      // Local has both w1 and w2
      const localFrontier = new Map([
        ['w1', SHA_A],
        ['w2', SHA_B],
      ]);

      const response = await processSyncRequest(/** @type {any} */ (request), localFrontier, persistence, 'events', { patchJournal: createPatchJournal(persistence) });

      // Response should include complete local frontier
      expect(response.frontier).toEqual({
        w1: SHA_A,
        w2: SHA_B,
      });
      // And should include patch from w2 that requester is missing
      expect(response.patches).toHaveLength(1);
      expect(/** @type {any} */ (response.patches)[0].writerId).toBe('w2');
    });

    it('returns empty patches when already in sync', async () => {
      const persistence = createMockPersistence({}, {});

      const request = { type: 'sync-request', frontier: { w1: SHA_A } };
      const localFrontier = new Map([['w1', SHA_A]]);

      const response = await processSyncRequest(/** @type {any} */ (request), localFrontier, persistence, 'events', { patchJournal: createPatchJournal(persistence) });

      expect(response.patches).toHaveLength(0);
    });
  });

  describe('applySyncResponse', () => {
    it('applies patches to state', () => {
      const state = createEmptyState();
      const frontier = createFrontier();

      const patch1 = createTestPatch({
        writer: 'w1',
        lamport: 1,
        ops: [createNodeAddOp('x', createDot('w1', 1))],
      });

      const response = {
        type: 'sync-response',
        frontier: { w1: SHA_A },
        patches: [{ writerId: 'w1', sha: SHA_A, patch: patch1 }],
      };

      const result = /** @type {any} */ (applySyncResponse(/** @type {any} */ (response), state, frontier));

      expect(result.applied).toBe(1);
      expect(result.state.nodeAlive.contains('x')).toBe(true);
      expect(result.frontier.get('w1')).toBe(SHA_A);
    });

    it('applies multiple patches in order', () => {
      const state = createEmptyState();
      const frontier = createFrontier();

      const patch1 = createTestPatch({
        writer: 'w1',
        lamport: 1,
        ops: [createNodeAddOp('x', createDot('w1', 1))],
      });

      const patch2 = createTestPatch({
        writer: 'w1',
        lamport: 2,
        ops: [createNodeAddOp('y', createDot('w1', 2))],
      });

      const response = {
        type: 'sync-response',
        frontier: { w1: SHA_B },
        patches: [
          { writerId: 'w1', sha: SHA_A, patch: patch1 },
          { writerId: 'w1', sha: SHA_B, patch: patch2 },
        ],
      };

      const result = /** @type {any} */ (applySyncResponse(/** @type {any} */ (response), state, frontier));

      expect(result.applied).toBe(2);
      expect(result.state.nodeAlive.contains('x')).toBe(true);
      expect(result.state.nodeAlive.contains('y')).toBe(true);
      expect(result.frontier.get('w1')).toBe(SHA_B);
    });

    it('does not mutate input state', () => {
      const state = createEmptyState();
      const frontier = createFrontier();

      const patch = createTestPatch({
        writer: 'w1',
        lamport: 1,
        ops: [createNodeAddOp('x', createDot('w1', 1))],
      });

      const response = {
        type: 'sync-response',
        frontier: { w1: SHA_A },
        patches: [{ writerId: 'w1', sha: SHA_A, patch }],
      };

      applySyncResponse(/** @type {any} */ (response), state, frontier);

      // Original state should be unchanged
      expect(state.nodeAlive.contains('x')).toBe(false);
      expect(frontier.has('w1')).toBe(false);
    });

    it('handles patches from multiple writers', () => {
      const state = createEmptyState();
      const frontier = createFrontier();

      const patchW1 = createTestPatch({
        writer: 'w1',
        lamport: 1,
        ops: [createNodeAddOp('x', createDot('w1', 1))],
      });

      const patchW2 = createTestPatch({
        writer: 'w2',
        lamport: 1,
        ops: [createNodeAddOp('y', createDot('w2', 1))],
      });

      const response = {
        type: 'sync-response',
        frontier: { w1: SHA_A, w2: SHA_B },
        patches: [
          { writerId: 'w1', sha: SHA_A, patch: patchW1 },
          { writerId: 'w2', sha: SHA_B, patch: patchW2 },
        ],
      };

      const result = /** @type {any} */ (applySyncResponse(/** @type {any} */ (response), state, frontier));

      expect(result.applied).toBe(2);
      expect(result.state.nodeAlive.contains('x')).toBe(true);
      expect(result.state.nodeAlive.contains('y')).toBe(true);
      expect(result.frontier.get('w1')).toBe(SHA_A);
      expect(result.frontier.get('w2')).toBe(SHA_B);
    });

    it('returns zero applied for empty response', () => {
      const state = createEmptyState();
      const frontier = createFrontier();

      const response = {
        type: 'sync-response',
        frontier: {},
        patches: [],
      };

      const result = /** @type {any} */ (applySyncResponse(/** @type {any} */ (response), state, frontier));

      expect(result.applied).toBe(0);
    });
  });

  describe('syncNeeded', () => {
    it('returns false when frontiers match', () => {
      const local = new Map([
        ['w1', SHA_A],
        ['w2', SHA_B],
      ]);
      const remote = new Map([
        ['w1', SHA_A],
        ['w2', SHA_B],
      ]);

      expect(syncNeeded(local, remote)).toBe(false);
    });

    it('returns true when frontiers have different sizes', () => {
      const local = new Map([['w1', SHA_A]]);
      const remote = new Map([
        ['w1', SHA_A],
        ['w2', SHA_B],
      ]);

      expect(syncNeeded(local, remote)).toBe(true);
    });

    it('returns true when heads differ', () => {
      const local = new Map([['w1', SHA_A]]);
      const remote = new Map([['w1', SHA_B]]);

      expect(syncNeeded(local, remote)).toBe(true);
    });

    it('returns false for empty frontiers', () => {
      const local = new Map();
      const remote = new Map();

      expect(syncNeeded(local, remote)).toBe(false);
    });
  });

  describe('createEmptySyncResponse', () => {
    it('creates response with empty patches array', () => {
      const frontier = new Map([['w1', SHA_A]]);

      const response = createEmptySyncResponse(frontier);

      expect(response.type).toBe('sync-response');
      expect(response.patches).toEqual([]);
      expect(response.frontier).toEqual({ w1: SHA_A });
    });
  });

  describe('full sync integration', () => {
    it('produces identical state on both sides after sync', async () => {
      const commits = {};
      const blobs = {};

      // Node A has patches from w1
      const patchA1 = createTestPatch({
        writer: 'w1',
        lamport: 1,
        ops: [createNodeAddOp('x', createDot('w1', 1))],
      });
      const patchA2 = createTestPatch({
        writer: 'w1',
        lamport: 2,
        ops: [createNodeAddOp('y', createDot('w1', 2))],
      });

      // Node B has patches from w2
      const patchB1 = createTestPatch({
        writer: 'w2',
        lamport: 1,
        ops: [createNodeAddOp('nodeA', createDot('w2', 1))],
      });

      // Setup commits and blobs
      setupCommit(commits, blobs, SHA_A, patchA1, OID_A, []);
      setupCommit(commits, blobs, SHA_B, patchA2, OID_B, [SHA_A]);
      setupCommit(commits, blobs, SHA_C, patchB1, OID_C, []);

      const persistence = createMockPersistence(commits, blobs);

      // Node A state and frontier
      let stateA = reduceV5([
        { patch: patchA1, sha: SHA_A },
        { patch: patchA2, sha: SHA_B },
      ]);
      let frontierA = new Map([['w1', SHA_B]]);

      // Node B state and frontier
      let stateB = reduceV5([{ patch: patchB1, sha: SHA_C }]);
      let frontierB = new Map([['w2', SHA_C]]);

      // B requests sync from A
      const requestB = createSyncRequest(frontierB);
      const responseA = await processSyncRequest(requestB, frontierA, persistence, 'events', { patchJournal: createPatchJournal(persistence) });

      // B applies response from A
      const resultB = /** @type {any} */ (applySyncResponse(responseA, stateB, frontierB));
      stateB = resultB.state;
      frontierB = resultB.frontier;

      // A requests sync from B
      const requestA = createSyncRequest(frontierA);
      const responseB = await processSyncRequest(requestA, frontierB, persistence, 'events', { patchJournal: createPatchJournal(persistence) });

      // A applies response from B
      const resultA = /** @type {any} */ (applySyncResponse(responseB, stateA, frontierA));
      stateA = resultA.state;
      frontierA = resultA.frontier;

      // Both should now have all nodes
      expect(stateA.nodeAlive.contains('x')).toBe(true);
      expect(stateA.nodeAlive.contains('y')).toBe(true);
      expect(stateA.nodeAlive.contains('nodeA')).toBe(true);

      expect(stateB.nodeAlive.contains('x')).toBe(true);
      expect(stateB.nodeAlive.contains('y')).toBe(true);
      expect(stateB.nodeAlive.contains('nodeA')).toBe(true);

      // Frontiers should match
      expect(frontierA.get('w1')).toBe(SHA_B);
      expect(frontierA.get('w2')).toBe(SHA_C);
      expect(frontierB.get('w1')).toBe(SHA_B);
      expect(frontierB.get('w2')).toBe(SHA_C);
    });

    it('sync is idempotent - applying same patches twice has no effect', async () => {
      const commits = {};
      const blobs = {};

      const patch = createTestPatch({
        writer: 'w1',
        lamport: 1,
        ops: [createNodeAddOp('x', createDot('w1', 1))],
      });

      setupCommit(commits, blobs, SHA_A, patch, OID_A, []);

      const persistence = createMockPersistence(commits, blobs);

      // Start with empty state
      const state = createEmptyState();
      const frontier = createFrontier();

      // First sync
      const request1 = createSyncRequest(frontier);
      const response1 = await processSyncRequest(
        request1,
        new Map([['w1', SHA_A]]),
        persistence,
        'events',
        { patchJournal: createPatchJournal(persistence) },
      );
      const result1 = /** @type {any} */ (applySyncResponse(response1, state, frontier));

      // Second sync with same data
      const response2 = {
        type: 'sync-response',
        frontier: { w1: SHA_A },
        patches: [{ writerId: 'w1', sha: SHA_A, patch }],
      };
      const result2 = /** @type {any} */ (applySyncResponse(/** @type {any} */ (response2), result1.state, result1.frontier));

      // State should be the same (idempotent)
      // Note: Due to OR-Set semantics, applying the same add twice adds a new dot
      // but the element is still present (this is correct OR-Set behavior)
      expect(result1.state.nodeAlive.contains('x')).toBe(true);
      expect(result2.state.nodeAlive.contains('x')).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // B106 — Unknown op type rejection
  // ---------------------------------------------------------------------------
  describe('applySyncResponse — unknown op validation (B106)', () => {
    it('throws SchemaUnsupportedError when patch contains unknown op type', () => {
      const patch = createTestPatch({
        writer: 'alice',
        lamport: 1,
        ops: [
          { type: 'NodeAdd', node: 'n1', dot: createDot('alice', 1) },
          { type: 'FutureOp', node: 'n2' }, // unknown op
        ],
        context: VersionVector.empty(),
      });

      const response = {
        type: /** @type {'sync-response'} */ ('sync-response'),
        frontier: { alice: SHA_A },
        patches: [{ writerId: 'alice', sha: SHA_A, patch }],
      };

      const state = createEmptyState();
      const frontier = createFrontier();

      expect(() => applySyncResponse(response, state, frontier)).toThrow(/unknown op type.*FutureOp/i);
    });

    it('allows patches with only known op types', () => {
      const patch = createTestPatch({
        writer: 'alice',
        lamport: 1,
        ops: [
          { type: 'NodeAdd', node: 'n1', dot: createDot('alice', 1) },
        ],
        context: VersionVector.empty(),
      });

      const response = {
        type: /** @type {'sync-response'} */ ('sync-response'),
        frontier: { alice: SHA_A },
        patches: [{ writerId: 'alice', sha: SHA_A, patch }],
      };

      const state = createEmptyState();
      const frontier = createFrontier();

      const result = /** @type {any} */ (applySyncResponse(response, state, frontier));
      expect(result.applied).toBe(1);
      expect(result.state.nodeAlive.contains('n1')).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // B107 — isAncestor pre-check in processSyncRequest
  // ---------------------------------------------------------------------------
  describe('processSyncRequest — isAncestor pre-check (B107)', () => {
    it('skips diverged writer via isAncestor without chain walk', async () => {
      const commits = {};
      const blobs = {};

      // Normal chain for w2: SHA_C
      const patchW2 = createTestPatch({ writer: 'w2', lamport: 1 });
      setupCommit(commits, blobs, SHA_C, patchW2, OID_C, []);

      const persistence = createMockPersistence(commits, blobs);
      // Add isAncestor: SHA_A is NOT an ancestor of SHA_B (diverged)
      persistence.isAncestor = vi.fn().mockImplementation(async (/** @type {string} */ pot, /** @type {string} */ desc) => {
        if (pot === SHA_A && desc === SHA_B) { return false; }
        return true;
      });

      const logger = {
        debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(),
        child: vi.fn(),
      };

      // Requester has SHA_A for w1, local has SHA_B — diverged
      const request = { type: 'sync-request', frontier: { w1: SHA_A } };
      const localFrontier = new Map([['w1', SHA_B], ['w2', SHA_C]]);

      const response = /** @type {any} */ (await processSyncRequest(
        /** @type {*} */ (request),
        localFrontier,
        /** @type {any} */ (persistence),
        'events',
        { logger, patchJournal: createPatchJournal(persistence) },
      ));

      // w1 should be skipped via isAncestor, no chain walk needed
      expect(persistence.isAncestor).toHaveBeenCalledWith(SHA_A, SHA_B);
      // getNodeInfo should NOT have been called for w1 (no chain walk)
      const nodeInfoCalls = persistence.getNodeInfo.mock.calls.map((/** @type {any} */ c) => c[0]);
      expect(nodeInfoCalls).not.toContain(SHA_B);

      // w2 patches should still be returned (new writer for requester)
      expect(response.patches.some((/** @type {any} */ p) => p.writerId === 'w2')).toBe(true);

      // skippedWriters should contain w1
      expect(response.skippedWriters).toContainEqual(expect.objectContaining({
        writerId: 'w1',
        reason: 'E_SYNC_DIVERGENCE',
      }));

      // Logger should have warned
      expect(logger.warn).toHaveBeenCalled();
    });

    it('proceeds with chain walk when isAncestor returns true', async () => {
      const commits = {};
      const blobs = {};

      // Normal chain: SHA_A -> SHA_B
      const patchA = createTestPatch({ writer: 'w1', lamport: 1 });
      const patchB = createTestPatch({ writer: 'w1', lamport: 2 });
      setupCommit(commits, blobs, SHA_A, patchA, OID_A, []);
      setupCommit(commits, blobs, SHA_B, patchB, OID_B, [SHA_A]);

      const persistence = createMockPersistence(commits, blobs);
      persistence.isAncestor = vi.fn().mockResolvedValue(true);

      const request = { type: 'sync-request', frontier: { w1: SHA_A } };
      const localFrontier = new Map([['w1', SHA_B]]);

      const response = /** @type {any} */ (await processSyncRequest(
        /** @type {*} */ (request),
        localFrontier,
        /** @type {any} */ (persistence),
        'events',
        { patchJournal: createPatchJournal(persistence) },
      ));

      expect(persistence.isAncestor).toHaveBeenCalledWith(SHA_A, SHA_B);
      expect(response.patches).toHaveLength(1);
      expect(response.patches[0].sha).toBe(SHA_B);
    });

    it('falls back to chain walk when isAncestor is not available', async () => {
      const commits = {};
      const blobs = {};

      const patchA = createTestPatch({ writer: 'w1', lamport: 1 });
      const patchB = createTestPatch({ writer: 'w1', lamport: 2 });
      setupCommit(commits, blobs, SHA_A, patchA, OID_A, []);
      setupCommit(commits, blobs, SHA_B, patchB, OID_B, [SHA_A]);

      // No isAncestor on persistence
      const persistence = createMockPersistence(commits, blobs);

      const request = { type: 'sync-request', frontier: { w1: SHA_A } };
      const localFrontier = new Map([['w1', SHA_B]]);

      const response = /** @type {any} */ (await processSyncRequest(
        /** @type {*} */ (request),
        localFrontier,
        /** @type {any} */ (persistence),
        'events',
        { patchJournal: createPatchJournal(persistence) },
      ));

      // Should still work via chain walk
      expect(response.patches).toHaveLength(1);
      expect(response.patches[0].sha).toBe(SHA_B);
    });
  });
});

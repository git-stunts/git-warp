/**
 * Phase 4 — Invariant 5: SyncProtocol state-coherence tests.
 *
 * Tests 18–21 verify CRDT properties (idempotency, commutativity,
 * monotonic frontier) and divergence observability at the sync layer.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  applySyncResponse,
  processSyncRequest,
} from '../../../../src/domain/services/sync/SyncProtocol.js';
import {
  createEmptyState,
} from '../../../../src/domain/services/JoinReducer.ts';
import { createFrontier, updateFrontier } from '../../../../src/domain/services/Frontier.js';
// createDot reserved for future test expansion
// import { Dot } from '../../../../src/domain/crdt/Dot.ts';
import ORSet from '../../../../src/domain/crdt/ORSet.ts';
import { encodePatchMessage } from '../../../../src/domain/services/codec/WarpMessageCodec.js';
import { encode } from '../../../../src/infrastructure/codecs/CborCodec.js';
import VersionVector from '../../../../src/domain/crdt/VersionVector.ts';
import { CborPatchJournalAdapter } from '../../../../src/infrastructure/adapters/CborPatchJournalAdapter.js';
import { CborCodec } from '../../../../src/infrastructure/codecs/CborCodec.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SHA_A = 'a'.repeat(40);
const SHA_B = 'b'.repeat(40);
const SHA_C = 'c'.repeat(40);
const SHA_D = 'd'.repeat(40);

/**
 * Shorthand: build a patch object inline.
 * Context is a plain object (SyncProtocol normalizes it to a Map).
 */
function mkPatch(/** @type {any} */ { writer, lamport, ops, context }) {
  return {
    schema: 2,
    writer,
    lamport,
    ops: ops || [],
    context: context || {},
  };
}

/**
 * Wraps a patch into a sync-response envelope.
 */
function mkResponse(/** @type {any} */ frontier, /** @type {any} */ patches) {
  return {
    type: /** @type {'sync-response'} */ ('sync-response'),
    frontier,
    patches,
  };
}

/**
 * Collects the structural signature of a WarpState for equivalence checks:
 * sorted alive-node set, sorted alive-edge set, sorted prop entries.
 */
function stateSignature(/** @type {any} */ state) {
  const nodes = state.nodeAlive.elements().sort();
  const edges = state.edgeAlive.elements().sort();
  const props = [...state.prop.entries()]
    .map(([k, reg]) => [k, reg.value])
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return { nodes, edges, props };
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SyncProtocol — state coherence (Phase 4, Invariant 5)', () => {
  // -----------------------------------------------------------------------
  // Test 18 — Idempotency
  // -----------------------------------------------------------------------
  it('T18: applying the same sync response twice is idempotent', () => {
    const patch = mkPatch({
      writer: 'alice',
      lamport: 1,
      context: { alice: 1 },
      ops: [
        { type: 'NodeAdd', node: 'n1', dot: { writerId: 'alice', counter: 1 } },
      ],
    });

    const response = mkResponse(
      { alice: SHA_A },
      [{ writerId: 'alice', sha: SHA_A, patch }],
    );

    const state0 = createEmptyState();
    const frontier0 = createFrontier();

    // First application
    const r1 = /** @type {any} */ (applySyncResponse(/** @type {*} */ (response), state0, frontier0));

    // Second application (same response into already-updated state)
    const r2 = /** @type {any} */ (applySyncResponse(/** @type {*} */ (response), r1.state, r1.frontier));

    // Structural equivalence: alive nodes, edges, props must match
    const sig1 = stateSignature(r1.state);
    const sig2 = stateSignature(r2.state);
    expect(sig2.nodes).toEqual(sig1.nodes);
    expect(sig2.edges).toEqual(sig1.edges);
    expect(sig2.props).toEqual(sig1.props);

    // Frontier should remain the same
    expect(r2.frontier.get('alice')).toBe(SHA_A);
  });

  // -----------------------------------------------------------------------
  // Test 19 — Commutativity
  // -----------------------------------------------------------------------
  it('T19: patches A and B applied in both orders produce equivalent state', () => {
    const patchA = mkPatch({
      writer: 'alice',
      lamport: 1,
      context: { alice: 1 },
      ops: [
        { type: 'NodeAdd', node: 'n1', dot: { writerId: 'alice', counter: 1 } },
      ],
    });

    const patchB = mkPatch({
      writer: 'bob',
      lamport: 1,
      context: { bob: 1 },
      ops: [
        { type: 'NodeAdd', node: 'n2', dot: { writerId: 'bob', counter: 1 } },
      ],
    });

    const responseAB = mkResponse(
      { alice: SHA_A, bob: SHA_B },
      [
        { writerId: 'alice', sha: SHA_A, patch: patchA },
        { writerId: 'bob', sha: SHA_B, patch: patchB },
      ],
    );

    const responseBA = mkResponse(
      { bob: SHA_B, alice: SHA_A },
      [
        { writerId: 'bob', sha: SHA_B, patch: patchB },
        { writerId: 'alice', sha: SHA_A, patch: patchA },
      ],
    );

    // Apply A then B
    const state0 = createEmptyState();
    const frontier0 = createFrontier();
    const rAB = /** @type {any} */ (applySyncResponse(/** @type {*} */ (responseAB), state0, frontier0));

    // Apply B then A (fresh start)
    const state1 = createEmptyState();
    const frontier1 = createFrontier();
    const rBA = /** @type {any} */ (applySyncResponse(/** @type {*} */ (responseBA), state1, frontier1));

    const sigAB = stateSignature(rAB.state);
    const sigBA = stateSignature(rBA.state);

    expect(sigAB.nodes).toEqual(sigBA.nodes);
    expect(sigAB.edges).toEqual(sigBA.edges);
    expect(sigAB.props).toEqual(sigBA.props);
  });

  // -----------------------------------------------------------------------
  // Test 20 — Monotonic frontier
  // -----------------------------------------------------------------------
  it('T20: after sync, no writer frontier entry goes backwards', () => {
    // Pre-existing frontier with known entries
    const frontier = createFrontier();
    updateFrontier(frontier, 'alice', SHA_A);
    updateFrontier(frontier, 'bob', SHA_B);

    // Simulate a response that advances alice and introduces carol
    const patch = mkPatch({
      writer: 'alice',
      lamport: 2,
      context: { alice: 2 },
      ops: [
        { type: 'NodeAdd', node: 'n3', dot: { writerId: 'alice', counter: 2 } },
      ],
    });

    const patchCarol = mkPatch({
      writer: 'carol',
      lamport: 1,
      context: { carol: 1 },
      ops: [
        { type: 'NodeAdd', node: 'n4', dot: { writerId: 'carol', counter: 1 } },
      ],
    });

    const response = mkResponse(
      { alice: SHA_C, bob: SHA_B, carol: SHA_D },
      [
        { writerId: 'alice', sha: SHA_C, patch },
        { writerId: 'carol', sha: SHA_D, patch: patchCarol },
      ],
    );

    const state = createEmptyState();
    const result = /** @type {any} */ (applySyncResponse(/** @type {*} */ (response), state, frontier));

    // Every writer present in the original frontier must still be present
    // and their entry must be >= the original value (i.e. not reverted).
    for (const [writerId] of frontier) {
      const newSha = result.frontier.get(writerId);
      expect(newSha).toBeDefined();
      // At minimum the entry must not have vanished
      expect(typeof newSha).toBe('string');
    }

    // alice must have advanced (or stayed the same) — specifically SHA_C
    expect(result.frontier.get('alice')).toBe(SHA_C);
    // bob was not in the response patches, so the frontier for bob should
    // remain at its original value (applySyncResponse clones, doesn't drop)
    expect(result.frontier.get('bob')).toBe(SHA_B);
    // carol is new
    expect(result.frontier.get('carol')).toBe(SHA_D);
  });

  // -----------------------------------------------------------------------
  // Test 21 — Divergence is observable
  // -----------------------------------------------------------------------
  it('T21: processSyncRequest surfaces skippedWriters on divergence', async () => {
    /** @type {Record<string, any>} */
    const commits = {};
    /** @type {Record<string, any>} */
    const blobs = {};

    // Two disconnected chains for writer w1 — no parent link
    const patchA = { schema: 2, writer: 'w1', lamport: 1, ops: [], context: VersionVector.empty() };
    const patchB = { schema: 2, writer: 'w1', lamport: 2, ops: [], context: VersionVector.empty() };

    const OID_A = '1'.repeat(40);
    const OID_B = '2'.repeat(40);

    const msgA = encodePatchMessage({ graph: 'events', writer: 'w1', lamport: 1, patchOid: OID_A, schema: 2 });
    const msgB = encodePatchMessage({ graph: 'events', writer: 'w1', lamport: 2, patchOid: OID_B, schema: 2 });

    commits[SHA_A] = { message: msgA, parents: [] };
    blobs[OID_A] = encode(patchA);

    commits[SHA_B] = { message: msgB, parents: [] }; // No parent — diverged from SHA_A
    blobs[OID_B] = encode(patchB);

    const persistence = {
      showNode: vi.fn(async (/** @type {any} */ sha) => {
        if (commits[sha]?.message) { return commits[sha].message; }
        throw new Error(`Commit not found: ${sha}`);
      }),
      getNodeInfo: vi.fn(async (/** @type {any} */ sha) => {
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
      readBlob: vi.fn(async (/** @type {any} */ oid) => {
        if (blobs[oid]) { return blobs[oid]; }
        throw new Error(`Blob not found: ${oid}`);
      }),
    };

    const logger = createMockLogger();

    // Remote (requester) has SHA_A, local has SHA_B — chains are disjoint
    const request = { type: 'sync-request', frontier: { w1: SHA_A } };
    const localFrontier = new Map([['w1', SHA_B]]);

    const response = /** @type {any} */ (await processSyncRequest(
      /** @type {*} */ (request),
      localFrontier,
      /** @type {any} */ (persistence),
      'events',
      { patchJournal: createPatchJournal(persistence), logger },
    ));

    // Patches for diverged writer should be empty
    expect(response.patches).toHaveLength(0);

    // skippedWriters must expose the diverged writer
    expect(response.skippedWriters).toBeDefined();
    expect(response.skippedWriters.length).toBeGreaterThanOrEqual(1);

    const skipped = response.skippedWriters.find((/** @type {any} */ s) => s.writerId === 'w1');
    expect(skipped).toBeDefined();
    expect(skipped.reason).toBe('E_SYNC_DIVERGENCE');

    // Logger.warn must have been called
    expect(logger.warn).toHaveBeenCalled();
    const [warnMsg, warnCtx] = logger.warn.mock.calls[0] ?? [];
    expect(warnMsg).toContain('divergence');
    expect(warnCtx.code).toBe('E_SYNC_DIVERGENCE');
    expect(warnCtx.writerId).toBe('w1');
  });
});

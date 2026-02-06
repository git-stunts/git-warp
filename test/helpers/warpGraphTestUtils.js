/**
 * Shared test utilities for WarpGraph tests.
 *
 * This module provides commonly used helpers for creating mock patches,
 * persistence adapters, and test data. Import these instead of duplicating
 * them in individual test files.
 */
import { vi } from 'vitest';
import { encode } from '../../src/infrastructure/codecs/CborCodec.js';
import { encodePatchMessage } from '../../src/domain/services/WarpMessageCodec.js';
import { createVersionVector } from '../../src/domain/crdt/VersionVector.js';
import { createDot } from '../../src/domain/crdt/Dot.js';
import { createInlineValue } from '../../src/domain/types/WarpTypes.js';

// ============================================================================
// OID and Hash Generators
// ============================================================================

/**
 * Creates a fresh OID generator with its own counter.
 * Use this in beforeEach to avoid parallel test interference.
 *
 * @returns {{ next: () => string, reset: () => void }}
 *
 * @example
 * let oidGen;
 * beforeEach(() => {
 *   oidGen = createOidGenerator();
 * });
 * const sha1 = oidGen.next(); // '0000000000000000000000000000000000000001'
 */
export function createOidGenerator() {
  let counter = 0;
  return {
    next() {
      counter++;
      return counter.toString(16).padStart(40, '0');
    },
    reset() {
      counter = 0;
    },
  };
}

/**
 * Creates a fresh SHA256 hash generator with its own counter.
 * Use this in beforeEach to avoid parallel test interference.
 *
 * @returns {{ next: () => string, reset: () => void }}
 *
 * @example
 * let hashGen;
 * beforeEach(() => {
 *   hashGen = createHashGenerator();
 * });
 * const hash = hashGen.next(); // 64-character hex string
 */
export function createHashGenerator() {
  let counter = 0;
  return {
    next() {
      counter++;
      return counter.toString(16).padStart(64, '0');
    },
    reset() {
      counter = 0;
    },
  };
}

/**
 * Generates a valid 40-character hex OID from a number.
 * Useful for deterministic OID generation in tests.
 *
 * @param {number} n - Number to generate OID from
 * @returns {string} 40-character hex string
 *
 * @example
 * generateOidFromNumber(1); // '0000000000000000000000000000000000000001'
 * generateOidFromNumber(255); // '00000000000000000000000000000000000000ff'
 */
export function generateOidFromNumber(n) {
  const hex = n.toString(16).padStart(40, '0');
  return hex.slice(-40);
}

// ============================================================================
// Mock Persistence Adapters
// ============================================================================

/**
 * Creates a basic mock persistence adapter with all methods stubbed.
 * Use this when you need fine-grained control over mock behavior.
 *
 * @returns {Object} Mock persistence adapter with vi.fn() methods
 *
 * @example
 * const persistence = createMockPersistence();
 * persistence.readRef.mockResolvedValue('abc123...');
 */
export function createMockPersistence() {
  return {
    readRef: vi.fn(),
    showNode: vi.fn(),
    writeBlob: vi.fn(),
    writeTree: vi.fn(),
    readBlob: vi.fn(),
    readTreeOids: vi.fn(),
    commitNode: vi.fn(),
    commitNodeWithTree: vi.fn(),
    updateRef: vi.fn(),
    listRefs: vi.fn().mockResolvedValue([]),
    getNodeInfo: vi.fn(),
    ping: vi.fn().mockResolvedValue({ ok: true, latencyMs: 1 }),
    configGet: vi.fn().mockResolvedValue(null),
    configSet: vi.fn().mockResolvedValue(undefined),
    nodeExists: vi.fn().mockResolvedValue(true),
    isAncestor: vi.fn().mockResolvedValue(true),
  };
}

/**
 * Creates a mock persistence adapter pre-populated with commits.
 * Useful for WormholeService and other tests that need a commit chain.
 *
 * @param {Array<{index: number, patch: Object, parentIndex: number|null, writerId: string, lamport: number}>} commits - Commits to populate
 * @param {string} [graphName='test-graph'] - The graph name for validation
 * @returns {{persistence: Object, getSha: (index: number) => string}} Mock persistence adapter and SHA lookup
 *
 * @example
 * const commits = [
 *   { index: 1, patch: patch1, parentIndex: null, writerId: 'alice', lamport: 1 },
 *   { index: 2, patch: patch2, parentIndex: 1, writerId: 'alice', lamport: 2 },
 * ];
 * const { persistence, getSha } = createPopulatedMockPersistence(commits);
 * const sha1 = getSha(1);
 */
export function createPopulatedMockPersistence(commits, graphName = 'test-graph') {
  const commitMap = new Map();
  const blobMap = new Map();
  const shaMap = new Map();

  for (const commit of commits) {
    // Generate valid 40-char hex SHAs
    const sha = generateOidFromNumber(commit.index * 1000);
    const parentSha = commit.parentIndex !== null ? generateOidFromNumber(commit.parentIndex * 1000) : null;
    shaMap.set(commit.index, sha);

    // Encode the patch and store as a blob
    const patchBuffer = encode(commit.patch);
    // Generate a valid 40-character hex OID for the blob
    const patchOid = generateOidFromNumber(commit.index * 1000 + 1);
    blobMap.set(patchOid, patchBuffer);

    // Create the commit message
    const message = encodePatchMessage({
      graph: graphName,
      writer: commit.writerId,
      lamport: commit.lamport,
      patchOid,
      schema: 2,
    });

    commitMap.set(sha, {
      message,
      parents: parentSha ? [parentSha] : [],
      patchOid,
    });
  }

  const persistence = {
    nodeExists: vi.fn(async (sha) => commitMap.has(sha)),
    getNodeInfo: vi.fn(async (sha) => {
      const commit = commitMap.get(sha);
      if (!commit) {
        throw new Error(`Commit not found: ${sha}`);
      }
      return { message: commit.message, parents: commit.parents };
    }),
    readBlob: vi.fn(async (oid) => {
      const blob = blobMap.get(oid);
      if (!blob) {
        throw new Error(`Blob not found: ${oid}`);
      }
      return blob;
    }),
    readRef: vi.fn(),
    showNode: vi.fn(),
    writeBlob: vi.fn(),
    writeTree: vi.fn(),
    readTreeOids: vi.fn(),
    commitNode: vi.fn(),
    commitNodeWithTree: vi.fn(),
    updateRef: vi.fn(),
    listRefs: vi.fn().mockResolvedValue([]),
    ping: vi.fn().mockResolvedValue({ ok: true, latencyMs: 1 }),
    configGet: vi.fn().mockResolvedValue(null),
    configSet: vi.fn().mockResolvedValue(undefined),
  };

  const getSha = (index) => shaMap.get(index);

  return { persistence, getSha };
}

// ============================================================================
// Mock Patch Creators
// ============================================================================

/**
 * Creates a mock V2 patch with reads/writes I/O declarations.
 * Includes both the patch object and all metadata needed to mock persistence.
 *
 * @param {Object} options - Patch options
 * @param {string} options.sha - Commit SHA
 * @param {string} options.graphName - Graph name
 * @param {string} options.writerId - Writer ID
 * @param {number} options.lamport - Lamport timestamp
 * @param {Array} options.ops - Patch operations
 * @param {Array} [options.reads] - Read declarations
 * @param {Array} [options.writes] - Write declarations
 * @param {string|null} [options.parentSha] - Parent commit SHA
 * @param {function} oidGenerator - OID generator function (e.g., from createOidGenerator().next)
 * @returns {Object} Mock patch with sha, patchOid, patchBuffer, message, patch, nodeInfo
 *
 * @example
 * const oidGen = createOidGenerator();
 * const patch = createMockPatchWithIO({
 *   sha: oidGen.next(),
 *   graphName: 'test',
 *   writerId: 'alice',
 *   lamport: 1,
 *   ops: [createNodeAddV2('user:alice', createDot('alice', 1))],
 *   reads: [],
 *   writes: ['user:alice'],
 * }, oidGen.next);
 */
export function createMockPatchWithIO(
  { sha, graphName, writerId, lamport, ops, reads, writes, parentSha = null },
  oidGenerator
) {
  const patchOid = oidGenerator();
  const context = { [writerId]: lamport };
  const patch = {
    schema: 2,
    writer: writerId,
    lamport,
    context,
    ops,
  };
  if (reads && reads.length > 0) {
    patch.reads = reads;
  }
  if (writes && writes.length > 0) {
    patch.writes = writes;
  }
  const patchBuffer = encode(patch);
  const message = encodePatchMessage({
    graph: graphName,
    writer: writerId,
    lamport,
    patchOid,
    schema: 2,
  });

  return {
    sha,
    patchOid,
    patchBuffer,
    message,
    patch,
    nodeInfo: {
      sha,
      message,
      author: 'Test <test@example.com>',
      date: '2026-01-01T00:00:00.000Z',
      parents: parentSha ? [parentSha] : [],
    },
  };
}

/**
 * Creates a mock V2 patch with explicit OIDs (no generator required).
 * Simpler version of createMockPatchWithIO for tests that manage OIDs explicitly.
 *
 * @param {Object} options - Patch options
 * @param {string} options.sha - Commit SHA
 * @param {string} options.patchOid - Patch blob OID
 * @param {string} options.graphName - Graph name
 * @param {string} options.writerId - Writer ID
 * @param {number} options.lamport - Lamport timestamp
 * @param {Array} [options.ops=[]] - Patch operations
 * @param {string|null} [options.parentSha=null] - Parent commit SHA
 * @returns {Object} Mock patch with sha, patchOid, patchBuffer, message, patch, nodeInfo
 *
 * @example
 * const patch = createMockPatch({
 *   sha: '1111111111111111111111111111111111111111',
 *   patchOid: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
 *   graphName: 'test-graph',
 *   writerId: 'alice',
 *   lamport: 1,
 * });
 */
export function createMockPatch({
  sha,
  patchOid,
  graphName,
  writerId,
  lamport,
  ops = [],
  parentSha = null,
}) {
  const context = { [writerId]: lamport };
  const patch = {
    schema: 2,
    writer: writerId,
    lamport,
    context,
    ops,
  };
  const patchBuffer = encode(patch);
  const message = encodePatchMessage({
    graph: graphName,
    writer: writerId,
    lamport,
    patchOid,
    schema: 2,
  });

  return {
    sha,
    patchOid,
    patchBuffer,
    message,
    patch,
    nodeInfo: {
      sha,
      message,
      author: 'Test <test@example.com>',
      date: '2026-01-01T00:00:00.000Z',
      parents: parentSha ? [parentSha] : [],
    },
  };
}

// ============================================================================
// V2 Operation Helpers
// ============================================================================

/**
 * Creates a NodeAdd operation for V2 patches.
 *
 * @param {string} node - Node ID
 * @param {Object} dot - Dot from createDot()
 * @returns {Object} NodeAdd operation
 *
 * @example
 * createNodeAddV2('user:alice', createDot('alice', 1))
 */
export function createNodeAddV2(node, dot) {
  return { type: 'NodeAdd', node, dot };
}

/**
 * Creates a NodeRemove operation for V2 patches.
 *
 * @param {Array} observedDots - Array of observed dots to remove
 * @returns {Object} NodeRemove operation
 *
 * @example
 * createNodeRemoveV2([createDot('alice', 1)])
 */
export function createNodeRemoveV2(observedDots) {
  return { type: 'NodeRemove', observedDots };
}

/**
 * Creates a NodeTombstone operation for V2 patches.
 *
 * @param {string} node - Node ID
 * @param {Array} observedDots - Array of observed dots
 * @returns {Object} NodeTombstone operation
 *
 * @example
 * createNodeTombstoneV2('user:alice', [createDot('alice', 1)])
 */
export function createNodeTombstoneV2(node, observedDots) {
  return { type: 'NodeTombstone', node, observedDots };
}

/**
 * Creates an EdgeAdd operation for V2 patches.
 *
 * @param {string} from - Source node ID
 * @param {string} to - Target node ID
 * @param {string} label - Edge label
 * @param {Object} dot - Dot from createDot()
 * @returns {Object} EdgeAdd operation
 *
 * @example
 * createEdgeAddV2('user:alice', 'user:bob', 'follows', createDot('alice', 1))
 */
export function createEdgeAddV2(from, to, label, dot) {
  return { type: 'EdgeAdd', from, to, label, dot };
}

/**
 * Creates an EdgeTombstone operation for V2 patches.
 *
 * @param {string} from - Source node ID
 * @param {string} to - Target node ID
 * @param {string} label - Edge label
 * @param {Array} observedDots - Array of observed dots
 * @returns {Object} EdgeTombstone operation
 *
 * @example
 * createEdgeTombstoneV2('user:alice', 'user:bob', 'follows', [createDot('alice', 1)])
 */
export function createEdgeTombstoneV2(from, to, label, observedDots) {
  return { type: 'EdgeTombstone', from, to, label, observedDots };
}

/**
 * Creates a PropSet operation for V2 patches.
 *
 * @param {string} node - Node ID
 * @param {string} key - Property key
 * @param {*} value - Property value (use createInlineValue for typed values)
 * @returns {Object} PropSet operation
 *
 * @example
 * createPropSetV2('user:alice', 'name', createInlineValue('Alice'))
 */
export function createPropSetV2(node, key, value) {
  return { type: 'PropSet', node, key, value };
}

// ============================================================================
// V2 Patch Helpers
// ============================================================================

/**
 * Creates a complete V2 patch object.
 *
 * @param {Object} options - Patch options
 * @param {string} options.writer - Writer ID
 * @param {number} options.lamport - Lamport timestamp
 * @param {Array} options.ops - Array of operations
 * @param {Object} [options.context] - Version vector context (defaults to empty)
 * @returns {Object} Complete V2 patch object
 *
 * @example
 * createPatchV2({
 *   writer: 'alice',
 *   lamport: 1,
 *   ops: [createNodeAddV2('user:alice', createDot('alice', 1))],
 * })
 */
export function createPatchV2({ writer, lamport, ops, context }) {
  return {
    schema: 2,
    writer,
    lamport,
    ops,
    context: context || createVersionVector(),
  };
}

/**
 * Creates a standard set of sample patches for testing.
 * Includes three patches: patchA (node-a), patchB (node-b), patchC (edge + property).
 *
 * @returns {Object} Object with patchA, patchB, patchC properties
 *
 * @example
 * const { patchA, patchB, patchC } = createSamplePatches();
 * const payload = new ProvenancePayload([patchA, patchB, patchC]);
 */
export function createSamplePatches() {
  return {
    patchA: {
      patch: createPatchV2({
        writer: 'A',
        lamport: 1,
        ops: [createNodeAddV2('node-a', createDot('A', 1))],
      }),
      sha: generateOidFromNumber(0xaaaa1111),
    },
    patchB: {
      patch: createPatchV2({
        writer: 'B',
        lamport: 2,
        ops: [createNodeAddV2('node-b', createDot('B', 1))],
      }),
      sha: generateOidFromNumber(0xbbbb2222),
    },
    patchC: {
      patch: createPatchV2({
        writer: 'C',
        lamport: 3,
        ops: [
          createEdgeAddV2('node-a', 'node-b', 'connects', createDot('C', 1)),
          createPropSetV2('node-a', 'name', createInlineValue('Alice')),
        ],
      }),
      sha: generateOidFromNumber(0xcccc3333),
    },
  };
}

// ============================================================================
// Re-exports for convenience
// ============================================================================

// Re-export commonly used CRDT helpers so tests can import from one place
export { createDot } from '../../src/domain/crdt/Dot.js';
export { createVersionVector } from '../../src/domain/crdt/VersionVector.js';
export { createInlineValue } from '../../src/domain/types/WarpTypes.js';

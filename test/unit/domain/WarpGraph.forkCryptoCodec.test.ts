import { describe, it, expect, beforeEach } from 'vitest';
import { openRuntimeHostProduct } from '../../../src/domain/warp/RuntimeHostProduct.ts';
import {
  createMockPersistence,
  createMockPatch,
  createMockLogger,
} from '../../helpers/warpGraphTestUtils.ts';

// Valid 40-char hex SHAs for testing
const SHA1 = '1111111111111111111111111111111111111111';
const POID1 = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

describe('WarpCore.fork crypto/codec propagation', () => {
    let persistence;
    let mockCrypto;
    let mockCodec;
    let graph;

  beforeEach(async () => {
    persistence = createMockPersistence();
    mockCrypto = {
      digest: async () => 'mockhash',
    };
    mockCodec = {
      encode: (/** @type {any} */ obj) => Buffer.from(JSON.stringify(obj)),
      decode: (/** @type {any} */ buf) => JSON.parse(buf.toString()),
    };

    graph = await openRuntimeHostProduct({
      persistence,
      graphName: 'test-graph',
      writerId: 'test-writer',
      logger: createMockLogger(),
      crypto: mockCrypto,
      codec: mockCodec,
    });
  });

  it('forked graph inherits crypto from parent', async () => {
    const patch = createMockPatch({
      graphName: 'test-graph',
      sha: SHA1,
      writerId: 'alice',
      lamport: 1,
      patchOid: POID1,
    });

    persistence.listRefs.mockImplementation(async (/** @type {any} */ prefix) => {
      if (prefix === 'refs/warp/test-graph/writers/') {
        return ['refs/warp/test-graph/writers/alice'];
      }
      return [];
    });
    persistence.nodeExists.mockResolvedValue(true);
    persistence.readRef.mockImplementation(async (/** @type {any} */ ref) => {
      if (ref === 'refs/warp/test-graph/writers/alice') {
        return SHA1;
      }
      return null;
    });
    persistence.getNodeInfo.mockResolvedValue(patch.nodeInfo);

    const fork = await graph.fork({
      from: 'alice',
      at: SHA1,
      forkName: 'crypto-fork',
      forkWriterId: 'fork-writer',
    });

    expect(fork.graphName).toBe('crypto-fork');
    expect(fork._crypto).toBe(mockCrypto);
  });

  it('forked graph inherits codec from parent', async () => {
    const patch = createMockPatch({
      graphName: 'test-graph',
      sha: SHA1,
      writerId: 'alice',
      lamport: 1,
      patchOid: POID1,
    });

    persistence.listRefs.mockImplementation(async (/** @type {any} */ prefix) => {
      if (prefix === 'refs/warp/test-graph/writers/') {
        return ['refs/warp/test-graph/writers/alice'];
      }
      return [];
    });
    persistence.nodeExists.mockResolvedValue(true);
    persistence.readRef.mockImplementation(async (/** @type {any} */ ref) => {
      if (ref === 'refs/warp/test-graph/writers/alice') {
        return SHA1;
      }
      return null;
    });
    persistence.getNodeInfo.mockResolvedValue(patch.nodeInfo);

    const fork = await graph.fork({
      from: 'alice',
      at: SHA1,
      forkName: 'codec-fork',
      forkWriterId: 'fork-writer',
    });

    expect(fork.graphName).toBe('codec-fork');
    expect(fork._codec).toBe(mockCodec);
  });

  it('forked graph without crypto/codec uses parent defaults', async () => {
    // Create a graph without explicit crypto (uses defaultCrypto)
    const plainGraph = await openRuntimeHostProduct({
      persistence,
      graphName: 'plain-graph',
      writerId: 'plain-writer',
    });

    const patch = createMockPatch({
      graphName: 'plain-graph',
      sha: SHA1,
      writerId: 'alice',
      lamport: 1,
      patchOid: POID1,
    });

    persistence.listRefs.mockImplementation(async (/** @type {any} */ prefix) => {
      if (prefix === 'refs/warp/plain-graph/writers/') {
        return ['refs/warp/plain-graph/writers/alice'];
      }
      return [];
    });
    persistence.nodeExists.mockResolvedValue(true);
    persistence.readRef.mockImplementation(async (/** @type {any} */ ref) => {
      if (ref === 'refs/warp/plain-graph/writers/alice') {
        return SHA1;
      }
      return null;
    });
    persistence.getNodeInfo.mockResolvedValue(patch.nodeInfo);

    const fork = await plainGraph.fork({
      from: 'alice',
      at: SHA1,
      forkName: 'default-fork',
      forkWriterId: 'fork-writer',
    });

    expect(fork.graphName).toBe('default-fork');
    // Both should share the same default codec
    expect(fork._codec).toBe(plainGraph._codec);
    // Both should share the same default crypto
    expect(fork._crypto).toBe(plainGraph._crypto);
  });
});

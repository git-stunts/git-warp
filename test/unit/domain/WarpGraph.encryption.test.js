/**
 * Integration tests for graph encryption at rest (B164).
 *
 * Tests the patchBlobStorage flow end-to-end using a mock
 * BlobStoragePort that simulates encrypted storage in memory.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import WarpGraph from '../../../src/domain/WarpGraph.js';
import BlobStoragePort from '../../../src/ports/BlobStoragePort.js';
import EncryptionError from '../../../src/domain/errors/EncryptionError.js';
import { createInMemoryRepo } from '../../helpers/warpGraphTestUtils.js';

// ---------------------------------------------------------------------------
// Mock BlobStoragePort — stores/retrieves from an in-memory Map
// ---------------------------------------------------------------------------

class InMemoryBlobStorage extends BlobStoragePort {
  constructor() {
    super();
    /** @type {Map<string, Uint8Array>} */
    this._blobs = new Map();
    this._counter = 0;
  }

  async store(/** @type {string|Uint8Array} */ content) {
    this._counter++;
    // Generate a fake OID (40-char hex)
    const oid = this._counter.toString(16).padStart(40, '0');
    const buf = typeof content === 'string'
      ? new TextEncoder().encode(content)
      : new Uint8Array(content);
    this._blobs.set(oid, buf);
    return oid;
  }

  async retrieve(/** @type {string} */ oid) {
    const buf = this._blobs.get(oid);
    if (!buf) {
      throw new Error(`InMemoryBlobStorage: OID not found: ${oid}`);
    }
    return buf;
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('WarpGraph encryption at rest (B164)', () => {
  /** @type {ReturnType<typeof createInMemoryRepo>} */
  let repo;
  /** @type {InMemoryBlobStorage} */
  let patchStorage;

  beforeEach(() => {
    repo = createInMemoryRepo();
    patchStorage = new InMemoryBlobStorage();
  });

  it('writes encrypted patches via patchBlobStorage and reads them back', async () => {
    const graph = await WarpGraph.open({
      persistence: repo.persistence,
      graphName: 'enc-test',
      writerId: 'writer-1',
      patchBlobStorage: patchStorage,
    });

    // Write a patch
    const sha = await graph.patch(p => {
      p.addNode('user:alice');
      p.setProperty('user:alice', 'name', 'Alice');
    });

    expect(sha).toBeTruthy();
    // Patch CBOR should be in our mock storage, not raw persistence
    expect(patchStorage._blobs.size).toBe(1);

    // Materialize should work (reads back via patchBlobStorage)
    const state = await graph.materialize();
    expect(state).toBeTruthy();

    // Query to verify data integrity
    expect(await graph.hasNode('user:alice')).toBe(true);
    const props = /** @type {any} */ (await graph.getNodeProps('user:alice'));
    expect(props.name).toBe('Alice');
  });

  it('reads encrypted patches after re-opening with patchBlobStorage', async () => {
    // Write with encryption
    const graph1 = await WarpGraph.open({
      persistence: repo.persistence,
      graphName: 'enc-test',
      writerId: 'writer-1',
      patchBlobStorage: patchStorage,
    });
    await graph1.patch(p => {
      p.addNode('user:bob');
      p.setProperty('user:bob', 'role', 'admin');
    });

    // Re-open with same storage (simulating re-open with key)
    const graph2 = await WarpGraph.open({
      persistence: repo.persistence,
      graphName: 'enc-test',
      writerId: 'writer-2',
      patchBlobStorage: patchStorage,
    });
    await graph2.materialize();

    expect(await graph2.hasNode('user:bob')).toBe(true);
    const props = /** @type {any} */ (await graph2.getNodeProps('user:bob'));
    expect(props.role).toBe('admin');
  });

  it('throws EncryptionError when reading encrypted patches without patchBlobStorage', async () => {
    // Write with encryption
    const graph1 = await WarpGraph.open({
      persistence: repo.persistence,
      graphName: 'enc-test',
      writerId: 'writer-1',
      patchBlobStorage: patchStorage,
    });
    await graph1.patch(p => {
      p.addNode('user:charlie');
    });

    // Re-open WITHOUT patchBlobStorage — should fail during open() or materialize()
    // (the migration boundary check in open() reads the tip patch)
    const openPromise = WarpGraph.open({
      persistence: repo.persistence,
      graphName: 'enc-test',
      writerId: 'writer-2',
    });

    /** @type {unknown} */
    const err = await openPromise.then(() => null, (e) => e);
    expect(err).toBeInstanceOf(EncryptionError);
    expect(/** @type {Error} */ (err).message).toMatch(/encrypted patches/);
  });

  it('handles mixed encrypted and unencrypted patches', async () => {
    // Write unencrypted patches first
    const graph1 = await WarpGraph.open({
      persistence: repo.persistence,
      graphName: 'mixed-test',
      writerId: 'writer-1',
    });
    await graph1.patch(p => {
      p.addNode('user:plain');
      p.setProperty('user:plain', 'mode', 'clear');
    });

    // Then write encrypted patches with a different writer
    const graph2 = await WarpGraph.open({
      persistence: repo.persistence,
      graphName: 'mixed-test',
      writerId: 'writer-2',
      patchBlobStorage: patchStorage,
    });
    await graph2.patch(p => {
      p.addNode('user:secret');
      p.setProperty('user:secret', 'mode', 'encrypted');
    });

    // Re-open with patchBlobStorage — should read both
    const graph3 = await WarpGraph.open({
      persistence: repo.persistence,
      graphName: 'mixed-test',
      writerId: 'reader',
      patchBlobStorage: patchStorage,
    });
    await graph3.materialize();

    expect(await graph3.hasNode('user:plain')).toBe(true);
    expect(await graph3.hasNode('user:secret')).toBe(true);
    const plainProps = /** @type {any} */ (await graph3.getNodeProps('user:plain'));
    expect(plainProps.mode).toBe('clear');
    const secretProps = /** @type {any} */ (await graph3.getNodeProps('user:secret'));
    expect(secretProps.mode).toBe('encrypted');
  });

  it('no behavior change when patchBlobStorage is not provided', async () => {
    const graph = await WarpGraph.open({
      persistence: repo.persistence,
      graphName: 'plain-test',
      writerId: 'writer-1',
    });

    await graph.patch(p => {
      p.addNode('user:normal');
      p.setProperty('user:normal', 'status', 'active');
    });

    // patchBlobStorage should be empty — patches went to persistence directly
    expect(patchStorage._blobs.size).toBe(0);

    const state = await graph.materialize();
    expect(state).toBeTruthy();

    expect(await graph.hasNode('user:normal')).toBe(true);
    const props = /** @type {any} */ (await graph.getNodeProps('user:normal'));
    expect(props.status).toBe('active');
  });

  it('multiple encrypted patches accumulate correctly', async () => {
    const graph = await WarpGraph.open({
      persistence: repo.persistence,
      graphName: 'multi-test',
      writerId: 'writer-1',
      patchBlobStorage: patchStorage,
    });

    await graph.patch(p => {
      p.addNode('a');
      p.setProperty('a', 'v', 1);
    });
    await graph.patch(p => {
      p.addNode('b');
      p.addEdge('a', 'b', 'link');
    });
    await graph.patch(p => {
      p.setProperty('a', 'v', 2);
    });

    // 3 patches stored
    expect(patchStorage._blobs.size).toBe(3);

    const state = await graph.materialize();
    expect(state).toBeTruthy();

    const nodes = await graph.getNodes();
    expect(nodes.sort()).toEqual(['a', 'b']);
    const aProps = /** @type {any} */ (await graph.getNodeProps('a'));
    expect(aProps.v).toBe(2); // LWW: latest wins
  });

  it('provenance methods work with encrypted patches', async () => {
    const graph = await WarpGraph.open({
      persistence: repo.persistence,
      graphName: 'prov-test',
      writerId: 'writer-1',
      patchBlobStorage: patchStorage,
    });

    await graph.patch(p => {
      p.addNode('x');
      p.setProperty('x', 'k', 'v1');
    });
    await graph.patch(p => {
      p.setProperty('x', 'k', 'v2');
    });

    await graph.materialize();

    // patchesFor should work
    const patches = await graph.patchesFor('x');
    expect(patches.length).toBeGreaterThanOrEqual(2);

    // loadPatchBySha should work
    const loaded = await graph.loadPatchBySha(patches[0]);
    expect(loaded).toBeTruthy();
    expect(loaded.ops).toBeDefined();
  });

  it('EncryptionError has correct code', () => {
    const err = new EncryptionError('test');
    expect(err.code).toBe('E_ENCRYPTED_PATCH');
    expect(err.name).toBe('EncryptionError');
    expect(err).toBeInstanceOf(Error);
  });
});

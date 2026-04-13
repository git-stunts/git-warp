import { describe, it, expect } from 'vitest';
import GraphPersistencePort from '../../../src/ports/GraphPersistencePort.ts';
import IndexStoragePort from '../../../src/ports/IndexStoragePort.ts';

describe('GraphPersistencePort (abstract composite)', () => {
  const expectedMethods = [
    // CommitPort
    'commitNode', 'showNode', 'getNodeInfo', 'logNodes',
    'logNodesStream', 'countNodes', 'commitNodeWithTree',
    'nodeExists', 'getCommitTree', 'ping',
    // BlobPort
    'writeBlob', 'readBlob',
    // TreePort
    'writeTree', 'readTree', 'readTreeOids',
    // RefPort
    'updateRef', 'readRef', 'deleteRef', 'listRefs', 'compareAndSwapRef',
  ];

  it('abstract methods are not on the base prototype (TS abstract)', () => {
    const proto = GraphPersistencePort.prototype;
    for (const method of expectedMethods) {
      expect(((proto))[method]).toBeUndefined();
    }
  });

  it('does not leak constructor from focused ports', () => {
    // Even though GraphPersistencePort is abstract, JS allows instantiation
    /** @type {any} */ const Ctor = GraphPersistencePort;
    const port = new Ctor();
    expect(port.constructor).toBe(GraphPersistencePort);
  });

  it('subclass can override methods normally', async () => {
    class TestAdapter extends GraphPersistencePort {
      async commitNode() { return 'sha'; }
      async showNode() { return 'msg'; }
      async getNodeInfo() { return ({} as any); }
      async logNodes() { return 'log'; }
      async logNodesStream() { return (null); }
      async countNodes() { return 1; }
      async commitNodeWithTree() { return 'sha2'; }
      async nodeExists() { return true; }
      async getCommitTree() { return 'tree'; }
      async ping() { return { ok: true, latencyMs: 0 }; }
      async writeBlob() { return 'blob'; }
      async readBlob() { return new Uint8Array(); }
      async writeTree() { return 'tree-oid'; }
      async readTree() { return {}; }
      async readTreeOids() { return {}; }
      get emptyTree() { return '4b825dc642cb6eb9a060e54bf8d69288fbee4904'; }
      async updateRef() { /* no-op */ }
      async readRef() { return null; }
      async deleteRef() { /* no-op */ }
      async listRefs() { return []; }
      async compareAndSwapRef() { /* no-op */ }
    }
    const adapter = new TestAdapter();
    expect(adapter).toBeInstanceOf(GraphPersistencePort);
    const result = await adapter.ping();
    expect(result).toEqual({ ok: true, latencyMs: 0 });
  });
});

describe('IndexStoragePort (abstract subset)', () => {
  const expectedMethods = [
    'writeBlob', 'readBlob',
    'writeTree', 'readTreeOids',
    'updateRef', 'readRef',
  ];

  it('abstract methods are not on the base prototype', () => {
    const proto = IndexStoragePort.prototype;
    for (const method of expectedMethods) {
      expect(((proto))[method]).toBeUndefined();
    }
  });

  it('does not include methods outside its subset', () => {
    /** @type {any} */ const Ctor = IndexStoragePort;
    const port = new Ctor();
    expect(port.deleteRef).toBeUndefined();
    expect(port.listRefs).toBeUndefined();
    expect(port.readTree).toBeUndefined();
  });

  it('subclass satisfies the contract', async () => {
    class TestStorage extends IndexStoragePort {
      async writeBlob() { return 'blob-oid'; }
      async readBlob() { return new Uint8Array(); }
      async writeTree() { return 'tree-oid'; }
      async readTreeOids() { return {}; }
      async updateRef() { /* no-op */ }
      async readRef() { return null; }
    }
    const storage = new TestStorage();
    expect(storage).toBeInstanceOf(IndexStoragePort);
    expect(await ((storage)).writeBlob(new Uint8Array())).toBe('blob-oid');
  });
});

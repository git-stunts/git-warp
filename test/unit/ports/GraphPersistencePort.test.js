import { describe, it, expect } from 'vitest';
import GraphPersistencePort_ from '../../../src/ports/GraphPersistencePort.js';
import IndexStoragePort_ from '../../../src/ports/IndexStoragePort.js';

/** @type {any} */ const GraphPersistencePort = GraphPersistencePort_;
/** @type {any} */ const IndexStoragePort = IndexStoragePort_;

describe('GraphPersistencePort (composite mixin)', () => {
  const expectedMethods = [
    // CommitPort
    'commitNode',
    'showNode',
    'getNodeInfo',
    'logNodes',
    'logNodesStream',
    'countNodes',
    'commitNodeWithTree',
    'nodeExists',
    'ping',
    // BlobPort
    'writeBlob',
    'readBlob',
    // TreePort
    'writeTree',
    'readTree',
    'readTreeOids',
    // RefPort
    'updateRef',
    'readRef',
    'deleteRef',
    'listRefs',
    'compareAndSwapRef',
    // ConfigPort
    'configGet',
    'configSet',
  ];

  it('has all 22 members on its prototype', () => {
    const proto = GraphPersistencePort.prototype;
    const ownNames = Object.getOwnPropertyNames(proto).filter(
      (n) => n !== 'constructor',
    );
    expect(ownNames.sort()).toEqual(
      [...expectedMethods, 'emptyTree'].sort(),
    );
  });

  it('does not leak constructor from focused ports', () => {
    const port = new GraphPersistencePort();
    expect(port.constructor).toBe(GraphPersistencePort);
  });

  for (const method of expectedMethods) {
    it(`stub ${method}() throws with focused-port class name`, async () => {
      const port = new GraphPersistencePort();
      await expect(port[method]()).rejects.toThrow(/\w+Port\.\w+\(?\)? not implemented/);
    });
  }

  it('emptyTree getter throws with TreePort class name', () => {
    const port = new GraphPersistencePort();
    expect(() => port.emptyTree).toThrow('TreePort.emptyTree not implemented');
  });

  it('subclass can override methods normally', async () => {
    class TestAdapter extends GraphPersistencePort {
      async ping() {
        return { ok: true, latencyMs: 0 };
      }
    }
    const adapter = new TestAdapter();
    const result = await adapter.ping();
    expect(result).toEqual({ ok: true, latencyMs: 0 });
  });
});

describe('IndexStoragePort (filtered mixin)', () => {
  const expectedMethods = [
    'writeBlob',
    'readBlob',
    'writeTree',
    'readTreeOids',
    'updateRef',
    'readRef',
  ];

  it('has exactly 6 members on its prototype', () => {
    const proto = IndexStoragePort.prototype;
    const ownNames = Object.getOwnPropertyNames(proto).filter(
      (n) => n !== 'constructor',
    );
    expect(ownNames.sort()).toEqual(expectedMethods.sort());
  });

  it('does not leak constructor from focused ports', () => {
    const port = new IndexStoragePort();
    expect(port.constructor).toBe(IndexStoragePort);
  });

  for (const method of expectedMethods) {
    it(`stub ${method}() throws with focused-port class name`, async () => {
      const port = new IndexStoragePort();
      await expect(port[method]()).rejects.toThrow(/\w+Port\.\w+\(?\)? not implemented/);
    });
  }

  it('does not include methods outside the pick list', () => {
    const port = new IndexStoragePort();
    expect(port.deleteRef).toBeUndefined();
    expect(port.listRefs).toBeUndefined();
    expect(port.readTree).toBeUndefined();
  });
});

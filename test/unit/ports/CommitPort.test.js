import { describe, it, expect } from 'vitest';
import CommitPort from '../../../src/ports/CommitPort.ts';

describe('CommitPort', () => {
  const abstractMethods = [
    'commitNode', 'showNode', 'getNodeInfo', 'logNodes',
    'logNodesStream', 'countNodes', 'commitNodeWithTree',
    'nodeExists', 'getCommitTree', 'ping',
  ];

  it('abstract methods are not callable on base prototype', () => {
    for (const method of abstractMethods) {
      expect(CommitPort.prototype[method]).toBeUndefined();
    }
  });

  it('concrete subclass satisfies the contract', async () => {
    class TestCommit extends CommitPort {
      async commitNode() { return 'sha'; }
      async showNode() { return 'msg'; }
      async getNodeInfo() { return { sha: 'a', message: 'm', author: 'x', date: 'd', parents: [] }; }
      async logNodes() { return 'log'; }
      async logNodesStream() { return /** @type {any} */ (null); }
      async countNodes() { return 5; }
      async commitNodeWithTree() { return 'sha2'; }
      async nodeExists() { return true; }
      async getCommitTree() { return 'tree-oid'; }
      async ping() { return { ok: true, latencyMs: 1 }; }
    }
    const c = new TestCommit();
    expect(c).toBeInstanceOf(CommitPort);
    expect(await c.commitNode({ message: 'test' })).toBe('sha');
    expect(await c.ping()).toEqual({ ok: true, latencyMs: 1 });
  });
});

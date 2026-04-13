import { describe, it, expect } from 'vitest';
import CommitPort, {
  type CommitNodeOptions,
  type CommitNodeWithTreeOptions,
  type LogNodesOptions,
} from '../../../src/ports/CommitPort.ts';
import type { Readable } from 'node:stream';

describe('CommitPort', () => {
  const abstractMethods = [
    'commitNode', 'showNode', 'getNodeInfo', 'logNodes',
    'logNodesStream', 'countNodes', 'commitNodeWithTree',
    'nodeExists', 'getCommitTree', 'ping',
  ];

  it('abstract methods are not callable on base prototype', () => {
    for (const method of abstractMethods) {
      expect((CommitPort.prototype as unknown as Record<string, unknown>)[method]).toBeUndefined();
    }
  });

  it('concrete subclass satisfies the contract', async () => {
    class TestCommit extends CommitPort {
      async commitNode(_options: CommitNodeOptions) { return 'sha'; }
      async showNode(_sha: string) { return 'msg'; }
      async getNodeInfo(_sha: string) { return { sha: 'a', message: 'm', author: 'x', date: 'd', parents: [] }; }
      async logNodes(_options: LogNodesOptions) { return 'log'; }
      async logNodesStream(_options: LogNodesOptions) { return null as unknown as Readable; }
      async countNodes(_ref: string) { return 5; }
      async commitNodeWithTree(_options: CommitNodeWithTreeOptions) { return 'sha2'; }
      async nodeExists(_sha: string) { return true; }
      async getCommitTree(_sha: string) { return 'tree-oid'; }
      async ping() { return { ok: true, latencyMs: 1 }; }
    }
    const c = new TestCommit();
    expect(c).toBeInstanceOf(CommitPort);
    expect(await c.commitNode({ message: 'test' })).toBe('sha');
    expect(await c.ping()).toEqual({ ok: true, latencyMs: 1 });
  });
});

import { describe, it, expect } from 'vitest';
import CommitPort, {
  type CommitLogChunk,
  type CommitNodeOptions,
  type LogNodesOptions,
} from '../../../src/ports/CommitPort.ts';
import WarpStream from '../../../src/domain/stream/WarpStream.ts';

describe('CommitPort', () => {
  const abstractMethods = [
    'commitNode', 'showNode', 'getNodeInfo', 'logNodes',
    'logNodesStream', 'countNodes', 'nodeExists', 'ping',
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
      async logNodesStream(_options: LogNodesOptions): Promise<WarpStream<CommitLogChunk>> {
        return WarpStream.of<CommitLogChunk>();
      }
      async countNodes(_ref: string) { return 5; }
      async nodeExists(_sha: string) { return true; }
      async ping() { return { ok: true, latencyMs: 1 }; }
    }
    const c = new TestCommit();
    expect(c).toBeInstanceOf(CommitPort);
    expect(await c.commitNode({ message: 'test' })).toBe('sha');
    expect(await c.ping()).toEqual({ ok: true, latencyMs: 1 });
  });
});

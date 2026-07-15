import { describe, expect, it } from 'vitest';
import WarpStream from '../../../src/domain/stream/WarpStream.ts';
import type { CommitNodeOptions, LogNodesOptions } from '../../../src/ports/CommitPort.ts';
import GraphPersistencePort from '../../../src/ports/GraphPersistencePort.ts';
import type { ListRefsOptions } from '../../../src/ports/RefPort.ts';

describe('GraphPersistencePort causal history boundary', () => {
  const expectedMethods = [
    'commitNode', 'showNode', 'getNodeInfo', 'logNodes',
    'logNodesStream', 'countNodes', 'nodeExists', 'ping',
    'updateRef', 'readRef', 'deleteRef', 'listRefs', 'compareAndSwapRef',
  ];

  it('declares only causal commit and ref capabilities', () => {
    const prototype = GraphPersistencePort.prototype as unknown as Record<string, unknown>;
    for (const method of expectedMethods) {
      expect(prototype[method]).toBeUndefined();
    }
    expect(prototype['writeBlob']).toBeUndefined();
    expect(prototype['writeTree']).toBeUndefined();
    expect(prototype['getCommitTree']).toBeUndefined();
  });

  it('can be implemented without raw object capabilities', async () => {
    class TestAdapter extends GraphPersistencePort {
      async commitNode(_options: CommitNodeOptions) { return 'sha'; }
      async showNode(_sha: string) { return 'message'; }
      async getNodeInfo(_sha: string) {
        return { sha: 'sha', message: 'message', author: 'a', date: 'd', parents: [] };
      }
      async logNodes(_options: LogNodesOptions) { return 'log'; }
      async logNodesStream(_options: LogNodesOptions) { return WarpStream.of<string>('log'); }
      async countNodes(_ref: string) { return 1; }
      async nodeExists(_sha: string) { return true; }
      async ping() { return { ok: true, latencyMs: 0 }; }
      async updateRef(_ref: string, _oid: string) {}
      async readRef(_ref: string) { return null; }
      async deleteRef(_ref: string) {}
      async listRefs(_prefix: string, _options?: ListRefsOptions) { return []; }
      async compareAndSwapRef(_ref: string, _newOid: string, _expected: string | null) {}
    }

    const adapter = new TestAdapter();
    await expect(adapter.commitNode({ message: 'test' })).resolves.toBe('sha');
    expect(adapter).not.toHaveProperty('writeBlob');
    expect(adapter).not.toHaveProperty('writeTree');
  });
});

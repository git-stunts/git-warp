import { describe, it, expect } from 'vitest';
import InMemoryGraphAdapter from '../../../src/infrastructure/adapters/InMemoryGraphAdapter.js';

describe('compareAndSwapRef', () => {
  it('genesis CAS — null expected, ref does not exist → succeeds', async () => {
    const adapter = new InMemoryGraphAdapter();
    const sha = await adapter.commitNode({ message: 'test' });
    await adapter.compareAndSwapRef('refs/warp/test/audit/w1', sha, null);
    expect(await adapter.readRef('refs/warp/test/audit/w1')).toBe(sha);
  });

  it('CAS success — expected matches current → succeeds', async () => {
    const adapter = new InMemoryGraphAdapter();
    const sha1 = await adapter.commitNode({ message: 'first' });
    await adapter.updateRef('refs/warp/test/audit/w1', sha1);
    const sha2 = await adapter.commitNode({ message: 'second' });
    await adapter.compareAndSwapRef('refs/warp/test/audit/w1', sha2, sha1);
    expect(await adapter.readRef('refs/warp/test/audit/w1')).toBe(sha2);
  });

  it('CAS failure — expected does not match → throws', async () => {
    const adapter = new InMemoryGraphAdapter();
    const sha1 = await adapter.commitNode({ message: 'first' });
    await adapter.updateRef('refs/warp/test/audit/w1', sha1);
    const sha2 = await adapter.commitNode({ message: 'second' });
    const wrongExpected = await adapter.commitNode({ message: 'wrong' });
    await expect(
      adapter.compareAndSwapRef('refs/warp/test/audit/w1', sha2, wrongExpected)
    ).rejects.toThrow('CAS mismatch');
  });

  it('genesis CAS fails when ref already exists', async () => {
    const adapter = new InMemoryGraphAdapter();
    const sha1 = await adapter.commitNode({ message: 'exists' });
    await adapter.updateRef('refs/warp/test/audit/w1', sha1);
    const sha2 = await adapter.commitNode({ message: 'new' });
    await expect(
      adapter.compareAndSwapRef('refs/warp/test/audit/w1', sha2, null)
    ).rejects.toThrow('CAS mismatch');
  });
});

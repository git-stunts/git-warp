import { describe, it, expect, vi } from 'vitest';
import GitGraphAdapter from '../../../../src/infrastructure/adapters/GitGraphAdapter.js';

describe('GitGraphAdapter Concurrency Stress Test', () => {
  it('handles 50 simultaneous createNode calls without corruption', async () => {
    // Track call order to verify all calls complete
    const callLog = [];
    let callCounter = 0;

    const mockPlumbing = {
      emptyTree: '4b825dc642cb6eb9a060e54bf8d69288fbee4904',
      execute: vi.fn().mockImplementation(async ({ args }) => {
        const id = ++callCounter;
        callLog.push({ id, start: Date.now(), args: args[0] });
        // Simulate variable latency (0-10ms)
        await new Promise(r => setTimeout(r, Math.random() * 10));
        callLog.push({ id, end: Date.now() });
        // Return unique SHA for each call (valid hex format)
        return `abcd${id.toString(16).padStart(4, '0')}`;
      })
    };

    const adapter = new GitGraphAdapter({ plumbing: mockPlumbing });

    // Fire 50 concurrent commits
    const promises = Array.from({ length: 50 }, (_, i) =>
      adapter.commitNode({ message: `Node ${i}`, parents: [] })
    );

    const results = await Promise.all(promises);

    // All 50 should complete
    expect(results).toHaveLength(50);

    // All SHAs should be unique
    const uniqueShas = new Set(results);
    expect(uniqueShas.size).toBe(50);

    // Verify all calls were made
    expect(mockPlumbing.execute).toHaveBeenCalledTimes(50);
  });

  it('handles concurrent reads and writes without deadlock', async () => {
    const mockPlumbing = {
      emptyTree: '4b825dc642cb6eb9a060e54bf8d69288fbee4904',
      execute: vi.fn().mockImplementation(async ({ args }) => {
        await new Promise(r => setTimeout(r, Math.random() * 5));
        if (args[0] === 'commit-tree') return 'abcd1234abcd1234';
        if (args[0] === 'show') return 'message content';
        if (args[0] === 'rev-parse') return 'def456def456def4';
        return '';
      })
    };

    const adapter = new GitGraphAdapter({ plumbing: mockPlumbing });

    // Mix of writes, reads, and ref lookups
    const operations = [
      ...Array.from({ length: 20 }, (_, i) =>
        adapter.commitNode({ message: `Write ${i}` })
      ),
      ...Array.from({ length: 20 }, (_, i) =>
        adapter.showNode(`abcd${i.toString(16).padStart(4, '0')}`)
      ),
      ...Array.from({ length: 10 }, (_, i) =>
        adapter.readRef(`refs/heads/branch${i}`)
      )
    ];

    // Should complete without deadlock (timeout would fail the test)
    const results = await Promise.all(operations);
    expect(results).toHaveLength(50);
  });
});

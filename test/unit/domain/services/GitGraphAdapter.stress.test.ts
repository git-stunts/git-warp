import { setImmediate as nextTurn } from 'node:timers/promises';
import { describe, it, expect, vi } from 'vitest';
import GitTimelineHistoryAdapter, { type GitPlumbing } from '../../../../src/infrastructure/adapters/GitTimelineHistoryAdapter.ts';

describe('GitTimelineHistoryAdapter Concurrency Stress Test', () => {
  it.each([40, 64])('handles 50 simultaneous commits with %i-character tree OIDs', async oidLength => {
    const emptyTree = '1'.repeat(oidLength);
    let callCounter = 0;

    const mockPlumbing = {
      emptyTree: '4b825dc642cb6eb9a060e54bf8d69288fbee4904',
      execute: vi.fn<GitPlumbing['execute']>().mockImplementation(async ({ args }) => {
        if (args[0] === 'mktree') { return emptyTree; }
        if (args[0] !== 'commit-tree') { throw new Error('Unexpected Git command'); }
        expect(args[1]).toBe(emptyTree);
        const id = ++callCounter;
        // Simulate latency of 0, 1, or 2 event-loop turns based on call id.
        // Turns, not milliseconds, so the completion order is the same on every run.
        for (let turn = 0; turn < id % 3; turn += 1) {
          await nextTurn();
        }
        // Return unique SHA for each call (valid hex format)
        return id.toString(16).padStart(oidLength, '0');
      }),
      executeStream: vi.fn(),
    };

    const adapter = new GitTimelineHistoryAdapter({ plumbing: mockPlumbing });

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

    const calls = mockPlumbing.execute.mock.calls.map(([options]) => options);
    expect(calls.filter(options => options.args[0] === 'mktree')).toHaveLength(50);
    expect(calls.filter(options => options.args[0] === 'commit-tree')).toHaveLength(50);
    expect(results.every(sha => sha.length === oidLength)).toBe(true);
    await adapter.close();
  });

  it('handles concurrent reads and writes without deadlock', async () => {
    const mockPlumbing = {
      emptyTree: '4b825dc642cb6eb9a060e54bf8d69288fbee4904',
      execute: vi.fn<GitPlumbing['execute']>().mockImplementation(async ({ args }) => {
        await nextTurn();
        if (args[0] === 'mktree') return '1'.repeat(40);
        if (args[0] === 'commit-tree') return '2'.repeat(40);
        if (args[0] === 'show') return 'message content';
        if (args[0] === 'rev-parse') return 'def456def456def4';
        return '';
      }),
      executeStream: vi.fn(),
    };

    const adapter = new GitTimelineHistoryAdapter({ plumbing: mockPlumbing });

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
    await adapter.close();
  });
});

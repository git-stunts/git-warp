import { describe, it, expect, vi, beforeEach } from 'vitest';
import GitTimelineHistoryAdapter from '../../../../src/infrastructure/adapters/GitTimelineHistoryAdapter.ts';

/**
 * First-parent traversal law.
 *
 * Patch-chain readers walk first parents only. When they ask history for a
 * chain, the underlying `git log` must be constrained the same way, or a
 * merge's side branch is read and paid for without ever being walked.
 */
describe('GitTimelineHistoryAdapter first-parent traversal', () => {
  let mockPlumbing;
  let adapter;

  beforeEach(() => {
    mockPlumbing = {
      emptyTree: '4b825dc642cb6eb9a060e54bf8d69288fbee4904',
      execute: vi.fn().mockResolvedValue(''),
      executeStream: vi.fn().mockResolvedValue({
        async *[Symbol.asyncIterator]() {
          // no chunks
        },
      }),
    };
    adapter = new GitTimelineHistoryAdapter({ plumbing: mockPlumbing });
  });

  it('passes --first-parent to logNodes when requested', async () => {
    await adapter.logNodes({ ref: 'refs/warp/think/writers/w', limit: 5, firstParent: true });

    const { args } = mockPlumbing.execute.mock.calls[0][0];
    expect(args).toContain('--first-parent');
    expect(args.indexOf('--first-parent')).toBeLessThan(args.indexOf('refs/warp/think/writers/w'));
  });

  it('omits --first-parent from logNodes by default', async () => {
    await adapter.logNodes({ ref: 'refs/warp/think/writers/w', limit: 5 });

    expect(mockPlumbing.execute.mock.calls[0][0].args).not.toContain('--first-parent');
  });

  it('passes --first-parent to logNodesStream when requested', async () => {
    await adapter.logNodesStream({ ref: 'refs/warp/think/writers/w', limit: 10, firstParent: true });

    const { args } = mockPlumbing.executeStream.mock.calls[0][0];
    expect(args).toContain('--first-parent');
    expect(args.indexOf('--first-parent')).toBeLessThan(args.indexOf('refs/warp/think/writers/w'));
  });

  it('omits --first-parent from logNodesStream by default', async () => {
    await adapter.logNodesStream({ ref: 'refs/warp/think/writers/w', limit: 10 });

    expect(mockPlumbing.executeStream.mock.calls[0][0].args).not.toContain('--first-parent');
  });
});

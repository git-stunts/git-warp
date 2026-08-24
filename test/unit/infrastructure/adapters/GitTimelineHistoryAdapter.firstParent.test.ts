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

  it('bounds logNodes to a rev range when stopAt is given', async () => {
    await adapter.logNodes({ ref: 'refs/warp/think/writers/w', limit: 5, stopAt: 'refs/warp/think/checkpoints/head' });

    const { args } = mockPlumbing.execute.mock.calls[0][0];
    expect(args).toContain('refs/warp/think/checkpoints/head..refs/warp/think/writers/w');
    expect(args).not.toContain('refs/warp/think/writers/w');
  });

  it('bounds logNodesStream to a rev range when stopAt is given', async () => {
    await adapter.logNodesStream({ ref: 'refs/warp/think/writers/w', limit: 10, stopAt: 'refs/warp/think/checkpoints/head' });

    const { args } = mockPlumbing.executeStream.mock.calls[0][0];
    expect(args).toContain('refs/warp/think/checkpoints/head..refs/warp/think/writers/w');
    expect(args).not.toContain('refs/warp/think/writers/w');
  });

  it('passes the bare ref when stopAt is absent', async () => {
    await adapter.logNodesStream({ ref: 'refs/warp/think/writers/w', limit: 10 });

    expect(mockPlumbing.executeStream.mock.calls[0][0].args).toContain('refs/warp/think/writers/w');
  });

  it('rejects a stopAt that would reach the command line unvalidated', async () => {
    await expect(
      adapter.logNodesStream({ ref: 'refs/warp/think/writers/w', limit: 10, stopAt: '--upload-pack=evil' }),
    ).rejects.toThrow();
  });

  it('omits --first-parent from logNodesStream by default', async () => {
    await adapter.logNodesStream({ ref: 'refs/warp/think/writers/w', limit: 10 });

    expect(mockPlumbing.executeStream.mock.calls[0][0].args).not.toContain('--first-parent');
  });
});

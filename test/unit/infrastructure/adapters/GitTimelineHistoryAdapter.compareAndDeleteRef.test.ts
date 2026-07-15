import { beforeEach, describe, expect, it, vi } from 'vitest';
import PersistenceError from '../../../../src/domain/errors/PersistenceError.ts';
import GitTimelineHistoryAdapter from '../../../../src/infrastructure/adapters/GitTimelineHistoryAdapter.ts';

const REF = 'refs/warp/events/strands/draft';
const EXPECTED = 'a'.repeat(40);
type Execute = (options: { args: string[]; input?: string | Buffer }) => Promise<string>;

describe('GitTimelineHistoryAdapter.compareAndDeleteRef', () => {
  let execute: ReturnType<typeof vi.fn<Execute>>;
  let adapter: GitTimelineHistoryAdapter;

  beforeEach(() => {
    execute = vi.fn<Execute>();
    adapter = new GitTimelineHistoryAdapter({
      plumbing: {
        emptyTree: '4b825dc642cb6eb9a060e54bf8d69288fbee4904',
        execute,
        executeStream: vi.fn(),
      },
    });
  });

  it('deletes only the expected revision', async () => {
    execute.mockResolvedValue('');
    await expect(adapter.compareAndDeleteRef(REF, EXPECTED)).resolves.toBe(true);
    expect(execute).toHaveBeenCalledWith({ args: ['update-ref', '-d', REF, EXPECTED] });
  });

  it('returns false when a concurrent writer replaced the ref', async () => {
    execute.mockRejectedValueOnce(new Error('cannot lock ref')).mockResolvedValueOnce('b'.repeat(40));
    await expect(adapter.compareAndDeleteRef(REF, EXPECTED)).resolves.toBe(false);
  });

  it('preserves a delete failure while the expected revision remains current', async () => {
    const failure = Object.assign(new Error('permission denied'), {
      exitCode: 128,
      details: { code: 128, stderr: 'permission denied' },
    });
    execute.mockRejectedValueOnce(failure).mockResolvedValueOnce(EXPECTED);
    await expect(adapter.compareAndDeleteRef(REF, EXPECTED))
      .rejects.toMatchObject({ code: PersistenceError.E_REF_IO });
  });
});

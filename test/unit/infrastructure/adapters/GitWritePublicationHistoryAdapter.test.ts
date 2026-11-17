import { describe, expect, it, vi } from 'vitest';
import AdapterValidationError from '../../../../src/domain/errors/AdapterValidationError.ts';
import GitWritePublicationHistoryAdapter, { type WriterChainHistory } from '../../../../src/infrastructure/adapters/GitWritePublicationHistoryAdapter.ts';
import type { LogNodesOptions, NodeInfo } from '../../../../src/ports/CommitPort.ts';

const TIP = 'a'.repeat(40);
const PREDECESSOR = 'b'.repeat(40);

function adapterOver(output: string): { readonly adapter: GitWritePublicationHistoryAdapter; readonly logNodes: ReturnType<typeof vi.fn> } {
  const logNodes = vi.fn((_options: LogNodesOptions) => Promise.resolve(output));
  const history: WriterChainHistory = {
    readRef: (ref) => Promise.resolve(ref === 'refs/x' ? TIP : null),
    getNodeInfo: (sha): Promise<NodeInfo> => Promise.resolve({ sha, message: 'm', author: 'a', date: 'd', parents: [] }),
    logNodes,
  };
  return { adapter: new GitWritePublicationHistoryAdapter(history), logNodes };
}

describe('GitWritePublicationHistoryAdapter', () => {
  it('lists first parents back to the predecessor in one bounded log read', async () => {
    const { adapter, logNodes } = adapterOver(`${TIP}\n${'c'.repeat(64)}\n`);

    await expect(adapter.firstParentsSince({ tip: TIP, stopAt: PREDECESSOR, limit: 7 })).resolves.toEqual([TIP, 'c'.repeat(64)]);
    expect(logNodes).toHaveBeenCalledWith({ ref: TIP, stopAt: PREDECESSOR, firstParent: true, limit: 7, format: '%H' });
  });

  it('reads back to the root when the attempt had no predecessor, and an empty range as nothing', async () => {
    const { adapter, logNodes } = adapterOver('');

    await expect(adapter.firstParentsSince({ tip: TIP, stopAt: null, limit: 3 })).resolves.toEqual([]);
    expect(logNodes).toHaveBeenCalledWith({ ref: TIP, firstParent: true, limit: 3, format: '%H' });
  });

  it('refuses a listing line that is not a commit id', async () => {
    const { adapter } = adapterOver(`${TIP}\nnot-a-sha\n`);

    await expect(adapter.firstParentsSince({ tip: TIP, stopAt: PREDECESSOR, limit: 3 })).rejects.toBeInstanceOf(AdapterValidationError);
  });

  it('reads refs and commits through the history it wraps', async () => {
    const { adapter } = adapterOver('');

    await expect(adapter.readRef('refs/x')).resolves.toBe(TIP);
    await expect(adapter.getNodeInfo(TIP)).resolves.toMatchObject({ sha: TIP });
  });
});

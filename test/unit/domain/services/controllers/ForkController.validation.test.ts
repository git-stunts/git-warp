import { describe, expect, it } from 'vitest';

import ForkError from '../../../../../src/domain/errors/ForkError.ts';
import InMemoryGraphAdapter from '../../../../helpers/InMemoryGraphAdapter.ts';
import { openMemoryRuntimeHostProduct } from '../../../../helpers/MemoryRuntimeHost.ts';

describe('ForkController identity validation', () => {
  it('returns a typed error for an invalid fork writer ID', async () => {
    const persistence = new InMemoryGraphAdapter();
    const runtime = await openMemoryRuntimeHostProduct({
      persistence,
      graphName: 'fork-validation',
      writerId: 'writer-1',
    });
    const at = await runtime.patch((patch) => {
      patch.addNode('node:base');
    });

    await expect(runtime.fork({
      from: 'writer-1',
      at,
      forkName: 'valid-fork-name',
      forkWriterId: '../invalid',
    })).rejects.toMatchObject({
      name: ForkError.name,
      code: 'E_FORK_WRITER_ID_INVALID',
      context: { forkWriterId: '../invalid' },
    });
  });
});

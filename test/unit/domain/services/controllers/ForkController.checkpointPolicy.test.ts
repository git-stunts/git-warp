import { describe, expect, it } from 'vitest';

import InMemoryGraphAdapter from '../../../../helpers/InMemoryGraphAdapter.ts';
import { openMemoryRuntimeHostProduct } from '../../../../helpers/MemoryRuntimeHost.ts';

describe('ForkController checkpoint policy', () => {
  it('preserves an explicit null opt-out in the forked runtime', async () => {
    const persistence = new InMemoryGraphAdapter();
    const runtime = await openMemoryRuntimeHostProduct({
      persistence,
      graphName: 'fork-policy-parent',
      writerId: 'writer-1',
      checkpointPolicy: null,
    });
    const at = await runtime.patch((patch) => {
      patch.addNode('node:base');
    });

    const fork = await runtime.fork({
      from: 'writer-1',
      at,
      forkName: 'fork-policy-child',
      forkWriterId: 'writer-2',
    });

    expect(fork._checkpointPolicy).toBeNull();
  });
});

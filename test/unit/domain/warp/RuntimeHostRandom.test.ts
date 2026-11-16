import { describe, expect, it } from 'vitest';

import HostRandomAdapter from '../../../../src/infrastructure/adapters/HostRandomAdapter.ts';
import InMemoryGraphAdapter from '../../../helpers/InMemoryGraphAdapter.ts';
import { openMemoryRuntimeHostProduct } from '../../../helpers/MemoryRuntimeHost.ts';
import SequenceRandomPort from '../../../helpers/SequenceRandomPort.ts';

/** Seed derived from the bytes 0x00 0x01 0x02 0x03. */
const SEQUENCE_SEED = 33_025;

describe('RuntimeHost entropy composition', () => {
  it('routes runtime index verification through the configured port', async () => {
    const random = new SequenceRandomPort(0);
    const runtime = await openMemoryRuntimeHostProduct({
      persistence: new InMemoryGraphAdapter(),
      graphName: 'runtime-random',
      writerId: 'agent-1',
      random,
    });
    await runtime.patch((patch) => {
      patch.addNode('node:a').addNode('node:b').addEdge('node:a', 'node:b', 'links');
    });
    await runtime.materialize();

    expect(runtime.verifyIndex({ sampleRate: 1 }).seed).toBe(SEQUENCE_SEED);
    expect(random.requests).toEqual([4]);
  });

  it('falls back to the installed host entropy adapter', async () => {
    const runtime = await openMemoryRuntimeHostProduct({
      persistence: new InMemoryGraphAdapter(),
      graphName: 'runtime-random-default',
      writerId: 'agent-1',
    });

    expect(runtime._random).toBeInstanceOf(HostRandomAdapter);
  });
});

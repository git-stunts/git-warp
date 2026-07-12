import { describe, expect, it } from 'vitest';

import { openWarpWorldline } from '../../../src/domain/WarpWorldline.ts';
import InMemoryGraphAdapter from '../../../src/infrastructure/adapters/InMemoryGraphAdapter.ts';
import { openRuntimeHostProduct } from '../../../src/domain/warp/RuntimeHostProduct.ts';

describe('worldline read executable paths', () => {
  it('reads live, historical, and observer-filtered worldlines through public handles', async () => {
    const audit = await openWarpWorldline({
      persistence: new InMemoryGraphAdapter(),
      worldlineName: 'read-api',
      writerId: 'agent-1',
    });

    await audit.commit((patch) => {
      patch
        .addNode('user:alice')
        .setProperty('user:alice', 'name', 'Alice')
        .setProperty('user:alice', 'secret', 'redacted');
    });
    await audit.commit((patch) => {
      patch.addNode('user:bob').setProperty('user:bob', 'name', 'Bob').addNode('internal:salary');
    });

    await expect(audit.live().hasNode('user:bob')).resolves.toBe(true);

    const firstTick = await audit.seek({ source: { kind: 'live', ceiling: 1 } });
    await expect(firstTick.hasNode('user:alice')).resolves.toBe(true);
    await expect(firstTick.hasNode('user:bob')).resolves.toBe(false);

    const publicUsers = await audit.observer('public-users', {
      match: 'user:*',
      expose: ['name'],
      redact: ['secret'],
    });

    await expect(publicUsers.getNodes()).resolves.toEqual(['user:alice', 'user:bob']);
    await expect(publicUsers.getNodeProps('user:alice')).resolves.toEqual({ name: 'Alice' });
    await expect(publicUsers.hasNode('internal:salary')).resolves.toBe(false);
  });

  it('keeps direct runtime reads behind an explicit materialization basis', async () => {
    const runtime = await openRuntimeHostProduct({
      persistence: new InMemoryGraphAdapter(),
      graphName: 'runtime-read-basis',
      writerId: 'agent-1',
    });

    await runtime.patch((patch) => {
      patch.addNode('node:needs-basis');
    });

    await expect(runtime.hasNode('node:needs-basis')).rejects.toMatchObject({
      code: 'E_NO_STATE',
    });

    await runtime.materialize();
    await expect(runtime.hasNode('node:needs-basis')).resolves.toBe(true);
  });
});

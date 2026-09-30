import { execFileSync } from 'node:child_process';
import { expect, it } from 'vitest';
import { Runtime } from '../../../index.ts';
import Intent from '../../../src/domain/api/Intent.ts';
import { createTestRepo } from '../api/helpers/setup.ts';

it('publishes a real removal after reopen, then restores membership without old properties', async () => {
  const repository = await createTestRepo('bounded-node-removal');
  async function write(writer: string, intent: Intent) {
    const runtime = await Runtime.open({ at: repository.tempDir, writer });
    try {
      const receipt = await (await runtime.lane('events')).write(intent);
      expect(receipt.outcome.kind).toBe('derived');
    } finally {
      await runtime.close();
    }
  }
  try {
    await write('alice', Intent.addEntity({ subject: 'n', properties: { color: 'red' } }));
    await write('bob', Intent.removeNode({ subject: 'n' }));
    const reader = await repository.openGraph('events', 'reader');
    const removals = await reader.getWriterPatches('bob');
    expect(removals).toHaveLength(1);
    expect(removals[0]?.patch.ops).toMatchObject([{ type: 'NodeRemove', node: 'n', observedDots: ['alice:1'] }]);
    await write('alice', Intent.addNode({ subject: 'n' }));
    await reader.materialize();
    expect(await reader.hasNode('n')).toBe(true);
    expect(await reader.getNodeProps('n')).not.toHaveProperty('color');
    await write('alice', Intent.setProperty({ subject: 'n', key: 'color', value: 'blue' }));
    await reader.materialize();
    expect(await reader.getNodeProps('n')).toHaveProperty('color', 'blue');
  } finally {
    await repository.cleanup();
  }
});

it('removes all observed writers while preserving an addition from an isolated replica', async () => {
  const a = await createTestRepo('removal-replica-a');
  const b = await createTestRepo('removal-replica-b');
  async function write(at: string, writer: string, intent: Intent) {
    const runtime = await Runtime.open({ at, writer });
    try {
      expect((await (await runtime.lane('events')).write(intent)).outcome.kind).toBe('derived');
    } finally { await runtime.close(); }
  }
  try {
    await write(a.tempDir, 'alice', Intent.addEntity({ subject: 'n', properties: { color: 'red' } }));
    execFileSync('git', ['-C', b.tempDir, 'fetch', a.tempDir, 'refs/warp/*:refs/warp/*'], { stdio: 'pipe' });
    await write(b.tempDir, 'bob', Intent.addNode({ subject: 'n' }));
    await write(a.tempDir, 'carol', Intent.removeNode({ subject: 'n' }));
    const graph = await a.openGraph('events', 'reader');
    const removed = await graph.getWriterPatches('carol');
    expect(removed[0]?.patch.ops).toMatchObject([{ type: 'NodeRemove', observedDots: ['alice:1'] }]);
    execFileSync('git', ['-C', a.tempDir, 'fetch', b.tempDir, 'refs/warp/events/writers/bob:refs/warp/events/writers/bob'], { stdio: 'pipe' });
    await graph.materialize();
    expect(await graph.hasNode('n')).toBe(true);
    expect(await graph.getNodeProps('n')).not.toHaveProperty('color');
    await write(a.tempDir, 'dana', Intent.removeNode({ subject: 'n' }));
    const final = await graph.getWriterPatches('dana');
    expect(final[0]?.patch.ops).toMatchObject([{ type: 'NodeRemove', observedDots: ['bob:1'] }]);
    await graph.materialize();
    expect(await graph.hasNode('n')).toBe(false);
  } finally { await b.cleanup(); await a.cleanup(); }
});

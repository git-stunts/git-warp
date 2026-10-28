import { expect, it, vi } from 'vitest';
import Plumbing from '@git-stunts/plumbing';
import { Runtime, type Intent, type Lane, type ReadingValue } from '../../../index.ts';
import { createManyObserver, intent, reading } from '../../../advanced.ts';
import { createTestRepo } from '../api/helpers/setup.ts';

/**
 * Cost witness (#1039): once a clone's cone basis has folded its history, a
 * public Observation and a public read-before-write cost the same number of
 * Git processes whether the lane holds N or 10N patches.
 */

const CASE_TIMEOUT_MS = 600_000;
const WRITERS = ['alice', 'bob'] as const;

type Measured = { readonly observation: number; readonly nodeRemove: number; readonly edgeRemove: number; readonly blindWrite: number };

async function counted<T>(run: () => Promise<T>): Promise<{ readonly processes: number; readonly result: T }> {
  const execute = vi.spyOn(Plumbing.prototype, 'execute');
  const stream = vi.spyOn(Plumbing.prototype, 'executeStream');
  try {
    const result = await run();
    return { processes: execute.mock.calls.length + stream.mock.calls.length, result };
  } finally {
    execute.mockRestore();
    stream.mockRestore();
  }
}

async function derived(lane: Lane, intents: Intent | Intent[]): Promise<void> {
  expect((await lane.write(intents)).outcome.kind).toBe('derived');
}

async function observe(lane: Lane): Promise<string> {
  const observation = lane.observe(createManyObserver('cost.many', function* plans() {
    yield reading.property({ subject: 'hub', key: 'title' });
    yield reading.node.exists({ subject: 'spoke' });
    yield reading.neighborhood({ subject: 'hub', direction: 'both' });
  }, (value: ReadingValue) => value));
  for await (const _value of observation) { /* drain */ }
  return (await observation.receipt).status;
}

/** Writes `patches` unrelated patches split across two writers, then measures the bounded operations. */
async function scenario(patches: number): Promise<Measured> {
  const repository = await createTestRepo(`cone-cost-${patches}`);
  const runtimes = await Promise.all(WRITERS.map(async (writer) => await Runtime.open({ at: repository.tempDir, writer })));
  try {
    const lanes = await Promise.all(runtimes.map(async (runtime) => await runtime.lane('events')));
    for (let index = 0; index < patches; index += 1) {
      const lane = lanes[index % lanes.length];
      if (lane === undefined) { throw new Error('missing lane'); }
      await derived(lane, [intent.node.add({ subject: `n${index}` }), intent.property.set({ subject: `n${index}`, key: 'i', value: index })]);
    }
    const [alice, bob] = lanes;
    if (alice === undefined || bob === undefined) { throw new Error('missing lanes'); }
    await derived(alice, [intent.node.add({ subject: 'hub' }), intent.node.add({ subject: 'spoke' }),
      intent.property.set({ subject: 'hub', key: 'title', value: 'Hub' }), intent.edge.add({ from: 'hub', to: 'spoke', label: 'has' })]);
    // The first fold of this clone's history is the one cost that grows with history.
    expect(await observe(bob)).toBe('completed');
    const observation = await counted(async () => await observe(bob));
    expect(observation.result).toBe('completed');
    const edgeRemove = await counted(async () => await derived(bob, intent.edge.remove({ from: 'hub', to: 'spoke', label: 'has' })));
    const nodeRemove = await counted(async () => await derived(bob, intent.node.remove({ subject: 'spoke' })));
    const blindWrite = await counted(async () => await derived(bob, intent.property.set({ subject: 'hub', key: 'title', value: 'Hub 2' })));
    return { observation: observation.processes, nodeRemove: nodeRemove.processes, edgeRemove: edgeRemove.processes, blindWrite: blindWrite.processes };
  } finally {
    await Promise.all(runtimes.map(async (runtime) => await runtime.close()));
    await repository.cleanup();
  }
}

it('per-Observation and per-write Git processes do not grow with 10x history', async () => {
  const small = await scenario(20);
  const large = await scenario(200);
  console.log('CONE_PUBLIC_COST', JSON.stringify({ small, large }));
  for (const key of ['observation', 'nodeRemove', 'edgeRemove', 'blindWrite'] as const) {
    expect(large[key], key).toBeLessThanOrEqual(Math.ceil(small[key] * 1.1) + 2);
  }
}, CASE_TIMEOUT_MS);

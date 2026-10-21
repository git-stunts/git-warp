import { describe, expect, it } from 'vitest';

import { openMemoryWarpCore } from '../../helpers/MemoryRuntimeHost.ts';
import InMemoryGraphAdapter from '../../helpers/InMemoryGraphAdapter.ts';
import MintId from '../../../src/domain/crdt/MintId.ts';
import NodeAdd from '../../../src/domain/types/ops/NodeAdd.ts';
import {
  buildAllocationFloorRef,
  buildStrandRef,
  buildStrandWriterRef,
} from '../../../src/domain/utils/RefLayout.ts';
import { textDecode } from '../../../src/domain/utils/bytes.ts';

const GRAPH = 'worldline-identity';

async function open(persistence: InMemoryGraphAdapter, writerId: string) {
  return await openMemoryWarpCore({ persistence, graphName: GRAPH, writerId });
}

type Core = Awaited<ReturnType<typeof open>>;

async function addDots(core: Core, strandId: string): Promise<string[]> {
  const entries = await core.getStrandPatches(strandId);
  return entries.flatMap(({ patch }) => patch.ops
    .filter((op): op is NodeAdd => op instanceof NodeAdd)
    .map((op) => `${op.dot.writerId}:${op.dot.counter}`));
}

async function floorCounter(persistence: InMemoryGraphAdapter, writerId: string): Promise<number> {
  const oid = await persistence.readRef(buildAllocationFloorRef(GRAPH, writerId));
  const text = oid === null ? '' : textDecode(await persistence.readBlob(oid));
  return Number(/counter: (\d+)/.exec(text)?.[1] ?? 0);
}

describe('worldline identity (#1014)', () => {
  it('gives a lane writer and a strand of the same name distinct dots', async () => {
    const persistence = new InMemoryGraphAdapter();
    const next = await open(persistence, 'next');
    await next.patch((patch) => { patch.addNode('lane:1'); });
    const strand = await next.createStrand({ name: 'next' });
    await next.patchStrand('next', (patch) => { patch.addNode('strand:1'); });

    const strandDots = await addDots(next, strand.strandId);
    expect(strandDots).toContain(`${MintId.strand('next', strand.strandId).encode()}:1`);
    expect(strandDots).toContain('next:1');
    expect(new Set(strandDots).size).toBe(strandDots.length);
  });

  it('advances one chain ref per writer on a shared strand, and never shares a dot', async () => {
    const persistence = new InMemoryGraphAdapter();
    const alice = await open(persistence, 'alice');
    await alice.patch((patch) => { patch.addNode('base:1'); });
    const { strandId } = await alice.createStrand({ name: 'work' });
    const bob = await open(persistence, 'bob');

    await alice.patchStrand('work', (patch) => { patch.addNode('alice:node'); });
    await bob.patchStrand('work', (patch) => { patch.addNode('bob:node'); });

    expect(await persistence.readRef(buildStrandWriterRef(GRAPH, strandId, 'alice'))).not.toBeNull();
    expect(await persistence.readRef(buildStrandWriterRef(GRAPH, strandId, 'bob'))).not.toBeNull();
    const dots = await addDots(bob, strandId);
    expect(dots).toEqual(expect.arrayContaining([
      `${MintId.strand('alice', strandId).encode()}:1`,
      `${MintId.strand('bob', strandId).encode()}:1`,
    ]));
    expect(new Set(dots).size).toBe(dots.length);
    const state = await bob.materializeStrand('work');
    expect(state.nodeAlive.contains('alice:node') && state.nodeAlive.contains('bob:node')).toBe(true);
  });

  it('never reuses a strand id: recreating a name under identical inputs gets a new id', async () => {
    const persistence = new InMemoryGraphAdapter();
    const alice = await open(persistence, 'alice');
    const first = await alice.createStrand({ name: 'next' });
    await alice.dropStrand('next');
    const second = await alice.createStrand({ name: 'next' });

    expect(first.strandId).toMatch(/^[0-9a-f]{64}$/);
    expect(second.strandId).not.toBe(first.strandId);
    expect(second.genesis.occurrence).toBeGreaterThan(first.genesis.occurrence);
    expect(await persistence.readRef(buildStrandRef(GRAPH, first.strandId))).toBeNull();
  });

  it('keeps the strand id and its mint ids when the strand is renamed', async () => {
    const persistence = new InMemoryGraphAdapter();
    const alice = await open(persistence, 'alice');
    const { strandId } = await alice.createStrand({ name: 'draft' });
    await alice.patchStrand('draft', (patch) => { patch.addNode('n:1'); });

    const renamed = await alice.renameStrand('draft', 'final');
    await alice.patchStrand('final', (patch) => { patch.addNode('n:2'); });

    expect(renamed).toMatchObject({ strandId, name: 'final' });
    expect(await alice.getStrand('draft')).toBeNull();
    const mint = MintId.strand('alice', strandId).encode();
    expect(await addDots(alice, strandId)).toEqual([`${mint}:1`, `${mint}:2`]);
  });

  it('returns the same strand for a retried creation token without reserving again', async () => {
    const persistence = new InMemoryGraphAdapter();
    const alice = await open(persistence, 'alice');
    const created = await alice.createStrand({ name: 'retry' });
    const reserved = await floorCounter(persistence, 'alice');

    const retried = await alice.createStrand({ name: 'retry', creationToken: created.genesis.occurrence });

    expect(retried.strandId).toBe(created.strandId);
    expect(await floorCounter(persistence, 'alice')).toBe(reserved);
  });

  it('persists the creation occurrence as a lane reservation the writer never reissues', async () => {
    const persistence = new InMemoryGraphAdapter();
    const alice = await open(persistence, 'alice');
    const { genesis } = await alice.createStrand({ name: 'reserve' });
    await alice.patch((patch) => { patch.addNode('lane:after'); });

    const laneDots = (await alice.getWriterPatches('alice')).flatMap(({ patch }) => patch.ops
      .filter((op): op is NodeAdd => op instanceof NodeAdd)
      .map((op) => op.dot.counter));
    expect(genesis.creator).toBe('alice');
    expect(laneDots.every((counter) => counter > genesis.occurrence)).toBe(true);
  });

  it('keeps names unique per clone and still resolves a strand by id', async () => {
    const persistence = new InMemoryGraphAdapter();
    const alice = await open(persistence, 'alice');
    const first = await alice.createStrand({ name: 'a' });
    const second = await alice.createStrand({ name: 'b' });
    await alice.renameStrand(second.strandId, 'c');

    await expect(alice.createStrand({ name: 'a' })).rejects.toMatchObject({ code: 'E_STRAND_ALREADY_EXISTS' });
    await expect(alice.renameStrand('c', 'a')).rejects.toMatchObject({ code: 'E_STRAND_ALREADY_EXISTS' });
    await expect(alice.getStrand(first.strandId)).resolves.toMatchObject({ name: 'a' });
  });

  it('resolves braid names before refusing self-braids and duplicates', async () => {
    const persistence = new InMemoryGraphAdapter();
    const alice = await open(persistence, 'alice');
    const target = await alice.createStrand({ name: 'target' });
    const support = await alice.createStrand({ name: 'support' });

    await expect(alice.braidStrand('target', { braidedStrandIds: ['target'] }))
      .rejects.toMatchObject({ code: 'E_STRAND_BRAID_SELF' });
    const braided = await alice.braidStrand(target.strandId, { braidedStrandIds: ['support', support.strandId] });
    expect(braided.braid.readOverlays.map((overlay) => overlay.strandId)).toEqual([support.strandId]);
  });

  it('refuses an empty strand reference', async () => {
    const alice = await open(new InMemoryGraphAdapter(), 'alice');

    await expect(alice.getStrand('')).rejects.toMatchObject({ code: 'E_STRAND_ID_INVALID' });
  });

  it('reads the pinned base for a writer with no chain on a strand others wrote to', async () => {
    const persistence = new InMemoryGraphAdapter();
    const alice = await open(persistence, 'alice');
    await alice.patch((patch) => { patch.addNode('base:1'); });
    await alice.createStrand({ name: 'work' });
    await alice.patchStrand('work', (patch) => { patch.addNode('strand:1'); });
    await alice.patch((patch) => { patch.addNode('lane:after-fork'); });

    const reader = await open(persistence, 'reader');
    const state = await reader.materializeStrand('work');

    expect([...state.nodeAlive.elements()].sort()).toEqual(['base:1', 'strand:1']);
  });
});

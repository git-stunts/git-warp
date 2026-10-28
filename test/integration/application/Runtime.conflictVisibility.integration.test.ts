import { execFileSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Runtime, type Intent, type Lane, type ReadingValue, type WriteReceipt } from '../../../index.ts';
import { createObserver, intent, reading } from '../../../advanced.ts';
import { receiptEnvelope } from '../../../bin/presenters/V19ReadingReceipt.ts';
import { createTestRepo } from '../api/helpers/setup.ts';

/**
 * Conflict visibility (#1039, slice 6) through the public Runtime on real
 * repositories that exchange writer chains with a hub using exactly the
 * sync.md refspecs. Concurrent replacements of one comment body both stay
 * visible as siblings of the LWW value on every clone until a write that
 * observed them all; a write over a fetched value it never read is plural;
 * an edit racing a delete is reported on both clones.
 */

const LANE = 'margins';
type Clone = Awaited<ReturnType<typeof createTestRepo>> & { readonly writer: string };
type Observed = { readonly value: ReadingValue; readonly plurality: readonly object[] };

function git(cwd: string, args: readonly string[]): string {
  return execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8', stdio: 'pipe' });
}

/** sync.md "Publish": this clone's own chain and the substrate marker, atomically and fast-forward only. */
function publish(clone: Clone, hub: string): void {
  const chain = `refs/warp/${LANE}/writers/${clone.writer}`;
  const marker = `refs/warp/${LANE}/substrate-version`;
  git(clone.tempDir, ['push', '--quiet', '--atomic', hub, `${chain}:${chain}`, `${marker}:${marker}`]);
}

/** sync.md "Receive other writers": the marker and every other writer's chain, without pruning. */
function receive(clone: Clone, hub: string): void {
  const marker = `refs/warp/${LANE}/substrate-version`;
  git(clone.tempDir, ['fetch', '--quiet', '--no-prune', '--no-tags', hub, `${marker}:${marker}`,
    `refs/warp/${LANE}/writers/*:refs/warp/${LANE}/writers/*`, `^refs/warp/${LANE}/writers/${clone.writer}`]);
}

async function withLane<T>(clone: Clone, run: (lane: Lane) => Promise<T>): Promise<T> {
  const runtime = await Runtime.open({ at: clone.tempDir, writer: clone.writer });
  try {
    return await run(await runtime.lane(LANE));
  } finally {
    await runtime.close();
  }
}

async function write(clone: Clone, intents: Intent | Intent[]): Promise<WriteReceipt<Intent | Intent[]>> {
  return await withLane(clone, async (lane) => await lane.write(intents));
}

async function observe(clone: Clone, plan: ReturnType<typeof reading.property>): Promise<Observed> {
  return await withLane(clone, async (lane) => {
    const observation = lane.observe(createObserver('margins.one', plan, (value: ReadingValue) => value));
    const readings: Observed[] = [];
    for await (const item of observation) {
      readings.push({ value: item.value, plurality: item.plurality });
    }
    expect((await observation.receipt).status).toBe('completed');
    return readings[0] ?? { value: null, plurality: [] };
  });
}

const BODY = reading.property({ subject: 'comment:1', key: 'body' });
const EXISTS = reading.node.exists({ subject: 'comment:1' });

describe('Runtime conflict visibility (#1039)', () => {
  let hub: string;
  let alice: Clone;
  let bob: Clone;

  beforeEach(async () => {
    hub = await mkdtemp(join(tmpdir(), 'warp-conflict-hub-'));
    git(hub, ['init', '--quiet', '--bare']);
    alice = { ...await createTestRepo('conflict-alice'), writer: 'alice' };
    bob = { ...await createTestRepo('conflict-bob'), writer: 'bob' };
    expect((await write(alice, [
      intent.node.add({ subject: 'comment:1' }),
      intent.property.set({ subject: 'comment:1', key: 'body', value: 'first draft' }),
    ])).outcome.kind).toBe('derived');
    publish(alice, hub);
    receive(bob, hub);
    expect(await observe(bob, BODY)).toEqual({ value: 'first draft', plurality: [] });
  });

  afterEach(async () => {
    await alice.cleanup();
    await bob.cleanup();
    await rm(hub, { recursive: true, force: true });
  });

  function sync(): void {
    publish(alice, hub);
    publish(bob, hub);
    receive(alice, hub);
    receive(bob, hub);
  }

  it('reports two concurrent replacements of one body as siblings on both clones until an observing write', async () => {
    const aliceEdit = await write(alice, intent.property.set({ subject: 'comment:1', key: 'body', value: 'alice edit' }));
    const bobEdit = await write(bob, intent.property.set({ subject: 'comment:1', key: 'body', value: 'bob edit' }));
    expect([aliceEdit.outcome.kind, bobEdit.outcome.kind]).toEqual(['derived', 'derived']);
    sync();

    const atAlice = await observe(alice, BODY);
    const atBob = await observe(bob, BODY);
    expect(atAlice).toEqual(atBob);
    const winner = atAlice.value === 'bob edit' ? 'bob' : 'alice';
    const loser = winner === 'bob' ? 'alice' : 'bob';
    expect(atAlice.plurality).toEqual([expect.objectContaining({
      kind: 'register', subject: 'comment:1', key: 'body', overflow: 0, causality: 'observed',
      winner: { writer: winner, value: `${winner} edit` },
      siblings: [{ writer: loser, value: `${loser} edit` }],
    })]);

    const merged = await write(alice, intent.property.set({ subject: 'comment:1', key: 'body', value: 'merged' }));
    expect(merged.outcome.kind).toBe('derived');
    expect(merged.plurality).toEqual([]);
    sync();
    expect(await observe(alice, BODY)).toEqual({ value: 'merged', plurality: [] });
    expect(await observe(bob, BODY)).toEqual({ value: 'merged', plurality: [] });
  });

  it('admits a write over a fetched value it never read as plural, with a witness naming both coordinates', async () => {
    await write(alice, intent.property.set({ subject: 'comment:1', key: 'body', value: 'alice edit' }));
    publish(alice, hub);
    receive(bob, hub);
    const blind = await write(bob, intent.property.set({ subject: 'comment:1', key: 'body', value: 'bob edit' }));
    expect(blind.outcome.kind).toBe('plural');
    if (blind.outcome.kind !== 'plural') { throw new Error('expected a plural admission'); }
    expect(blind.outcome.witness.retainedCoordinates).toHaveLength(2);
    expect(blind.outcome.residual.coordinates).toEqual(blind.outcome.witness.retainedCoordinates);
    expect(blind.plurality).toEqual([expect.objectContaining({
      kind: 'register', winner: { writer: 'bob', value: 'bob edit' }, siblings: [{ writer: 'alice', value: 'alice edit' }],
    })]);
    expect(receiptEnvelope(blind)).toMatchObject({
      outcome: { kind: 'plural' }, plurality: [{ kind: 'register', siblings: [{ writer: 'alice', value: 'alice edit' }] }],
    });
    sync();
    const atAlice = await observe(alice, BODY);
    expect(atAlice).toEqual(await observe(bob, BODY));
    expect(atAlice).toMatchObject({ value: 'bob edit', plurality: [{ siblings: [{ writer: 'alice', value: 'alice edit' }] }] });
    expect((await write(bob, intent.property.set({ subject: 'comment:1', key: 'body', value: 'resolved' }))).outcome.kind).toBe('derived');
    sync();
    expect(await observe(alice, BODY)).toEqual({ value: 'resolved', plurality: [] });
  });

  it('reports an edit racing a delete on both clones', async () => {
    expect((await write(bob, intent.node.remove({ subject: 'comment:1' }))).outcome.kind).toBe('derived');
    expect((await write(alice, intent.property.set({ subject: 'comment:1', key: 'body', value: 'late edit' }))).outcome.kind).toBe('derived');
    sync();
    const lifecycle = { kind: 'lifecycle', element: { kind: 'node', subject: 'comment:1' }, removedBy: ['bob'], editedBy: ['alice'] };
    for (const clone of [alice, bob]) {
      expect(await observe(clone, EXISTS)).toEqual({ value: false, plurality: [expect.objectContaining(lifecycle)] });
      expect(await observe(clone, BODY)).toEqual({ value: null, plurality: [expect.objectContaining(lifecycle)] });
    }
  });
});

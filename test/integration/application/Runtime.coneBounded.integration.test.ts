import { execFileSync } from 'node:child_process';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Runtime, type ContentAttachment, type Intent, type Lane, type ReadingValue } from '../../../index.ts';
import {
  captureCoordinate,
  createEdgeContentObserver,
  createManyObserver,
  createNodeContentObserver,
  createObserver,
  intent,
  reading,
} from '../../../advanced.ts';
import ContentAddressableStore from '@git-stunts/git-cas';
import { Dot } from '../../../src/domain/crdt/Dot.ts';
import NodeAdd from '../../../src/domain/types/ops/NodeAdd.ts';
import NodeRemove from '../../../src/domain/types/ops/NodeRemove.ts';
import Patch from '../../../src/domain/types/Patch.ts';
import { CborPatchJournalAdapter } from '../../../src/infrastructure/adapters/CborPatchJournalAdapter.ts';
import GitCasAssetStorageAdapter from '../../../src/infrastructure/adapters/GitCasAssetStorageAdapter.ts';
import codec from '../../../src/infrastructure/codecs/CborCodec.ts';
import { createTestRepo } from '../api/helpers/setup.ts';

/**
 * Public Lane reads run on the lane's cone records (#1039): no checkpoint,
 * no repair step and no whole-state materialization, across clones that
 * exchange writer chains with plain Git fetches.
 */

const LANE = 'events';

type Clone = Awaited<ReturnType<typeof createTestRepo>>;

function identity(value: ReadingValue): ReadingValue {
  return value;
}

/** Fetches every writer chain of `from` into `into`, as a Git remote would. */
function fetchWriters(into: Clone, from: Clone): void {
  execFileSync('git', ['-C', into.tempDir, 'fetch', '--quiet', from.tempDir,
    `refs/warp/${LANE}/writers/*:refs/warp/${LANE}/writers/*`,
    `refs/warp/${LANE}/substrate-version:refs/warp/${LANE}/substrate-version`], { stdio: 'pipe' });
}

async function withLane<T>(clone: Clone, writer: string, run: (lane: Lane) => Promise<T>): Promise<T> {
  const runtime = await Runtime.open({ at: clone.tempDir, writer });
  try {
    return await run(await runtime.lane(LANE));
  } finally {
    await runtime.close();
  }
}

async function write(lane: Lane, intents: Intent | Intent[]): Promise<void> {
  const receipt = await lane.write(intents);
  expect(receipt.outcome.kind, JSON.stringify(receipt.repairHints)).toBe('derived');
}

async function observeOne(lane: Lane, plan: ReturnType<typeof reading.property>): Promise<{ value: ReadingValue; status: string }> {
  const observation = lane.observe(createObserver('cone.one', plan, identity));
  const values: ReadingValue[] = [];
  for await (const value of observation) {
    values.push(value.value);
  }
  const receipt = await observation.receipt;
  return { value: values[0] ?? null, status: receipt.status };
}

async function neighbours(lane: Lane, subject: string, direction: 'in' | 'out' | 'both' = 'out'): Promise<ReadingValue> {
  const result = await observeOne(lane, reading.neighborhood({ subject, direction }));
  expect(result.status).toBe('completed');
  return result.value;
}

async function text(content: ContentAttachment | null): Promise<string> {
  if (content === null) { throw new Error('Expected attachment'); }
  const decoder = new TextDecoder();
  let result = '';
  for await (const chunk of content.open()) { result += decoder.decode(chunk, { stream: true }); }
  return result + decoder.decode();
}

describe('Runtime cone-bounded public reads', () => {
  let a: Clone;
  let b: Clone;
  beforeEach(async () => {
    a = await createTestRepo('cone-a');
    b = await createTestRepo('cone-b');
  });
  afterEach(async () => {
    await b.cleanup();
    await a.cleanup();
  });

  it('reads every Reading kind right after writes, with no checkpoint, across fetched clones', async () => {
    await withLane(a, 'alice', async (lane) => {
      await write(lane, [
        intent.node.add({ subject: 'doc' }), intent.node.add({ subject: 'tag' }),
        intent.property.set({ subject: 'doc', key: 'title', value: 'Draft' }),
        intent.edge.add({ from: 'doc', to: 'tag', label: 'tagged' }),
      ]);
      expect(await observeOne(lane, reading.property({ subject: 'doc', key: 'title' }))).toEqual({ value: 'Draft', status: 'completed' });
      expect(await observeOne(lane, reading.node.exists({ subject: 'tag' }))).toEqual({ value: true, status: 'completed' });
      expect(await neighbours(lane, 'doc')).toMatchObject({ edges: [{ direction: 'out', neighborId: 'tag', label: 'tagged' }], completeness: 'complete' });
    });
    expect(execFileSync('git', ['-C', a.tempDir, 'for-each-ref', 'refs/warp/'], { encoding: 'utf8' })).not.toContain('checkpoints');
    fetchWriters(b, a);
    await withLane(b, 'bob', async (lane) => {
      await write(lane, [
        intent.node.add({ subject: 'note' }), intent.edge.add({ from: 'note', to: 'doc', label: 'about' }),
        intent.property.set({ subject: 'doc', key: 'title', value: 'Final' }),
      ]);
      expect(await observeOne(lane, reading.property({ subject: 'doc', key: 'title' }))).toEqual({ value: 'Final', status: 'completed' });
      expect(await neighbours(lane, 'doc', 'both')).toMatchObject({
        edges: [{ direction: 'in', neighborId: 'note', label: 'about' }, { direction: 'out', neighborId: 'tag', label: 'tagged' }],
      });
    });
    fetchWriters(a, b);
    await withLane(a, 'alice', async (lane) => {
      expect(await observeOne(lane, reading.property({ subject: 'doc', key: 'title' }))).toEqual({ value: 'Final', status: 'completed' });
    });
  });

  it('attaches content to a node born in the same write and reads it back from cone records', async () => {
    await withLane(a, 'alice', async (lane) => {
      const content = await lane.stageContent('hello cone', { mime: 'text/plain' });
      await write(lane, [intent.node.add({ subject: 'file' }), intent.node.attachContent({ subject: 'file', content })]);
      const node = await lane.observe(createNodeContentObserver({ subject: 'file' })).one();
      expect(node.value).toMatchObject({ size: 10, mime: 'text/plain', owner: { kind: 'node', subject: 'file' } });
      expect(await text(node.value)).toBe('hello cone');
      await write(lane, [intent.node.add({ subject: 'other' }), intent.edge.add({ from: 'file', to: 'other', label: 'see' })]);
      const edgeContent = await lane.stageContent('edge bytes');
      await write(lane, intent.edge.attachContent({ from: 'file', to: 'other', label: 'see', content: edgeContent }));
      expect(await text((await lane.observe(createEdgeContentObserver({ from: 'file', to: 'other', label: 'see' })).one()).value)).toBe('edge bytes');
      await write(lane, intent.node.remove({ subject: 'other' }));
      expect((await lane.observe(createEdgeContentObserver({ from: 'file', to: 'other', label: 'see' })).one()).value).toBeNull();
    });
  });

  it('shares one cone basis between every Reading of an Observation and of a captured coordinate', async () => {
    await withLane(a, 'alice', async (lane) => {
      await write(lane, [intent.node.add({ subject: 'p' }), intent.property.set({ subject: 'p', key: 'k', value: 1 })]);
      const many = lane.observe(createManyObserver('cone.many', function* plans() {
        yield reading.property({ subject: 'p', key: 'k' });
        yield reading.node.exists({ subject: 'p' });
      }, identity));
      const ticks = new Set<string | undefined>();
      for await (const value of many) {
        ticks.add(value.coordinate.tick?.id);
      }
      expect(ticks.size).toBe(1);
      expect(ticks.has(undefined)).toBe(false);
      const coordinate = await captureCoordinate(lane);
      expect(coordinate.checkpointSha).toBeNull();
      expect(coordinate.coneRoot).not.toBeNull();
      await write(lane, intent.property.set({ subject: 'p', key: 'k', value: 2 }));
      const pinned = await coordinate.optic().node('p').prop('k').read();
      expect(pinned.value).toBe(1);
      expect(pinned.readIdentity).toMatchObject({ kind: 'cone-read', coneRoot: coordinate.coneRoot });
      const live = await (await captureCoordinate(lane)).optic().node('p').prop('k').read();
      expect(live.value).toBe(2);
      const traversal = await coordinate.optic().traversal('p').read({ maxDepth: 2, maxNodes: 4, maxEdges: 4 });
      expect(traversal).toMatchObject({ completeness: 'complete', visitedNodeIds: ['p'] });
    });
  });

  it('reports a shared-dot history as obstructed Observations with a repair hint, never a throw or a materialization', async () => {
    await withLane(a, 'alice', async (lane) => { await write(lane, intent.node.add({ subject: 'seed' })); });
    await appendRaw(a, 'mallory', [new Patch({ writer: 'mallory', lamport: 1, context: {}, ops: [
      new NodeAdd('x', new Dot('mallory', 1)), new NodeAdd('y', new Dot('mallory', 1)),
    ] }), new Patch({ writer: 'mallory', lamport: 2, context: {}, ops: [new NodeRemove('x', ['mallory:1'])] })]);
    await withLane(a, 'alice', async (lane) => {
      const observation = lane.observe(createObserver('cone.blocked', reading.property({ subject: 'seed', key: 'k' }), identity));
      const values: ReadingValue[] = [];
      for await (const value of observation) { values.push(value.value); }
      expect(values).toEqual([]);
      expect(await observation.receipt).toMatchObject({
        status: 'obstructed', reason: 'cone_shared_dot', repairHints: [{ code: 'repair_duplicate_dot' }],
      });
      expect(await lane.observe(createNodeContentObserver({ subject: 'seed' })).receipt).toMatchObject({
        status: 'obstructed', reason: 'cone_shared_dot',
      });
      await expect(captureCoordinate(lane)).rejects.toMatchObject({ code: 'E_OPTIC_CONE_OBSTRUCTED' });
    });
  });
});

/** Appends patches to a writer chain directly, bypassing the dot mint, to build a #1022-shaped history. */
async function appendRaw(clone: Clone, writer: string, patches: readonly Patch[]): Promise<void> {
  const cas = ContentAddressableStore.createCbor({ plumbing: clone.plumbing, applicationRefPrefixes: ['refs/warp/'] });
  const journal = new CborPatchJournalAdapter({
    assetStorage: new GitCasAssetStorageAdapter({ cas }), cas, codec, commitReader: clone.persistence, graph: LANE,
  });
  const targetRef = `refs/warp/${LANE}/writers/${writer}`;
  for (const patch of patches) {
    const head = await clone.persistence.readRef(targetRef);
    await journal.appendPatch({ patch, graph: LANE, writer, targetRef, expectedHead: head, parent: head, attachments: [] });
  }
}

import { describe, expect, it } from 'vitest';
import PatchEntry from '../../../../../src/domain/artifacts/PatchEntry.ts';
import { Dot } from '../../../../../src/domain/crdt/Dot.ts';
import ConeFold from '../../../../../src/domain/services/cone/ConeFold.ts';
import ConeFolded from '../../../../../src/domain/services/cone/ConeFolded.ts';
import ConeFoldSession from '../../../../../src/domain/services/cone/ConeFoldSession.ts';
import ConeReader from '../../../../../src/domain/services/cone/ConeReader.ts';
import ConeConcurrency from '../../../../../src/domain/services/cone/ConeConcurrency.ts';
import ConeConcurrencyRecovery from '../../../../../src/domain/services/cone/ConeConcurrencyRecovery.ts';
import ConeConcurrentSet from '../../../../../src/domain/services/cone/ConeConcurrentSet.ts';
import ConeConcurrentValue from '../../../../../src/domain/services/cone/ConeConcurrentValue.ts';
import ConeEvictedValue from '../../../../../src/domain/services/cone/ConeEvictedValue.ts';
import ConeNodeRecord from '../../../../../src/domain/services/cone/ConeNodeRecord.ts';
import ConeEdgeRecord from '../../../../../src/domain/services/cone/ConeEdgeRecord.ts';
import ConeRecoveryObstruction from '../../../../../src/domain/services/cone/ConeRecoveryObstruction.ts';
import ConeIngest from '../../../../../src/domain/services/cone/ConeIngest.ts';
import ConeIngestAdvanced from '../../../../../src/domain/services/cone/ConeIngestAdvanced.ts';
import ConeIngestObstructed from '../../../../../src/domain/services/cone/ConeIngestObstructed.ts';
import ConeBasisHead from '../../../../../src/domain/services/cone/ConeBasisHead.ts';
import LaneConeScope from '../../../../../src/domain/services/cone/LaneConeScope.ts';
import type { ConeRecord } from '../../../../../src/domain/services/cone/ConeRecord.ts';
import ConeRoot from '../../../../../src/domain/services/cone/ConeRoot.ts';
import { encodeEdgeKey, encodeLegacyEdgePropNode } from '../../../../../src/domain/services/KeyCodec.ts';
import ObservedWriteFrontier from '../../../../../src/domain/types/ObservedWriteFrontier.ts';
import ObservedWriterHead from '../../../../../src/domain/types/ObservedWriterHead.ts';
import Patch from '../../../../../src/domain/types/Patch.ts';
import EdgeAdd from '../../../../../src/domain/types/ops/EdgeAdd.ts';
import EdgePropSet from '../../../../../src/domain/types/ops/EdgePropSet.ts';
import NodeAdd from '../../../../../src/domain/types/ops/NodeAdd.ts';
import NodePropSet from '../../../../../src/domain/types/ops/NodePropSet.ts';
import { EventId } from '../../../../../src/domain/utils/EventId.ts';
import PropSet from '../../../../../src/domain/types/ops/PropSet.ts';
import ConeRecordCborCodec from '../../../../../src/infrastructure/adapters/ConeRecordCborCodec.ts';
import { CborCodec } from '../../../../../src/infrastructure/codecs/CborCodec.ts';
import InMemoryConeRecordStore from '../../../../helpers/InMemoryConeRecordStore.ts';
import MemoryConeFeed from '../../../../helpers/MemoryConeFeed.ts';

const sha = (n: number): string => n.toString(16).padStart(40, '0');
const base = new PatchEntry({ sha: sha(1), patch: new Patch({ writer: 'base', lamport: 1,
  context: {}, ops: [new NodeAdd('n', new Dot('base', 1)), new NodeAdd('m', new Dot('base', 2)),
    new EdgeAdd({ from: 'n', to: 'm', label: 'rel', dot: new Dot('base', 3) })],
  observedFrontier: new ObservedWriteFrontier('lane', []) }) });
const writes = Array.from({ length: 17 }, (_unused, i) => new PatchEntry({ sha: sha(i + 2),
  patch: new Patch({ writer: `w${i}`, lamport: i + 2, context: {}, ops: [new NodePropSet('n', 'title', `v${i}`),
    new EdgePropSet({ from: 'n', to: 'm', label: 'rel', key: 'weight', value: `v${i}` })],
  observedFrontier: new ObservedWriteFrontier('lane', [new ObservedWriterHead('base', base.sha, 1)]) }) }));
const first = writes[0];
if (first === undefined) throw new Error('Missing fixture write');
const partial = new PatchEntry({ sha: sha(99), patch: new Patch({ writer: 'later', lamport: 99,
  context: {}, ops: [new NodePropSet('n', 'title', 'later'), new EdgePropSet({ from: 'n', to: 'm', label: 'rel', key: 'weight', value: 'later' })],
  observedFrontier: new ObservedWriteFrontier('lane', [new ObservedWriterHead('base', base.sha, 1),
    ...writes.slice(1).map((entry) => new ObservedWriterHead(entry.patch.writer, entry.sha, entry.patch.lamport))]) }) });

class RecoveryFeed extends MemoryConeFeed {
  readonly reads: EventId[] = [];
  readonly source = new Map([base, ...writes, partial].map((entry) => [entry.sha, entry]));

  constructor() { super('lane'); }

  override async patchAt(lane: string, event: EventId): Promise<PatchEntry | ConeRecoveryObstruction> {
    expect(lane).toBe('lane');
    this.reads.push(event);
    const entry = this.source.get(event.patchSha);
    return entry ?? new ConeRecoveryObstruction(event, 'unavailable');
  }
}

class ReloadingStore extends InMemoryConeRecordStore {
  readonly codec = new ConeRecordCborCodec(new CborCodec());

  override async writeRecords(root: ConeRoot, records: readonly ConeRecord[]): Promise<ConeRoot> {
    return super.writeRecords(root, records.map((record) => this.codec.decode(this.codec.encode(record))));
  }
}

async function folded(entries: readonly PatchEntry[], split: boolean) {
  const feed = new RecoveryFeed();
  const store = new ReloadingStore();
  let root = ConeRoot.empty();
  let session = new ConeFoldSession({ store, root, source: { feed, lane: 'lane' } });
  for (const entry of entries) {
    expect(await ConeFold.fold(session, entry)).toBeInstanceOf(ConeFolded);
    if (split) {
      root = await session.commit();
      session = new ConeFoldSession({ store, root, source: { feed, lane: 'lane' } });
    }
  }
  root = await session.commit();
  const reader = new ConeReader(store);
  return { feed, store, node: await reader.node(root, 'n'), edge: await reader.edge(root, encodeEdgeKey('n', 'm', 'rel')) };
}

describe('bounded cone recovery after partial retirement', () => {
  it.each([false, true])('converges on node and edge values after two causal arrival orders (split: %s)', async (split) => {
    const early = await folded([base, ...writes, partial], split);
    const late = await folded([base, ...writes.slice(1), partial, first], split);
    expect(early.node.concurrency.equals(late.node.concurrency)).toBe(true);
    expect(early.node.concurrency.register('title').members.map((member) => member.value)).toEqual(['later', 'v0']);
    expect(early.edge.concurrency.register('weight').members.map((member) => member.value)).toEqual(['later', 'v0']);
    expect(early.edge.concurrency.equals(late.edge.concurrency)).toBe(true);
    expect(early.node.concurrency.lifecycle.overflow).toBe(0);
    expect(early.feed.reads.map((event) => [event.patchSha, event.opIndex])).toEqual([[first.sha, 0], [first.sha, 1]]);
    expect(late.feed.reads).toEqual([]);
  });

  it.each([false, true])('encodes identical node and edge records (split: %s)', async (split) => {
    const early = await folded([base, ...writes, partial], split);
    const late = await folded([base, ...writes.slice(1), partial, first], split);
    expect(early.store.codec.encode(early.node)).toEqual(late.store.codec.encode(late.node));
    expect(early.store.codec.encode(early.edge)).toEqual(late.store.codec.encode(late.edge));
  });
});

describe('cone recovery refuses missing or inconsistent source evidence', () => {
  it.each(['source-required', 'unavailable'])('stages nothing when source is %s', async (reason) => {
    const before = await folded([base, ...writes], true);
    const root = await before.store.writeRecords(ConeRoot.empty(), [before.node, before.edge]);
    before.feed.source.delete(first.sha);
    const source = reason === 'source-required' ? {} : { source: { feed: before.feed, lane: 'lane' } };
    const session = new ConeFoldSession({ store: before.store, root, ...source });
    expect(await ConeFold.fold(session, partial)).toMatchObject({ code: 'E_CONE_RECOVERY', reason });
    expect((await session.commit()).equals(root)).toBe(true);
  });

  it.each(['sha', 'writer', 'clock', 'owner', 'key', 'index', 'edge'])('stages nothing for a mismatched source %s', async (field) => {
    const before = await folded([base, ...writes], true);
    const root = await before.store.writeRecords(ConeRoot.empty(), [before.node, before.edge]);
    const original = first.patch;
    const ops = field === 'owner' ? [new NodePropSet('other', 'title', 'v0')]
      : field === 'key' ? [new NodePropSet('n', 'other', 'v0')]
      : field === 'index' ? [new NodePropSet('n', 'title', 'old'), new NodePropSet('n', 'title', 'v0')]
      : field === 'edge' ? [new NodePropSet('n', 'title', 'v0'), new EdgePropSet({ from: 'other', to: 'm', label: 'rel', key: 'weight', value: 'v0' })]
      : original.ops;
    before.feed.source.set(first.sha, new PatchEntry({ sha: field === 'sha' ? sha(999) : first.sha,
      patch: new Patch({ writer: field === 'writer' ? 'other' : original.writer, lamport: field === 'clock' ? 55 : original.lamport,
        context: {}, ops, observedFrontier: original.observedFrontier }) }));
    const session = new ConeFoldSession({ store: before.store, root, source: { feed: before.feed, lane: 'lane' } });
    expect(await ConeFold.fold(session, partial)).toMatchObject({ code: 'E_CONE_RECOVERY', reason: 'inconsistent' });
    expect((await session.commit()).equals(root)).toBe(true);
  });

  it('keeps the published head unchanged when recovery obstructs an advance or committed fold', async () => {
    const feed = new RecoveryFeed();
    for (const entry of [base, ...writes]) feed.chains.set(entry.patch.writer, [entry]);
    const store = new ReloadingStore();
    const ingest = new ConeIngest({ feed, store, scope: new LaneConeScope('lane') });
    expect(await ingest.advance()).toBeInstanceOf(ConeIngestAdvanced);
    const head = ConeBasisHead.forLane('lane');
    const before = await store.readBasis(head);
    feed.chains.set(partial.patch.writer, [partial]);
    feed.source.delete(first.sha);
    expect(await ingest.advance()).toBeInstanceOf(ConeIngestObstructed);
    expect(await store.readBasis(head)).toBe(before);
    expect(await ingest.foldCommitted(partial, null)).toBeInstanceOf(ConeIngestObstructed);
    expect(await store.readBasis(head)).toBe(before);
    feed.source.set(first.sha, first);
    expect(await ingest.advance()).toBeInstanceOf(ConeIngestAdvanced);
    expect((await store.readBasis(head))?.basis.frontier.position('later')?.sha).toBe(partial.sha);
  });

  it('validates and describes recovery obstructions', () => {
    const event = new EventId(1, 'a', sha(1), 0);
    expect(new ConeRecoveryObstruction(event, 'unavailable').describe()).toContain('restore its authoritative patch source');
    // @ts-expect-error Runtime boundary: a foreign event is not evidence.
    expect(() => new ConeRecoveryObstruction({}, 'unavailable')).toThrow('needs an event');
    // @ts-expect-error Runtime boundary: an unrecognized reason is not admitted.
    expect(() => new ConeRecoveryObstruction(event, 'guess')).toThrow('recovery reason');
  });
});

describe('cone recovery retains only bounded maximal payloads', () => {
  it('normalizes legacy node and edge writes while preserving implicit causal evidence', async () => {
    const feed = new RecoveryFeed();
    const source = new PatchEntry({ sha: sha(500), patch: new Patch({ writer: 'strand', lamport: 500, context: {},
      ops: [new PropSet('n', 'weight', 1), new PropSet(encodeLegacyEdgePropNode('n', 'm', 'rel'), 'weight', 2)] }) });
    feed.source.set(source.sha, source);
    const session = new ConeFoldSession({ store: new ReloadingStore(), root: ConeRoot.empty(), source: { feed, lane: 'lane' } });
    const owners = [ConeNodeRecord.empty('n'), ConeEdgeRecord.empty(encodeEdgeKey('n', 'm', 'rel'))];
    for (const [index, owner] of owners.entries()) {
      const event = new EventId(500, 'strand', source.sha, index);
      const set = new ConeConcurrentSet<ConeConcurrentValue>({ members: [], observed: new Map(), evicted: new Map([['strand', new ConeEvictedValue({ event, causal: true })]]) });
      const record = owner.withConcurrency(new ConeConcurrency({ registers: new Map([['weight', set]]), lifecycle: ConeConcurrentSet.empty() }));
      const recovered = await ConeConcurrencyRecovery.of(record, session);
      if (!(recovered instanceof ConeConcurrency)) throw new Error('Expected legacy recovery');
      expect(recovered.register('weight').members).toEqual([new ConeConcurrentValue({ event, causal: true, value: index + 1 })]);
      expect(recovered.register('weight').isUnderdetermined()).toBe(false);
    }
  });

  it('reads at most sixteen selected sources and preserves causal qualification', async () => {
    const feed = new RecoveryFeed();
    const events = Array.from({ length: 40 }, (_unused, i) => new EventId(i + 1, `writer${i}`, sha(i + 1000), 0));
    for (const event of events) feed.source.set(event.patchSha, new PatchEntry({ sha: event.patchSha,
      patch: new Patch({ writer: event.writerId, lamport: event.lamport, context: {}, ops: [new PropSet('n', 'title', event.lamport)] }) }));
    const set = new ConeConcurrentSet({ members: events.slice(0, 16).map((event) => new ConeConcurrentValue({ event, causal: false, value: event.lamport })),
      observed: new Map(), evicted: new Map(events.slice(16).map((event) => [event.writerId, new ConeEvictedValue({ event, causal: false })])) });
    const record = ConeNodeRecord.empty('n').withConcurrency(new ConeConcurrency({ registers: new Map([['title', set]]), lifecycle: ConeConcurrentSet.empty() }));
    const session = new ConeFoldSession({ store: new ReloadingStore(), root: ConeRoot.empty(), source: { feed, lane: 'lane' } });
    const recovered = await ConeConcurrencyRecovery.of(record, session);
    expect(recovered).toBeInstanceOf(ConeConcurrency);
    if (!(recovered instanceof ConeConcurrency)) throw new Error('Expected recovered concurrency');
    expect(recovered.register('title').members.map((member) => member.value)).toEqual(Array.from({ length: 16 }, (_unused, i) => 40 - i));
    expect(recovered.register('title').isUnderdetermined()).toBe(true);
    expect(recovered.register('title').overflow).toBe(24);
    expect(feed.reads).toHaveLength(16);
    expect(feed.ranges).toEqual([]);
  });
});

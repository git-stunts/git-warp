import { describe, expect, it } from 'vitest';
import PatchEntry from '../../../../../src/domain/artifacts/PatchEntry.ts';
import { Dot } from '../../../../../src/domain/crdt/Dot.ts';
import ConeBasis from '../../../../../src/domain/services/cone/ConeBasis.ts';
import ConeContendedObstruction from '../../../../../src/domain/services/cone/ConeContendedObstruction.ts';
import ConeIngest from '../../../../../src/domain/services/cone/ConeIngest.ts';
import ConeIngestAdvanced from '../../../../../src/domain/services/cone/ConeIngestAdvanced.ts';
import ConeIngestCurrent from '../../../../../src/domain/services/cone/ConeIngestCurrent.ts';
import ConeIngestObstructed from '../../../../../src/domain/services/cone/ConeIngestObstructed.ts';
import ConeReader from '../../../../../src/domain/services/cone/ConeReader.ts';
import ConeSharedDotObstruction from '../../../../../src/domain/services/cone/ConeSharedDotObstruction.ts';
import ConeWriterDivergedObstruction from '../../../../../src/domain/services/cone/ConeWriterDivergedObstruction.ts';
import ConeWriterPatches from '../../../../../src/domain/services/cone/ConeWriterPatches.ts';
import NodeAdd from '../../../../../src/domain/types/ops/NodeAdd.ts';
import NodePropSet from '../../../../../src/domain/types/ops/NodePropSet.ts';
import NodeRemove from '../../../../../src/domain/types/ops/NodeRemove.ts';
import type { PatchOp } from '../../../../../src/domain/types/ops/unions.ts';
import Patch from '../../../../../src/domain/types/Patch.ts';
import ConePatchFeedPort from '../../../../../src/ports/ConePatchFeedPort.ts';
import InMemoryConeRecordStore from '../../../../helpers/InMemoryConeRecordStore.ts';

const LANE = 'events';

/** Writer chains held in memory; ranges are served from the chain after `fromSha`. */
class MemoryFeed extends ConePatchFeedPort {
  readonly chains = new Map<string, PatchEntry[]>();
  readonly ranges: Array<{ writerId: string; fromSha: string | null; toSha: string }> = [];
  diverged = new Set<string>();
  #shas = 0;

  append(writer: string, ops: PatchOp[]): PatchEntry {
    const chain = this.chains.get(writer) ?? [];
    this.#shas += 1;
    const sha = `${writer.charCodeAt(1).toString(16)}${this.#shas.toString(16).padStart(38, '0')}`;
    const patchEntry = new PatchEntry({ patch: new Patch({ writer, lamport: chain.length + 1, context: {}, ops }), sha });
    chain.push(patchEntry);
    this.chains.set(writer, chain);
    return patchEntry;
  }

  override async writerTips(lane: string): Promise<ReadonlyMap<string, string>> {
    expect(lane).toBe(LANE);
    return new Map([...this.chains].map(([writer, chain]) => [writer, chain[chain.length - 1]?.sha ?? '']));
  }

  override async patchesAfter(
    _lane: string,
    writerId: string,
    range: { readonly fromSha: string | null; readonly toSha: string },
  ): Promise<ConeWriterPatches | ConeWriterDivergedObstruction> {
    this.ranges.push({ writerId, ...range });
    if (this.diverged.has(writerId)) {
      return new ConeWriterDivergedObstruction({ writerId, foldedSha: range.fromSha, tipSha: range.toSha });
    }
    const chain = this.chains.get(writerId) ?? [];
    const start = range.fromSha === null ? 0 : chain.findIndex((patchEntry) => patchEntry.sha === range.fromSha) + 1;
    return new ConeWriterPatches(writerId, chain.slice(start));
  }
}

function fixture(): { store: InMemoryConeRecordStore; feed: MemoryFeed; ingest: ConeIngest } {
  const store = new InMemoryConeRecordStore();
  const feed = new MemoryFeed();
  return { store, feed, ingest: new ConeIngest({ store, feed, lane: LANE }) };
}

describe('ConeIngest.advance', () => {
  it('folds every writer from the empty basis, then reports current', async () => {
    const { store, feed, ingest } = fixture();
    feed.append('w1', [new NodeAdd('a', new Dot('w1', 1))]);
    feed.append('w2', [new NodeAdd('b', new Dot('w2', 1)), new NodePropSet('b', 'k', 'v')]);
    const advanced = await ingest.advance();
    expect(advanced).toBeInstanceOf(ConeIngestAdvanced);
    expect(advanced instanceof ConeIngestAdvanced ? advanced.foldedPatches : 0).toBe(2);
    const stored = await store.readBasis(LANE);
    expect(stored?.basis.frontier.position('w2')?.lamport).toBe(1);
    const reader = new ConeReader(store);
    expect((await reader.node(stored?.basis.root ?? ConeBasis.empty().root, 'b')).isAlive()).toBe(true);
    const again = await ingest.advance();
    expect(again).toBeInstanceOf(ConeIngestCurrent);
    expect(again instanceof ConeIngestCurrent ? again.stored : null).toBe(stored);
  });

  it('reports current for a clone with no writers and no basis', async () => {
    const { ingest } = fixture();
    const outcome = await ingest.advance();
    expect(outcome).toBeInstanceOf(ConeIngestCurrent);
    expect(outcome instanceof ConeIngestCurrent ? outcome.stored : 'x').toBeNull();
  });

  it('reads only the range after the folded frontier', async () => {
    const { feed, ingest } = fixture();
    const first = feed.append('w1', [new NodeAdd('a', new Dot('w1', 1))]);
    await ingest.advance();
    feed.append('w1', [new NodeRemove('a', ['w1:1'])]);
    feed.ranges.length = 0;
    const outcome = await ingest.advance();
    expect(outcome instanceof ConeIngestAdvanced ? outcome.foldedPatches : 0).toBe(1);
    expect(feed.ranges).toEqual([{ writerId: 'w1', fromSha: first.sha, toSha: feed.chains.get('w1')?.[1]?.sha }]);
  });

  it('publishes nothing when a writer diverged or a patch shares a dot', async () => {
    const diverged = fixture();
    diverged.feed.append('w1', [new NodeAdd('a', new Dot('w1', 1))]);
    diverged.feed.diverged.add('w1');
    const blocked = await diverged.ingest.advance();
    expect(blocked instanceof ConeIngestObstructed ? blocked.obstruction : null).toBeInstanceOf(ConeWriterDivergedObstruction);
    expect(await diverged.store.readBasis(LANE)).toBeNull();

    const shared = fixture();
    shared.feed.append('w1', [new NodeAdd('a', new Dot('w1', 1)), new NodeAdd('b', new Dot('w1', 1))]);
    shared.feed.append('w1', [new NodeRemove('a', ['w1:1'])]);
    const refused = await shared.ingest.advance();
    expect(refused instanceof ConeIngestObstructed ? refused.obstruction : null).toBeInstanceOf(ConeSharedDotObstruction);
    expect(await shared.store.readBasis(LANE)).toBeNull();
  });

  it('retries after losing the head race and reports contention when it never wins', async () => {
    const { store, feed, ingest } = fixture();
    feed.append('w1', [new NodeAdd('a', new Dot('w1', 1))]);
    let races = 1;
    store.beforePublish = async (lane) => {
      if (races > 0) {
        races -= 1;
        store.forceHead(lane);
      }
    };
    expect(await ingest.advance()).toBeInstanceOf(ConeIngestAdvanced);
    expect(feed.ranges.length).toBe(2);

    const contended = fixture();
    contended.feed.append('w1', [new NodeAdd('a', new Dot('w1', 1))]);
    contended.store.beforePublish = async (lane) => { contended.store.forceHead(lane); };
    const ingest2 = new ConeIngest({ store: contended.store, feed: contended.feed, lane: LANE, attempts: 2 });
    const outcome = await ingest2.advance();
    expect(outcome instanceof ConeIngestObstructed ? outcome.obstruction : null).toBeInstanceOf(ConeContendedObstruction);
  });

  it('needs at least one attempt', () => {
    const { store, feed } = fixture();
    expect(() => new ConeIngest({ store, feed, lane: LANE, attempts: 0 })).toThrow('at least one attempt');
  });
});

describe('ConeIngest.foldCommitted', () => {
  it('folds the one new patch when the basis holds its parent', async () => {
    const { store, feed, ingest } = fixture();
    const first = feed.append('w1', [new NodeAdd('a', new Dot('w1', 1))]);
    await ingest.advance();
    const second = feed.append('w1', [new NodePropSet('a', 'k', 1)]);
    feed.ranges.length = 0;
    const outcome = await ingest.foldCommitted(second, first.sha);
    expect(outcome instanceof ConeIngestAdvanced ? outcome.foldedPatches : 0).toBe(1);
    expect(feed.ranges).toEqual([]);
    expect((await store.readBasis(LANE))?.basis.frontier.position('w1')?.sha).toBe(second.sha);
    expect(await ingest.foldCommitted(second, first.sha)).toBeInstanceOf(ConeIngestCurrent);
  });

  it('falls back to a full advance when the parent is not folded or the race is lost', async () => {
    const { store, feed, ingest } = fixture();
    feed.append('w1', [new NodeAdd('a', new Dot('w1', 1))]);
    const second = feed.append('w1', [new NodePropSet('a', 'k', 1)]);
    const unfolded = await ingest.foldCommitted(second, feed.chains.get('w1')?.[0]?.sha ?? null);
    expect(unfolded instanceof ConeIngestAdvanced ? unfolded.foldedPatches : 0).toBe(2);

    const third = feed.append('w1', [new NodePropSet('a', 'k', 2)]);
    let races = 1;
    store.beforePublish = async (lane) => {
      if (races > 0) {
        races -= 1;
        const current = await store.readBasis(lane);
        store.forceHead(lane, current?.basis);
      }
    };
    const raced = await ingest.foldCommitted(third, second.sha);
    expect(raced instanceof ConeIngestAdvanced ? raced.foldedPatches : 0).toBe(1);
  });

  it('returns the obstruction of a refused patch', async () => {
    const { feed, ingest } = fixture();
    const first = feed.append('w1', [new NodeAdd('a', new Dot('w1', 1)), new NodeAdd('b', new Dot('w1', 1))]);
    await ingest.advance();
    const remove = feed.append('w1', [new NodeRemove('a', ['w1:1'])]);
    const outcome = await ingest.foldCommitted(remove, first.sha);
    expect(outcome instanceof ConeIngestObstructed ? outcome.obstruction : null).toBeInstanceOf(ConeSharedDotObstruction);
  });
});

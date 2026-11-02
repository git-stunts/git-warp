import { describe, expect, it } from 'vitest';
import { Dot } from '../../../../../src/domain/crdt/Dot.ts';
import ConeBasis from '../../../../../src/domain/services/cone/ConeBasis.ts';
import ConeBasisHead from '../../../../../src/domain/services/cone/ConeBasisHead.ts';
import ConeIngest from '../../../../../src/domain/services/cone/ConeIngest.ts';
import ConeIngestObstructed from '../../../../../src/domain/services/cone/ConeIngestObstructed.ts';
import ConeLaneBasis from '../../../../../src/domain/services/cone/ConeLaneBasis.ts';
import ConeTipSource from '../../../../../src/domain/services/cone/ConeTipSource.ts';
import ConeWriterDivergedObstruction from '../../../../../src/domain/services/cone/ConeWriterDivergedObstruction.ts';
import LaneConeScope from '../../../../../src/domain/services/cone/LaneConeScope.ts';
import StrandBaseConeScope from '../../../../../src/domain/services/cone/StrandBaseConeScope.ts';
import StrandConeScope from '../../../../../src/domain/services/cone/StrandConeScope.ts';
import NodeAdd from '../../../../../src/domain/types/ops/NodeAdd.ts';
import NodePropSet from '../../../../../src/domain/types/ops/NodePropSet.ts';
import InMemoryConeRecordStore from '../../../../helpers/InMemoryConeRecordStore.ts';
import MemoryConeFeed from '../../../../helpers/MemoryConeFeed.ts';

const LANE = 'events';
const STRAND = 'b'.repeat(64);
const OVERLAY = `@w.alice@s.${STRAND}`;

class Tips extends ConeTipSource {
  constructor(private readonly tipsByWriter: () => ReadonlyMap<string, string>) {
    super();
  }

  override tips(): Promise<ReadonlyMap<string, string>> {
    return Promise.resolve(this.tipsByWriter());
  }
}

function requireBasis(value: ConeBasis | object): ConeBasis {
  if (!(value instanceof ConeBasis)) { throw new Error('expected a cone basis'); }
  return value;
}

/** A lane with one base patch of alice and a strand over it whose overlay chain is OVERLAY. */
function strandFixture() {
  const store = new InMemoryConeRecordStore();
  const feed = new MemoryConeFeed(LANE);
  const basePatch = feed.append('alice', [new NodeAdd('doc', new Dot('alice', 1))]);
  const baseFrontier = new Map([['alice', basePatch.sha]]);
  const base = ConeLaneBasis.ofStrandBase({ store, feed, lane: LANE, strandId: STRAND, baseFrontier });
  const tips = new Tips(() => new Map([...baseFrontier, ...[...feed.chains].filter(([writer]) => writer === OVERLAY)
    .map(([writer, chain]) => [writer, chain[chain.length - 1]?.sha ?? ''] as const)]));
  const strand = ConeLaneBasis.ofStrand({ store, feed, strandId: STRAND, tips, base });
  return { store, feed, base, strand, basePatch };
}

describe('ConeBasisHead', () => {
  it('names the lane head, a strand base pin and a strand head, all clone-local', () => {
    const lane = ConeBasisHead.forLane(LANE);
    expect(lane.lane).toBe(LANE);
    expect(lane.ref()).toBe('refs/warp/events/cone/head');
    expect(ConeBasisHead.forStrandBase(LANE, STRAND).ref()).toBe(`refs/warp/events/cone/strands/${STRAND}/base`);
    expect(ConeBasisHead.forStrand(LANE, STRAND).ref()).toBe(`refs/warp/events/cone/strands/${STRAND}/head`);
    expect(lane.equals(ConeBasisHead.forLane(LANE))).toBe(true);
    expect(lane.equals(ConeBasisHead.forStrand(LANE, STRAND))).toBe(false);
    expect(Object.isFrozen(lane)).toBe(true);
  });
});

describe('cone basis scopes', () => {
  it('follows the lane writer tips from the empty basis', async () => {
    const feed = new MemoryConeFeed(LANE);
    const patch = feed.append('alice', [new NodeAdd('doc', new Dot('alice', 1))]);
    const scope = new LaneConeScope(LANE);
    expect(scope.head.equals(ConeBasisHead.forLane(LANE))).toBe(true);
    expect(await scope.tips(feed)).toEqual(new Map([['alice', patch.sha]]));
    expect((await scope.seed()).equals(ConeBasis.empty())).toBe(true);
  });

  it('pins a strand base at a fixed frontier, copied at construction', async () => {
    const frontier = new Map([['alice', 'a'.repeat(40)]]);
    const scope = new StrandBaseConeScope({ lane: LANE, strandId: STRAND, frontier });
    frontier.set('bob', 'b'.repeat(40));
    expect(await scope.tips()).toEqual(new Map([['alice', 'a'.repeat(40)]]));
    expect((await scope.seed()).equals(ConeBasis.empty())).toBe(true);
    expect(scope.head.ref()).toContain('/base');
  });

  it('seeds a strand basis from its base and follows the strand tips', async () => {
    const { base, basePatch } = strandFixture();
    const scope = new StrandConeScope({ lane: LANE, strandId: STRAND, tips: new Tips(() => new Map([['alice', basePatch.sha]])), base });
    expect(scope.head.ref()).toContain('/head');
    expect(await scope.tips()).toEqual(new Map([['alice', basePatch.sha]]));
    expect(requireBasis(await scope.seed()).writerHeads()).toEqual(new Map([['alice', basePatch.sha]]));
  });
});

describe('strand ConeLaneBasis over a pinned base', () => {
  it('reads the base, folds overlay patches on top and leaves the base pin unchanged', async () => {
    const { store, feed, base, strand, basePatch } = strandFixture();
    const unfolded = requireBasis(await strand.advance());
    expect(unfolded.writerHeads()).toEqual(new Map([['alice', basePatch.sha]]));
    expect(await store.readBasis(ConeBasisHead.forStrand(LANE, STRAND))).toBeNull();
    feed.append('bob', [new NodeAdd('foreign', new Dot('bob', 1))]);
    const overlay = feed.append(OVERLAY, [new NodePropSet('doc', 'title', 'strand')]);
    const folded = requireBasis(await strand.foldCommitted(overlay, null));
    expect(folded.writerHeads()).toEqual(new Map([['alice', basePatch.sha], [OVERLAY, overlay.sha]]));
    expect((await strand.reader.node(folded.root, 'doc')).props.get('title')?.value).toBe('strand');
    expect((await strand.reader.node(folded.root, 'foreign')).isAlive()).toBe(false);
    expect(requireBasis(await base.advance()).writerHeads()).toEqual(new Map([['alice', basePatch.sha]]));
    expect(strand.lane).toBe(LANE);
  });

  it('reports a base that cannot be refolded as the strand obstruction, for advances and commits', async () => {
    const { feed, strand, basePatch } = strandFixture();
    feed.diverged.add('alice');
    const store = new InMemoryConeRecordStore();
    const ingest = new ConeIngest({ store, feed, scope: new StrandConeScope({
      lane: LANE, strandId: STRAND, tips: new Tips(() => new Map([['alice', basePatch.sha]])),
      base: ConeLaneBasis.ofStrandBase({ store, feed, lane: LANE, strandId: STRAND, baseFrontier: new Map([['alice', basePatch.sha]]) }),
    }) });
    expect(await strand.advance()).toBeInstanceOf(ConeWriterDivergedObstruction);
    const committed = await ingest.foldCommitted(basePatch, null);
    expect(committed).toBeInstanceOf(ConeIngestObstructed);
    expect(committed instanceof ConeIngestObstructed ? committed.obstruction : null).toBeInstanceOf(ConeWriterDivergedObstruction);
  });
});

describe('ConeLaneBasis.capture', () => {
  it('retains a published basis once captured, and nothing for an unpublished seed or an obstruction', async () => {
    const store = new InMemoryConeRecordStore();
    const feed = new MemoryConeFeed(LANE);
    const lane = ConeLaneBasis.ofLane({ store, feed, lane: LANE });
    expect(requireBasis(await lane.capture()).equals(ConeBasis.empty())).toBe(true);
    expect(store.retained(LANE)).toEqual([]);
    feed.append('alice', [new NodeAdd('doc', new Dot('alice', 1))]);
    const advanced = requireBasis(await lane.capture());
    expect(store.retained(LANE).map((stored) => stored.basis)).toEqual([advanced]);
    expect(requireBasis(await lane.capture()).equals(advanced)).toBe(true);
    expect(store.retained(LANE)).toHaveLength(1);
    feed.append('alice', [new NodeAdd('later', new Dot('alice', 2))]);
    feed.diverged.add('alice');
    expect(await lane.capture()).toBeInstanceOf(ConeWriterDivergedObstruction);
    expect(store.retained(LANE)).toHaveLength(1);
  });
});

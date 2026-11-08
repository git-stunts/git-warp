import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import Plumbing from '@git-stunts/plumbing';
import { Dot } from '../../../../src/domain/crdt/Dot.ts';
import WarpError from '../../../../src/domain/errors/WarpError.ts';
import ConeBasis from '../../../../src/domain/services/cone/ConeBasis.ts';
import ConeBasisHead from '../../../../src/domain/services/cone/ConeBasisHead.ts';
import ConeIngest from '../../../../src/domain/services/cone/ConeIngest.ts';
import ConeRecordKey from '../../../../src/domain/services/cone/ConeRecordKey.ts';
import ConeRoot from '../../../../src/domain/services/cone/ConeRoot.ts';
import LaneConeScope from '../../../../src/domain/services/cone/LaneConeScope.ts';
import EdgeAdd from '../../../../src/domain/types/ops/EdgeAdd.ts';
import NodeAdd from '../../../../src/domain/types/ops/NodeAdd.ts';
import GraphOrdinal from '../../../../src/domain/retained/GraphOrdinal.ts';
import OrdinalAddressResolver from '../../../../src/domain/retained/OrdinalAddressResolver.ts';
import RetainedGraphManifest from '../../../../src/domain/retained/RetainedGraphManifest.ts';
import RetainedGraphManifestReader from '../../../../src/domain/retained/RetainedGraphManifestReader.ts';
import GitConeRecordStoreAdapter, { CONE_TRIE_LAYOUT } from '../../../../src/infrastructure/adapters/GitConeRecordStoreAdapter.ts';
import GitTimelineHistoryAdapter from '../../../../src/infrastructure/adapters/GitTimelineHistoryAdapter.ts';
import { CborCodec } from '../../../../src/infrastructure/codecs/CborCodec.ts';
import MemoryConeFeed from '../../../helpers/MemoryConeFeed.ts';

const LANE = 'events';
const HEAD = ConeBasisHead.forLane(LANE);
const NODES = 520;
const directories: string[] = [];
const histories: GitTimelineHistoryAdapter[] = [];

afterEach(async () => {
  for (const history of histories.splice(0)) {
    await history.close();
  }
  for (const directory of directories.splice(0)) {
    await rm(directory, { recursive: true, force: true });
  }
});

async function repository(): Promise<{ plumbing: Plumbing; store: GitConeRecordStoreAdapter }> {
  const directory = await mkdtemp(join(tmpdir(), 'retained-manifest-'));
  directories.push(directory);
  const plumbing = await Plumbing.createDefault({ cwd: directory });
  await plumbing.execute({ args: ['init', '--quiet'] });
  const history = new GitTimelineHistoryAdapter({ plumbing });
  histories.push(history);
  return { plumbing, store: new GitConeRecordStoreAdapter({ history, codec: new CborCodec() }) };
}

/** The same two writer chains in every repository: three address pages of one writer plus an edge. */
function feed(): MemoryConeFeed {
  const chains = new MemoryConeFeed(LANE);
  for (let start = 0; start < NODES; start += 130) {
    chains.append('w1', Array.from({ length: 130 }, (_unused, index) => new NodeAdd(`n${start + index + 1}`, new Dot('w1', start + index + 1))));
  }
  chains.append('w2', [new NodeAdd('n1', new Dot('w2', 1)), new EdgeAdd({ from: 'n1', to: 'n2', label: 'links', dot: new Dot('w2', 2) })]);
  return chains;
}

async function retained(): Promise<{ plumbing: Plumbing; store: GitConeRecordStoreAdapter; manifest: RetainedGraphManifest }> {
  const { plumbing, store } = await repository();
  await new ConeIngest({ store, feed: feed(), scope: new LaneConeScope(LANE) }).advance();
  const manifest = await new RetainedGraphManifestReader({ store }).open(HEAD);
  if (manifest === null) {
    throw new Error('the fixture published no basis');
  }
  return { plumbing, store, manifest };
}

describe('retained graph manifest over the Git cone record store (#815)', () => {
  it('declares the record layout the manifest binds', async () => {
    const { store } = await repository();
    expect(store.recordLayout()).toBe(CONE_TRIE_LAYOUT);
  });

  it('reopens from Git and resolves single ordinals across address pages', async () => {
    const { store, manifest } = await retained();
    expect(manifest.layout).toBe(CONE_TRIE_LAYOUT);
    const reopened = await new RetainedGraphManifestReader({ store }).open(HEAD);
    expect(reopened?.commitment.equals(manifest.commitment)).toBe(true);
    const resolver = new OrdinalAddressResolver(store);
    for (const counter of [1, 256, 519]) {
      const address = await resolver.resolve(manifest, new GraphOrdinal({ kind: 'node', writerId: 'w1', counter }));
      expect(address.record.equals(ConeRecordKey.forNode(`n${counter}`))).toBe(true);
    }
  });

  it('rebuilds byte-identical roots and commitments from the same writer chains in another repository', async () => {
    const first = await retained();
    const second = await retained();
    expect(second.manifest.basis.root.equals(first.manifest.basis.root)).toBe(true);
    expect(second.manifest.commitment.toString()).toBe(first.manifest.commitment.toString());
  });

  it('pins one manifest for the retained checkpoint and the live head; the retained ref grafts the same basis tree', async () => {
    const { plumbing, store, manifest } = await retained();
    const stored = await store.readBasis(HEAD);
    if (stored === null) {
      throw new Error('no basis');
    }
    await store.retainBasis(LANE, stored);
    const checkpoints = await new RetainedGraphManifestReader({ store }).retained(LANE);
    expect(checkpoints.map((checkpoint) => checkpoint.commitment.toString())).toEqual([manifest.commitment.toString()]);
    const listing = await plumbing.execute({ args: ['ls-tree', '-r', '-t', `refs/warp/${LANE}/cone/retained`] });
    expect(listing).toContain(stored.revision);
  });

  it('fails closed with a typed error when the manifest names a record root the repository does not hold', async () => {
    const { store, manifest } = await retained();
    const missing = new RetainedGraphManifest({
      layout: manifest.layout, geometry: manifest.geometry, basis: new ConeBasis(ConeRoot.at('0123456789abcdef0123456789abcdef01234567'), manifest.basis.frontier),
    });
    const outcome = await new OrdinalAddressResolver(store).resolve(missing, new GraphOrdinal({ kind: 'node', writerId: 'w1', counter: 1 }))
      .then(() => null, (error: Error) => error);
    expect(outcome).toBeInstanceOf(WarpError);
    expect(outcome instanceof WarpError ? outcome.code : null).toBe('E_MISSING_OBJECT');
  });
});

import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import PatchEntry from '../../../../src/domain/artifacts/PatchEntry.ts';
import { Dot } from '../../../../src/domain/crdt/Dot.ts';
import WarpError from '../../../../src/domain/errors/WarpError.ts';
import ConeBasis from '../../../../src/domain/services/cone/ConeBasis.ts';
import ConeDotPage from '../../../../src/domain/services/cone/ConeDotPage.ts';
import ConeFold from '../../../../src/domain/services/cone/ConeFold.ts';
import ConeFolded from '../../../../src/domain/services/cone/ConeFolded.ts';
import ConeFoldSession from '../../../../src/domain/services/cone/ConeFoldSession.ts';
import ConeRecordKey, { type ConeDotSet } from '../../../../src/domain/services/cone/ConeRecordKey.ts';
import ConeFrontier from '../../../../src/domain/services/cone/ConeFrontier.ts';
import ConeRoot from '../../../../src/domain/services/cone/ConeRoot.ts';
import ConeWriterPosition from '../../../../src/domain/services/cone/ConeWriterPosition.ts';
import { hexEncode } from '../../../../src/domain/utils/bytes.ts';
import { compareStrings } from '../../../../src/domain/utils/StringComparison.ts';
import NodeAdd from '../../../../src/domain/types/ops/NodeAdd.ts';
import Patch from '../../../../src/domain/types/Patch.ts';
import GraphOrdinal from '../../../../src/domain/retained/GraphOrdinal.ts';
import IdentifierDictionary from '../../../../src/domain/retained/IdentifierDictionary.ts';
import OrdinalAddressResolver from '../../../../src/domain/retained/OrdinalAddressResolver.ts';
import OrdinalGeometry from '../../../../src/domain/retained/OrdinalGeometry.ts';
import RetainedGraphManifest from '../../../../src/domain/retained/RetainedGraphManifest.ts';
import ConeRecordCborCodec from '../../../../src/infrastructure/adapters/ConeRecordCborCodec.ts';
import { CborCodec } from '../../../../src/infrastructure/codecs/CborCodec.ts';
import ConeHistoryGenerator, { interleave, type ConeHistory } from '../../../helpers/ConeHistoryGenerator.ts';
import InMemoryConeRecordStore, { IN_MEMORY_CONE_LAYOUT } from '../../../helpers/InMemoryConeRecordStore.ts';
import { createRng } from '../../../helpers/seededRng.ts';

/** Fixed fast-check seed: every run checks the same histories; a failure prints its history seed. */
const PROPERTY_SEED = 815;
/**
 * Fold orders sampled per history. The comparison covers the ordinal index
 * (the dot pages) and resolutions, not the record-trie root: adjacency pages
 * keep arrival order until #1044 slice 1, so the root may differ across fold
 * orders. The manifest commitment does not bind the root for that reason.
 */
const INTERLEAVINGS = 3;
const SHAPE = { writers: 4, patches: 60, nodes: 6, maxOps: 4, syncChance: 0.4 };
const codec = new ConeRecordCborCodec(new CborCodec());

async function foldAll(store: InMemoryConeRecordStore, order: readonly PatchEntry[], chunk: number): Promise<ConeRoot> {
  let root = ConeRoot.empty();
  for (let start = 0; start < order.length; start += chunk) {
    const session = new ConeFoldSession({ store, root, flushRecords: 7 });
    for (const entry of order.slice(start, start + chunk)) {
      expect(await ConeFold.fold(session, entry)).toBeInstanceOf(ConeFolded);
    }
    root = await session.commit();
  }
  return root;
}

function frontierOf(chains: ReadonlyMap<string, readonly PatchEntry[]>): ConeFrontier {
  const positions = new Map<string, ConeWriterPosition>();
  for (const [writerId, chain] of chains) {
    const last = chain[chain.length - 1];
    if (last !== undefined) {
      positions.set(writerId, new ConeWriterPosition(last.sha, last.patch.lamport));
    }
  }
  return new ConeFrontier(positions);
}

/** Every dot page's encoded bytes by key: the ordinal index exactly as it is persisted. */
function encodedIndex(store: InMemoryConeRecordStore, root: ConeRoot): Map<string, string> {
  const entries: Array<[string, string]> = store.allRecords(root)
    .filter((record) => record instanceof ConeDotPage)
    .map((page) => [page.key().toString(), hexEncode(codec.encode(page))]);
  return new Map(entries.sort((left, right) => compareStrings(left[0], right[0])));
}

/** Each identifier's ordinals and what each ordinal resolves to, or the code it fails closed with. */
async function readings(store: InMemoryConeRecordStore, manifest: RetainedGraphManifest, history: ConeHistory): Promise<string[]> {
  const dictionary = new IdentifierDictionary(store);
  const resolver = new OrdinalAddressResolver(store);
  const lines: string[] = [];
  const kindOf = (kind: ConeDotSet) => (identifier: string): { readonly kind: ConeDotSet; readonly identifier: string } => ({ kind, identifier });
  const identifiers = [...history.nodeIds.map(kindOf('node')), ...history.edgeKeys.map(kindOf('edge'))];
  for (const { kind, identifier } of identifiers) {
    for (const ordinal of await dictionary.ordinalsOf(manifest, kind, identifier)) {
      const before = store.recordReads;
      lines.push(`${identifier} ${ordinal.toString()} ${await resolution(resolver, manifest, ordinal)}`);
      expect(store.recordReads - before).toBe(1);
    }
  }
  return lines;
}

async function resolution(resolver: OrdinalAddressResolver, manifest: RetainedGraphManifest, ordinal: GraphOrdinal): Promise<string> {
  try {
    return (await resolver.resolve(manifest, ordinal)).record.toString();
  } catch (error) {
    if (error instanceof WarpError) {
      return error.code;
    }
    throw error;
  }
}

async function checkHistory(seed: number): Promise<number> {
  const history = new ConeHistoryGenerator(seed, SHAPE).generate();
  const rng = createRng(seed ^ 0x815);
  const frontier = frontierOf(history.chains);
  const observed: Array<{ index: Map<string, string>; lines: string[] }> = [];
  for (let run = 0; run < INTERLEAVINGS; run += 1) {
    const store = new InMemoryConeRecordStore();
    const order = interleave(rng, history.chains);
    const root = await foldAll(store, order, rng.nextInt(1, order.length + 1));
    const manifest = new RetainedGraphManifest({ layout: IN_MEMORY_CONE_LAYOUT, geometry: OrdinalGeometry.dotPages(), basis: new ConeBasis(root, frontier) });
    observed.push({ index: encodedIndex(store, root), lines: await readings(store, manifest, history) });
  }
  for (const other of observed.slice(1)) {
    expect(other.index).toEqual(observed[0]?.index);
    expect(other.lines).toEqual(observed[0]?.lines);
  }
  return observed[0]?.lines.length ?? 0;
}

describe('retained ordinal index properties (#815)', () => {
  it('builds byte-identical address pages and identical resolutions under sampled fold interleavings', async () => {
    let resolved = 0;
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 1, max: 0x7fffffff }), async (seed) => { resolved += await checkHistory(seed); }),
      { seed: PROPERTY_SEED, numRuns: 40 },
    );
    expect(resolved).toBeGreaterThan(0);
  }, 300_000);

  it('keeps resolution one page wide as one writer grows across many page boundaries', async () => {
    const counters = 4_000;
    const store = new InMemoryConeRecordStore();
    const session = new ConeFoldSession({ store, root: ConeRoot.empty(), flushRecords: 64 });
    const ops = Array.from({ length: counters }, (_unused, index) => new NodeAdd(`g${index + 1}`, new Dot('grower', index + 1)));
    const entry = new PatchEntry({ patch: new Patch({ writer: 'grower', lamport: 1, context: {}, ops }), sha: 'f'.repeat(40) });
    expect(await ConeFold.fold(session, entry)).toBeInstanceOf(ConeFolded);
    const root = await session.commit();
    const manifest = new RetainedGraphManifest({
      layout: IN_MEMORY_CONE_LAYOUT,
      geometry: OrdinalGeometry.dotPages(),
      basis: new ConeBasis(root, new ConeFrontier(new Map([['grower', new ConeWriterPosition(entry.sha, 1)]]))),
    });
    expect(store.allRecords(root).filter((record) => record instanceof ConeDotPage).length).toBe(Math.ceil((counters + 1) / 256));
    const resolver = new OrdinalAddressResolver(store);
    await fc.assert(fc.asyncProperty(fc.integer({ min: 1, max: counters }), async (counter) => {
      const before = store.recordReads;
      const address = await resolver.resolve(manifest, new GraphOrdinal({ kind: 'node', writerId: 'grower', counter }));
      expect(store.recordReads - before).toBe(1);
      expect(address.record.equals(ConeRecordKey.forNode(`g${counter}`))).toBe(true);
    }), { seed: PROPERTY_SEED, numRuns: 200 });
  }, 120_000);
});

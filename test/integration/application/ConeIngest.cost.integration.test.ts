import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it, vi } from 'vitest';
import Plumbing from '@git-stunts/plumbing';
import ContentAddressableStore from '@git-stunts/git-cas';
import { Dot } from '../../../src/domain/crdt/Dot.ts';
import ConeIngest from '../../../src/domain/services/cone/ConeIngest.ts';
import ConeIngestAdvanced from '../../../src/domain/services/cone/ConeIngestAdvanced.ts';
import ConeWriterPatches from '../../../src/domain/services/cone/ConeWriterPatches.ts';
import { reducePatches } from '../../../src/domain/services/JoinReducer.ts';
import EdgeAdd from '../../../src/domain/types/ops/EdgeAdd.ts';
import NodeAdd from '../../../src/domain/types/ops/NodeAdd.ts';
import NodePropSet from '../../../src/domain/types/ops/NodePropSet.ts';
import type { PatchOp } from '../../../src/domain/types/ops/unions.ts';
import Patch from '../../../src/domain/types/Patch.ts';
import { CborPatchJournalAdapter } from '../../../src/infrastructure/adapters/CborPatchJournalAdapter.ts';
import GitCasAssetStorageAdapter from '../../../src/infrastructure/adapters/GitCasAssetStorageAdapter.ts';
import GitConePatchFeedAdapter from '../../../src/infrastructure/adapters/GitConePatchFeedAdapter.ts';
import GitConeRecordStoreAdapter from '../../../src/infrastructure/adapters/GitConeRecordStoreAdapter.ts';
import GitTimelineHistoryAdapter from '../../../src/infrastructure/adapters/GitTimelineHistoryAdapter.ts';
import { DEFAULT_COMMIT_MESSAGE_CODEC } from '../../../src/infrastructure/adapters/TrailerCommitMessageCodecAdapter.ts';
import codec from '../../../src/infrastructure/codecs/CborCodec.ts';
import ConeHistoryGenerator, { type ConeHistory } from '../../helpers/ConeHistoryGenerator.ts';
import { assertConeEquivalent } from '../../helpers/coneEquivalence.ts';
import ConeBasisHead from '../../../src/domain/services/cone/ConeBasisHead.ts';
import LaneConeScope from '../../../src/domain/services/cone/LaneConeScope.ts';
import PatchEntry from '../../../src/domain/artifacts/PatchEntry.ts';
import ConeReader from '../../../src/domain/services/cone/ConeReader.ts';
import ConeFold from '../../../src/domain/services/cone/ConeFold.ts';
import ConeFolded from '../../../src/domain/services/cone/ConeFolded.ts';
import ConeFoldSession from '../../../src/domain/services/cone/ConeFoldSession.ts';
import ConeRoot from '../../../src/domain/services/cone/ConeRoot.ts';
import ObservedWriteFrontier from '../../../src/domain/types/ObservedWriteFrontier.ts';
import ObservedWriterHead from '../../../src/domain/types/ObservedWriterHead.ts';
import EdgePropSet from '../../../src/domain/types/ops/EdgePropSet.ts';
import { encodeEdgeKey } from '../../../src/domain/services/KeyCodec.ts';
import ConeRecordCborCodec from '../../../src/infrastructure/adapters/ConeRecordCborCodec.ts';

const LANE = 'L';
const HEAD_OF_LANE = ConeBasisHead.forLane(LANE);
const CASE_TIMEOUT_MS = 300_000;
/** Patches appended after the first ingest; the second ingest must cost only these. */
const NEW_PATCHES = 3;
/** Ceilings over the measured process counts (13 and 11), with a margin. */
const FIRST_INGEST_PROCESS_CEILING = 16;
const SECOND_INGEST_PROCESS_CEILING = 14;

type Repository = Awaited<ReturnType<typeof repository>>;

async function repository() {
  const directory = await mkdtemp(join(tmpdir(), 'cone-ingest-'));
  const plumbing = await Plumbing.createDefault({ cwd: directory });
  await plumbing.execute({ args: ['init', '--quiet'] });
  await plumbing.execute({ args: ['config', 'user.email', 'test@example.invalid'] });
  await plumbing.execute({ args: ['config', 'user.name', 'Cone ingest fixture'] });
  const history = new GitTimelineHistoryAdapter({ plumbing });
  const cas = ContentAddressableStore.createCbor({ plumbing, applicationRefPrefixes: ['refs/warp/'] });
  const journal = new CborPatchJournalAdapter({ assetStorage: new GitCasAssetStorageAdapter({ cas }), cas, codec, commitReader: history, graph: LANE });
  const store = new GitConeRecordStoreAdapter({ history, codec });
  const feed = new GitConePatchFeedAdapter({ history, journal, commitMessageCodec: DEFAULT_COMMIT_MESSAGE_CODEC });
  return { directory, plumbing, history, journal, store, feed, ingest: new ConeIngest({ store, feed, scope: new LaneConeScope(LANE) }) };
}

async function append(repo: Repository, patch: Patch): Promise<string> {
  const targetRef = `refs/warp/${LANE}/writers/${patch.writer}`;
  const head = await repo.history.readRef(targetRef);
  return (await repo.journal.appendPatch({ patch, graph: LANE, writer: patch.writer, targetRef, expectedHead: head, parent: head, attachments: [] })).sha;
}

/** Seeds a generated multi-writer history into real writer chains. */
async function seed(repo: Repository, patches: number): Promise<ConeHistory> {
  const history = new ConeHistoryGenerator(7, { writers: 3, patches, nodes: 12, maxOps: 3, syncChance: 0.4, graph: LANE }).generate();
  for (const chain of history.chains.values()) {
    for (const entry of chain) {
      await append(repo, entry.patch);
    }
  }
  return history;
}

/** The same small tail in every repository: a writer of its own, so its dots never collide. */
function tail(index: number): Patch {
  const ops: PatchOp[] = [
    new NodeAdd(`tail${index}`, new Dot('tail', (2 * index) + 1)),
    new NodePropSet(`tail${index}`, 'title', `t${index}`),
    new EdgeAdd({ from: `tail${index}`, to: 'n0', label: 'links', dot: new Dot('tail', (2 * index) + 2) }),
  ];
  return new Patch({ writer: 'tail', lamport: 1000 + index, context: {}, ops });
}

/** Counts git processes and patch decodes during one ingest. */
async function measuredIngest(repo: Repository): Promise<{ processes: number; decoded: number; logs: number; folded: number }> {
  const execute = vi.spyOn(repo.plumbing, 'execute');
  const stream = vi.spyOn(repo.plumbing, 'executeStream');
  const decoded = vi.spyOn(repo.journal, 'readPatch');
  const logs = vi.spyOn(repo.history, 'logNodesStream');
  try {
    const outcome = await repo.ingest.advance();
    expect(outcome).toBeInstanceOf(ConeIngestAdvanced);
    return {
      processes: execute.mock.calls.length + stream.mock.calls.length,
      decoded: decoded.mock.calls.length,
      logs: logs.mock.calls.length,
      folded: outcome instanceof ConeIngestAdvanced ? outcome.foldedPatches : 0,
    };
  } finally {
    execute.mockRestore(); stream.mockRestore(); decoded.mockRestore(); logs.mockRestore();
  }
}

/** Every patch on every writer chain, for the full reduction the cone must match. */
async function allPatches(repo: Repository): Promise<Array<{ patch: Patch; sha: string }>> {
  const all: Array<{ patch: Patch; sha: string }> = [];
  for (const [writerId, tip] of await repo.feed.writerTips(LANE)) {
    const range = await repo.feed.patchesAfter(LANE, writerId, { fromSha: null, toSha: tip });
    expect(range).toBeInstanceOf(ConeWriterPatches);
    for (const entry of range instanceof ConeWriterPatches ? range.entries : []) {
      all.push({ patch: entry.patch, sha: entry.sha });
    }
  }
  return all;
}

async function scenario(seedPatches: number): Promise<{ first: Awaited<ReturnType<typeof measuredIngest>>; second: Awaited<ReturnType<typeof measuredIngest>> }> {
  const repo = await repository();
  try {
    const history = await seed(repo, seedPatches);
    const first = await measuredIngest(repo);
    for (let index = 0; index < NEW_PATCHES; index += 1) {
      await append(repo, tail(index));
    }
    const second = await measuredIngest(repo);
    const stored = await repo.store.readBasis(HEAD_OF_LANE);
    if (stored === null) {
      throw new Error('ingest published no cone basis');
    }
    const nodeIds = [...history.nodeIds, ...Array.from({ length: NEW_PATCHES }, (_unused, index) => `tail${index}`)];
    const universe = { seed: history.seed, nodeIds, edgeKeys: history.edgeKeys };
    await assertConeEquivalent(universe, reducePatches(await allPatches(repo)), { store: repo.store, root: stored.basis.root });
    return { first, second };
  } finally {
    try {
      await repo.history.close();
    } finally {
      await rm(repo.directory, { recursive: true, force: true });
    }
  }
}

it('ingest touches only the new patches, independent of history size', async () => {
  const small = await scenario(20);
  const large = await scenario(120);
  console.log('CONE_INGEST_COST', JSON.stringify({ small, large }));
  expect(small.first.folded).toBe(20);
  expect(large.first.folded).toBe(120);
  for (const run of [small, large]) {
    expect(run.second.folded).toBe(NEW_PATCHES);
    expect(run.second.decoded).toBe(NEW_PATCHES);
    expect(run.second.logs).toBe(1);
  }
  // The first ingest decodes the whole history, but its records are read through the object
  // session and written by one fast-import, so neither ingest's processes grow with history.
  expect(large.first.decoded).toBe(120);
  expect(large.first.processes).toBeLessThanOrEqual(small.first.processes + 2);
  expect(large.second.processes).toBeLessThanOrEqual(small.second.processes + 2);
  // Measured 13 (first) and 11 (second) with storage layout 2; the slice-1 store spent two
  // processes per record read and several per record written.
  expect(large.first.processes).toBeLessThanOrEqual(FIRST_INGEST_PROCESS_CEILING);
  expect(large.second.processes).toBeLessThanOrEqual(SECOND_INGEST_PROCESS_CEILING);
}, CASE_TIMEOUT_MS);

async function recorded(repo: Repository, patch: Patch): Promise<PatchEntry> {
  return new PatchEntry({ sha: await append(repo, patch), patch });
}

function observed(entries: readonly PatchEntry[]): ObservedWriteFrontier {
  return new ObservedWriteFrontier(LANE, entries.map(({ sha, patch }) => new ObservedWriterHead(patch.writer, sha, patch.lamport)));
}

function propertyOps(value: string): PatchOp[] {
  return [new NodePropSet('n', 'title', value), new EdgePropSet({ from: 'n', to: 'm', label: 'rel', key: 'weight', value })];
}

async function recoveryHistory(repo: Repository) {
  const base = await recorded(repo, new Patch({ writer: 'base', lamport: 1, context: {},
    ops: [new NodeAdd('n', new Dot('base', 1)), new NodeAdd('m', new Dot('base', 2)),
      new EdgeAdd({ from: 'n', to: 'm', label: 'rel', dot: new Dot('base', 3) })], observedFrontier: observed([]) }));
  const writes: PatchEntry[] = [];
  for (let i = 0; i < 17; i += 1) {
    writes.push(await recorded(repo, new Patch({ writer: `w${i}`, lamport: i + 2, context: {}, ops: propertyOps(`v${i}`), observedFrontier: observed([base]) })));
  }
  const first = writes[0];
  if (first === undefined) throw new Error('Missing first recovery fixture');
  expect(await repo.ingest.advance()).toBeInstanceOf(ConeIngestAdvanced);
  const partial = await recorded(repo, new Patch({ writer: 'later', lamport: 99, context: {}, ops: propertyOps('later'), observedFrontier: observed([base, ...writes.slice(1)]) }));
  return { base, writes, first, partial };
}

async function measuredRecovery(repo: Repository, partial: PatchEntry): Promise<void> {
  const nodes = vi.spyOn(repo.history, 'getNodeInfo');
  const payloads = vi.spyOn(repo.journal, 'readPatch');
  const logs = vi.spyOn(repo.history, 'logNodesStream');
  try {
    expect(await repo.ingest.foldCommitted(partial, null)).toBeInstanceOf(ConeIngestAdvanced);
    expect(nodes).toHaveBeenCalledTimes(2);
    expect(payloads).toHaveBeenCalledTimes(2);
    expect(logs).not.toHaveBeenCalled();
  } finally {
    nodes.mockRestore(); payloads.mockRestore(); logs.mockRestore();
  }
}

it('recovers evicted values through real Git with two direct reads and convergent record bytes', async () => {
  const repo = await repository();
  try {
    const { base, writes, first, partial } = await recoveryHistory(repo);
    await measuredRecovery(repo, partial);
    const published = await repo.store.readBasis(HEAD_OF_LANE);
    if (published === null) throw new Error('Missing recovered basis');
    const session = new ConeFoldSession({ store: repo.store, root: ConeRoot.empty(), source: { feed: repo.feed, lane: LANE } });
    for (const entry of [base, ...writes.slice(1), partial, first]) expect(await ConeFold.fold(session, entry)).toBeInstanceOf(ConeFolded);
    const lateRoot = await session.commit();
    const reader = new ConeReader(repo.store);
    const node = await reader.node(published.basis.root, 'n');
    const edge = await reader.edge(published.basis.root, encodeEdgeKey('n', 'm', 'rel'));
    expect(node.concurrency.register('title').members.map((member) => member.value)).toEqual(['later', 'v0']);
    expect(edge.concurrency.register('weight').members.map((member) => member.value)).toEqual(['later', 'v0']);
    const records = new ConeRecordCborCodec(codec);
    expect(records.encode(node)).toEqual(records.encode(await reader.node(lateRoot, 'n')));
    expect(records.encode(edge)).toEqual(records.encode(await reader.edge(lateRoot, encodeEdgeKey('n', 'm', 'rel'))));
  } finally {
    try { await repo.history.close(); } finally { await rm(repo.directory, { recursive: true, force: true }); }
  }
}, CASE_TIMEOUT_MS);

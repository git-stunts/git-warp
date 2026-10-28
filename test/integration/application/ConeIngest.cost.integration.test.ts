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

const LANE = 'L';
const CASE_TIMEOUT_MS = 300_000;
/** Patches appended after the first ingest; the second ingest must cost only these. */
const NEW_PATCHES = 3;

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
  return { directory, plumbing, history, journal, store, feed, ingest: new ConeIngest({ store, feed, lane: LANE }) };
}

async function append(repo: Repository, patch: Patch): Promise<string> {
  const targetRef = `refs/warp/${LANE}/writers/${patch.writer}`;
  const head = await repo.history.readRef(targetRef);
  return (await repo.journal.appendPatch({ patch, graph: LANE, writer: patch.writer, targetRef, expectedHead: head, parent: head, attachments: [] })).sha;
}

/** Seeds a generated multi-writer history into real writer chains. */
async function seed(repo: Repository, patches: number): Promise<ConeHistory> {
  const history = new ConeHistoryGenerator(7, { writers: 3, patches, nodes: 12, maxOps: 3, syncChance: 0.4 }).generate();
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
    const stored = await repo.store.readBasis(LANE);
    if (stored === null) {
      throw new Error('ingest published no cone basis');
    }
    const nodeIds = [...history.nodeIds, ...Array.from({ length: NEW_PATCHES }, (_unused, index) => `tail${index}`)];
    const universe = { seed: history.seed, nodeIds, edgeKeys: history.edgeKeys };
    await assertConeEquivalent(universe, reducePatches(await allPatches(repo)), { store: repo.store, root: stored.basis.root });
    return { first, second };
  } finally {
    await rm(repo.directory, { recursive: true, force: true });
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
  // The first ingest folds the whole history, so it grows with it; the second must not.
  expect(large.first.processes).toBeGreaterThan(small.first.processes);
  expect(large.second.processes).toBeLessThanOrEqual(Math.ceil(small.second.processes * 1.25) + 4);
}, CASE_TIMEOUT_MS);

import { describe, expect, it, vi } from 'vitest';
import { Dot } from '../../../../src/domain/crdt/Dot.ts';
import ConeWriterDivergedObstruction from '../../../../src/domain/services/cone/ConeWriterDivergedObstruction.ts';
import ConeWriterPatches from '../../../../src/domain/services/cone/ConeWriterPatches.ts';
import NodeAdd from '../../../../src/domain/types/ops/NodeAdd.ts';
import Patch from '../../../../src/domain/types/Patch.ts';
import { CborPatchJournalAdapter } from '../../../../src/infrastructure/adapters/CborPatchJournalAdapter.ts';
import GitConePatchFeedAdapter from '../../../../src/infrastructure/adapters/GitConePatchFeedAdapter.ts';
import { DEFAULT_COMMIT_MESSAGE_CODEC } from '../../../../src/infrastructure/adapters/TrailerCommitMessageCodecAdapter.ts';
import { CborCodec } from '../../../../src/infrastructure/codecs/CborCodec.ts';
import type { PatchCommitMessage } from '../../../../src/ports/CommitMessageCodecPort.ts';
import InMemoryBlobStorageAdapter from '../../../helpers/InMemoryBlobStorageAdapter.ts';
import InMemoryGitCasFacade from '../../../helpers/InMemoryGitCasFacade.ts';
import InMemoryGraphAdapter from '../../../helpers/InMemoryGraphAdapter.ts';

const LANE = 'events';
const ref = (writer: string): string => `refs/warp/${LANE}/writers/${writer}`;

function fixture() {
  let now = 0;
  const history = new InMemoryGraphAdapter({ clock: { now: () => { now += 1000; return now; } } });
  const assets = new InMemoryBlobStorageAdapter();
  const journal = new CborPatchJournalAdapter({
    assetStorage: assets, cas: new InMemoryGitCasFacade({ history, storage: assets }), codec: new CborCodec(),
    commitReader: history, commitMessageCodec: DEFAULT_COMMIT_MESSAGE_CODEC, graph: LANE,
  });
  const feed = new GitConePatchFeedAdapter({ history, journal, commitMessageCodec: DEFAULT_COMMIT_MESSAGE_CODEC });
  const append = async (writer: string, lamport: number, parent: string | null): Promise<string> => (await journal.appendPatch({
    patch: new Patch({ writer, lamport, context: {}, ops: [new NodeAdd(`n${lamport}`, new Dot(writer, lamport))] }),
    graph: LANE, writer, targetRef: ref(writer), expectedHead: await history.readRef(ref(writer)), parent, attachments: [],
  })).sha;
  return { history, journal, feed, append };
}

async function patchesOf(result: Promise<ConeWriterPatches | ConeWriterDivergedObstruction>): Promise<number[]> {
  const range = await result;
  expect(range).toBeInstanceOf(ConeWriterPatches);
  return range instanceof ConeWriterPatches ? range.entries.map((entry) => entry.patch.lamport) : [];
}

describe('GitConePatchFeedAdapter', () => {
  it('lists every writer tip of the lane', async () => {
    const { history, feed, append } = fixture();
    const tip1 = await append('w1', 1, null);
    const tip2 = await append('w2', 1, null);
    await history.updateRef(`refs/warp/${LANE}/writers/nested/name`, tip1);
    const listings = vi.spyOn(history, 'readRefTargets');
    const reads = vi.spyOn(history, 'readRef');
    expect(await feed.writerTips(LANE)).toEqual(new Map([['w1', tip1], ['w2', tip2]]));
    expect(listings).toHaveBeenCalledTimes(1);
    expect(reads).not.toHaveBeenCalled();
    listings.mockResolvedValueOnce(new Map([[`refs/warp/${LANE}/writers/w2`, tip2], ['refs/warp/elsewhere', tip1]]));
    expect(await feed.writerTips(LANE)).toEqual(new Map([['w2', tip2]]));
    listings.mockRestore();
    reads.mockRestore();
  });

  it('returns a range oldest first from one bulk log, decoding each patch once', async () => {
    const { history, journal, feed, append } = fixture();
    const first = await append('w1', 1, null);
    const second = await append('w1', 2, first);
    const third = await append('w1', 3, second);
    const logs = vi.spyOn(history, 'logNodesStream');
    const reads = vi.spyOn(journal, 'readPatch');
    expect(await patchesOf(feed.patchesAfter(LANE, 'w1', { fromSha: first, toSha: third }))).toEqual([2, 3]);
    expect(logs).toHaveBeenCalledTimes(1);
    expect(logs.mock.calls[0]?.[0]).toMatchObject({ ref: third, stopAt: first, firstParent: true });
    expect(reads).toHaveBeenCalledTimes(2);
    expect(await patchesOf(feed.patchesAfter(LANE, 'w1', { fromSha: null, toSha: third }))).toEqual([1, 2, 3]);
    expect(logs.mock.calls[1]?.[0]).not.toHaveProperty('stopAt');
  });

  it('reports a tip that does not descend from the folded position', async () => {
    const { feed, append } = fixture();
    const first = await append('w1', 1, null);
    await append('w1', 2, first);
    const rewritten = await append('w1', 3, null);
    const range = await feed.patchesAfter(LANE, 'w1', { fromSha: first, toSha: rewritten });
    expect(range).toEqual(new ConeWriterDivergedObstruction({ writerId: 'w1', foldedSha: first, tipSha: rewritten }));
  });

  it('stops at a non-patch commit, which only a range from the chain start may do', async () => {
    const { history, feed, append } = fixture();
    const anchor = await history.commitNode({ message: 'not a patch', parents: [] });
    await history.updateRef(ref('w1'), anchor);
    const tip = await append('w1', 1, anchor);
    expect(await patchesOf(feed.patchesAfter(LANE, 'w1', { fromSha: null, toSha: tip }))).toEqual([1]);
    const unrelated = await append('w2', 1, null);
    expect(await feed.patchesAfter(LANE, 'w1', { fromSha: unrelated, toSha: tip })).toBeInstanceOf(ConeWriterDivergedObstruction);
  });

  it('refuses histories that cross their identity or are not linear', async () => {
    const { history, feed, append } = fixture();
    const first = await append('w1', 1, null);
    await expect(feed.patchesAfter('other', 'w1', { fromSha: null, toSha: first })).rejects.toMatchObject({ code: 'E_SYNC_PATCH_HISTORY' });
    await expect(feed.patchesAfter(LANE, 'w2', { fromSha: null, toSha: first })).rejects.toMatchObject({ code: 'E_SYNC_PATCH_HISTORY' });
    const other = await append('w2', 1, null);
    const message = (await history.getNodeInfo(first)).message;
    const merge = await history.commitNode({ message, parents: [first, other] });
    await expect(feed.patchesAfter(LANE, 'w1', { fromSha: null, toSha: merge })).rejects.toMatchObject({ code: 'E_SYNC_PATCH_HISTORY' });
  });

  it('refuses a payload that contradicts its history trailer', async () => {
    const { history, append } = fixture();
    const first = await append('w1', 1, null);
    const lying = {
      readPatch: async (_message: PatchCommitMessage): Promise<Patch> => new Patch({ writer: 'w1', lamport: 9, context: {}, ops: [] }),
    };
    const feed = new GitConePatchFeedAdapter({ history, journal: lying, commitMessageCodec: DEFAULT_COMMIT_MESSAGE_CODEC });
    await expect(feed.patchesAfter(LANE, 'w1', { fromSha: null, toSha: first })).rejects.toMatchObject({ code: 'E_SYNC_PATCH_HISTORY' });
  });
});

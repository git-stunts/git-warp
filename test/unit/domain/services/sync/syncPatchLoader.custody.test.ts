import { expect, it } from 'vitest';
import { loadPatchFromCommit, loadPatchRange, normalizePatch } from '../../../../../src/domain/services/sync/syncPatchLoader.ts';
import Patch from '../../../../../src/domain/types/Patch.ts';
import NodeAdd from '../../../../../src/domain/types/ops/NodeAdd.ts';
import { Dot } from '../../../../../src/domain/crdt/Dot.ts';
import VersionVector from '../../../../../src/domain/crdt/VersionVector.ts';
import ObservedWriterHead from '../../../../../src/domain/types/ObservedWriterHead.ts';
import ObservedWriteFrontier from '../../../../../src/domain/types/ObservedWriteFrontier.ts';
import PersistenceError from '../../../../../src/domain/errors/PersistenceError.ts';
import { CborPatchJournalAdapter } from '../../../../../src/infrastructure/adapters/CborPatchJournalAdapter.ts';
import { DEFAULT_COMMIT_MESSAGE_CODEC } from '../../../../../src/infrastructure/adapters/TrailerCommitMessageCodecAdapter.ts';
import { CborCodec } from '../../../../../src/infrastructure/codecs/CborCodec.ts';
import InMemoryBlobStorageAdapter from '../../../../helpers/InMemoryBlobStorageAdapter.ts';
import InMemoryGitCasFacade from '../../../../helpers/InMemoryGitCasFacade.ts';
import InMemoryGraphAdapter from '../../../../helpers/InMemoryGraphAdapter.ts';

const TARGET_REF = 'refs/warp/events/writers/alice';
function fixture() {
  const history = new InMemoryGraphAdapter();
  const assets = new InMemoryBlobStorageAdapter();
  const cas = new InMemoryGitCasFacade({ history, storage: assets });
  const journal = new CborPatchJournalAdapter({
    assetStorage: assets, cas, codec: new CborCodec(), commitReader: history,
    commitMessageCodec: DEFAULT_COMMIT_MESSAGE_CODEC, graph: 'events',
  });
  return { history, journal, options: { patchJournal: journal, commitMessageCodec: DEFAULT_COMMIT_MESSAGE_CODEC } };
}
async function publishedChain() {
  const fields = fixture();
  const first = await fields.journal.appendPatch({
    patch: new Patch({ writer: 'alice', lamport: 1, context: {}, ops: [new NodeAdd('first', new Dot('alice', 1))] }),
    graph: 'events', writer: 'alice', targetRef: TARGET_REF, expectedHead: null, parent: null, attachments: [],
  });
  const observation = new ObservedWriteFrontier('events', [new ObservedWriterHead('alice', first.sha, 1)]);
  const second = await fields.journal.appendPatch({
    patch: new Patch({ writer: 'alice', lamport: 2, context: { alice: 1 },
      ops: [new NodeAdd('second', new Dot('alice', 2))], observedFrontier: observation }),
    graph: 'events', writer: 'alice', targetRef: TARGET_REF, expectedHead: first.sha, parent: first.sha, attachments: [],
  });
  return { ...fields, first, second };
}

it('loads retained observations and causal context from the authoritative patch asset', async () => {
  const { history, first, second, options } = await publishedChain();
  const patch = await loadPatchFromCommit(history, second.sha, options);
  expect(patch).toBeInstanceOf(Patch);
  expect(patch.observedFrontier?.frontier()).toEqual(new Map([['alice', first.sha]]));
  expect(patch.context).toBeInstanceOf(VersionVector);
  expect(VersionVector.from(patch.context ?? {}).get('alice')).toBe(1);
  expect(patch.ops[0]).toBeInstanceOf(NodeAdd);
});

it('walks a mixed legacy and observed writer chain in chronological order', async () => {
  const { history, first, second, options } = await publishedChain();
  const patches = await loadPatchRange(history, 'events', 'alice', null, second.sha, options);
  expect(patches.map(entry => entry.sha)).toEqual([first.sha, second.sha]);
  expect(Object.hasOwn(patches[0]?.patch ?? {}, 'observedFrontier')).toBe(false);
  expect(patches[1]?.patch.observedFrontier?.frontier()).toEqual(new Map([['alice', first.sha]]));
});

it('honors the exclusive writer predecessor when loading a sync suffix', async () => {
  const { history, first, second, options } = await publishedChain();
  const patches = await loadPatchRange(history, 'events', 'alice', first.sha, second.sha, options);
  expect(patches.map(entry => entry.sha)).toEqual([second.sha]);
  expect(patches[0]?.patch.observedFrontier?.frontier()).toEqual(new Map([['alice', first.sha]]));
});

it('refuses divergence without changing the published writer ref', async () => {
  const { history, second, options } = await publishedChain();
  await expect(loadPatchRange(history, 'events', 'alice', 'absent-parent', second.sha, options))
    .rejects.toMatchObject({ code: 'E_SYNC_DIVERGENCE' });
  expect(await history.readRef(TARGET_REF)).toBe(second.sha);
});

it('requires the injected journal rather than inventing patch asset access', async () => {
  const { history, first } = await publishedChain();
  await expect(loadPatchFromCommit(history, first.sha)).rejects.toBeInstanceOf(PersistenceError);
  await expect(loadPatchRange(history, 'events', 'alice', null, first.sha))
    .rejects.toBeInstanceOf(PersistenceError);
});

it.each([null, undefined])('normalizes legacy missing context and schema without inventing observations: %s', context => {
  const patch = normalizePatch({ writer: 'alice', lamport: 1, context, ops: [] });
  expect(patch.schema).toBe(2);
  expect(VersionVector.from(patch.context ?? {}).size).toBe(0);
  expect(Object.hasOwn(patch, 'observedFrontier')).toBe(false);
});

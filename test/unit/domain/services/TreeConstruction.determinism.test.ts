import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { createRng } from '../../../helpers/seededRng.ts';
import { Dot } from '../../../../src/domain/crdt/Dot.ts';
import { createEmptyState, encodePropKey } from '../../../../src/domain/services/JoinReducer.ts';
import StateHashService from '../../../../src/domain/services/state/StateHashService.ts';
import AssetHandle from '../../../../src/domain/storage/AssetHandle.ts';
import Patch from '../../../../src/domain/types/Patch.ts';
import NodeAdd from '../../../../src/domain/types/ops/NodeAdd.ts';
import { CborPatchJournalAdapter } from '../../../../src/infrastructure/adapters/CborPatchJournalAdapter.ts';
import NodeCryptoAdapter from '../../../../src/infrastructure/adapters/NodeCryptoAdapter.ts';
import defaultCodec from '../../../../src/infrastructure/codecs/CborCodec.ts';
import InMemoryBlobStorageAdapter from '../../../helpers/InMemoryBlobStorageAdapter.ts';
import InMemoryGitCasFacade from '../../../helpers/InMemoryGitCasFacade.ts';
import InMemoryGraphAdapter from '../../../helpers/InMemoryGraphAdapter.ts';

const PROPERTY_TEST_SEED = 4242;
const contentIdsArb = fc.uniqueArray(fc.integer({ min: 1, max: 0xffff }), {
  minLength: 1,
  maxLength: 8,
});
const stateHashService = new StateHashService({
  codec: defaultCodec,
  crypto: new NodeCryptoAdapter(),
});

describe('semantic storage determinism', () => {
  it('produces the same patch bundle handle for attachment permutations', async () => {
    await fc.assert(
      fc.asyncProperty(contentIdsArb, fc.integer(), async (contentIds, seed) => {
        const handles = contentIds.map((id) => new AssetHandle(`asset:${id}`));
        const baseline = await publish(handles);
        const shuffled = await publish(createRng(seed).shuffle(handles));
        expect(shuffled).toBe(baseline);
      }),
      { seed: PROPERTY_TEST_SEED, numRuns: 40 },
    );
  });

  it('produces the same checkpoint state hash for insertion permutations', async () => {
    await fc.assert(
      fc.asyncProperty(contentIdsArb, fc.integer(), async (contentIds, seed) => {
        const baseline = await stateHash(contentIds);
        const shuffled = await stateHash(createRng(seed).shuffle(contentIds));
        expect(shuffled).toBe(baseline);
      }),
      { seed: PROPERTY_TEST_SEED, numRuns: 40 },
    );
  });
});

async function publish(attachments: readonly AssetHandle[]): Promise<string> {
  const history = new InMemoryGraphAdapter();
  const assets = new InMemoryBlobStorageAdapter();
  const cas = new InMemoryGitCasFacade({ history, storage: assets });
  const journal = new CborPatchJournalAdapter({
    assetStorage: assets,
    cas,
    codec: defaultCodec,
    commitReader: history,
  });
  const patch = new Patch({
    schema: 2,
    writer: 'alice',
    lamport: 1,
    context: {},
    ops: [new NodeAdd('node:a', Dot.create('alice', 1))],
    reads: [],
    writes: ['node:a'],
  });
  const published = await journal.appendPatch({
    patch,
    graph: 'events',
    writer: 'alice',
    targetRef: 'refs/warp/events/writers/alice',
    expectedHead: null,
    parent: null,
    attachments,
  });
  return published.bundleHandle.toString();
}

async function stateHash(contentIds: readonly number[]): Promise<string> {
  const state = createEmptyState();
  for (const contentId of contentIds) {
    const nodeId = `node:${contentId}`;
    state.nodeAlive.add(nodeId, Dot.create('alice', contentId));
    state.mutatePropLWW(
      encodePropKey(nodeId, 'content'),
      {
        lamport: contentId,
        writerId: 'alice',
        patchSha: contentId.toString(16).padStart(40, '0'),
        opIndex: 0,
      },
      `asset:${contentId}`,
    );
  }
  return await stateHashService.compute(state);
}

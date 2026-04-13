import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { createRng } from '../../../helpers/seededRng.js';
import { PatchBuilder } from '../../../../src/domain/services/PatchBuilder.ts';
import VersionVector from '../../../../src/domain/crdt/VersionVector.ts';
import { createFrontier, updateFrontier } from '../../../../src/domain/services/Frontier.ts';
import { createV5 } from '../../../../src/domain/services/state/checkpointCreate.ts';
import { createEmptyState, encodeEdgeKey as encodeEdgeKeyV5, encodePropKey as encodePropKeyV5 } from '../../../../src/domain/services/JoinReducer.ts';
import { Dot } from '../../../../src/domain/crdt/Dot.ts';
import { CONTENT_PROPERTY_KEY, encodeEdgePropKey } from '../../../../src/domain/services/KeyCodec.ts';
import InMemoryGraphAdapter from '../../../../src/infrastructure/adapters/InMemoryGraphAdapter.ts';
import InMemoryBlobStorageAdapter from '../../../../src/domain/utils/defaultBlobStorage.ts';
import NodeCryptoAdapter from '../../../../src/infrastructure/adapters/NodeCryptoAdapter.js';
import { CborPatchJournalAdapter } from '../../../../src/infrastructure/adapters/CborPatchJournalAdapter.js';
import { CborCodec } from '../../../../src/infrastructure/codecs/CborCodec.js';

const PROPERTY_TEST_SEED = 4242;
const FIXED_CLOCK = { now: () => 42 };
const FIXED_AUTHOR = 'Determinism <determinism@test>';
const crypto = new NodeCryptoAdapter();

const contentIdsArb = fc.uniqueArray(fc.integer({ min: 1, max: 0xffff }), {
  minLength: 1,
  maxLength: 5,
});

/**
 * @param {number} value
 * @returns {string}
 */
function makeOid(value) {
  return value.toString(16).padStart(40, '0');
}

/**
 * @param {number[]} contentIds
 * @param {number|null} shuffleSeed
 * @returns {Promise<string>}
 */
async function createPatchTreeOid(contentIds, shuffleSeed) {
  const persistence = new InMemoryGraphAdapter({
    author: FIXED_AUTHOR,
    clock: FIXED_CLOCK,
  });

  const builder = new PatchBuilder((({
    persistence,
    patchJournal: new CborPatchJournalAdapter({
      codec: new CborCodec(),
      blobPort: persistence,
    }),
    graphName: 'g',
    writerId: 'alice',
    lamport: 1,
    versionVector: VersionVector.empty(),
    getCurrentState: () => null,
    expectedParentSha: null,
    blobStorage: new InMemoryBlobStorageAdapter(),
  }) as any));

  for (let i = 0; i < contentIds.length; i++) {
    builder.addNode(`n${i}`);
  }
  builder.addNode('dup');

  for (let i = 0; i < contentIds.length; i++) {
    await builder.attachContent(`n${i}`, `payload:${contentIds[i]}`);
  }
  await builder.attachContent('dup', `payload:${contentIds[0]}`);

  if (shuffleSeed !== null) {
    ((builder))._contentBlobs = createRng(shuffleSeed).shuffle(((builder))._contentBlobs);
  }

  const commitSha = await builder.commit();
  return await persistence.getCommitTree(commitSha);
}

/**
 * @param {number[]} contentIds
 * @param {number|null} shuffleSeed
 * @returns {Promise<string>}
 */
async function createCheckpointTreeOid(contentIds, shuffleSeed) {
  const persistence = new InMemoryGraphAdapter({
    author: FIXED_AUTHOR,
    clock: FIXED_CLOCK,
  });
  const state = createEmptyState();
  const frontier = createFrontier();
  updateFrontier(frontier, 'alice', makeOid(0xabc));

  /** @type {Array<{ key: string, value: unknown, eventId: { lamport: number, writerId: string, patchSha: string, opIndex: number } }>} */
  const propItems = [];

  for (let i = 0; i < contentIds.length; i++) {
    const nodeId = `n${i}`;
    state.nodeAlive.add(nodeId, Dot.create('alice', i + 1));
    propItems.push({
      key: encodePropKeyV5(nodeId, CONTENT_PROPERTY_KEY),
      value: makeOid((contentIds[i] as number)),
      eventId: {
        lamport: i + 1,
        writerId: 'alice',
        patchSha: makeOid(0x1000 + i),
        opIndex: 0,
      },
    });
  }

  state.nodeAlive.add('dup', Dot.create('alice', contentIds.length + 1));
  propItems.push({
    key: encodePropKeyV5('dup', CONTENT_PROPERTY_KEY),
    value: makeOid((contentIds[0] as number)),
    eventId: {
      lamport: contentIds.length + 1,
      writerId: 'alice',
      patchSha: makeOid(0x2000),
      opIndex: 0,
    },
  });

  if (contentIds.length > 1) {
    const edgeFrom = 'n0';
    const edgeTo = `n${contentIds.length - 1}`;
    const edgeLabel = 'rel';
    state.edgeAlive.add(
      encodeEdgeKeyV5(edgeFrom, edgeTo, edgeLabel),
      Dot.create('alice', contentIds.length + 2),
    );
    propItems.push({
      key: encodeEdgePropKey(edgeFrom, edgeTo, edgeLabel, CONTENT_PROPERTY_KEY),
      value: makeOid((contentIds[0] as number)),
      eventId: {
        lamport: contentIds.length + 2,
        writerId: 'alice',
        patchSha: makeOid(0x3000),
        opIndex: 0,
      },
    });
  }

  propItems.push({
    key: encodePropKeyV5('n0', 'name'),
    value: 'ignore-me',
    eventId: {
      lamport: contentIds.length + 3,
      writerId: 'alice',
      patchSha: makeOid(0x4000),
      opIndex: 0,
    },
  });

  const orderedItems = shuffleSeed === null
    ? propItems
    : createRng(shuffleSeed).shuffle(propItems);

  for (const item of orderedItems) {
    state.prop.set((item as any).key, {
      eventId: (item as any).eventId,
      value: ((item as any).value as any),
    });
  }

  const checkpointSha = await createV5({
    persistence,
    graphName: 'g',
    state,
    frontier,
    crypto,
  });

  return await persistence.getCommitTree(checkpointSha);
}

describe('tree construction determinism (B99)', () => {
  it('PatchBuilder tree OID is stable across content-blob order permutations', async () => {
    await fc.assert(
      fc.asyncProperty(contentIdsArb, fc.integer(), async (contentIds, shuffleSeed) => {
        const baselineTreeOid = await createPatchTreeOid(contentIds, null);
        const shuffledTreeOid = await createPatchTreeOid(contentIds, shuffleSeed);
        expect(shuffledTreeOid).toBe(baselineTreeOid);
      }),
      { seed: PROPERTY_TEST_SEED, numRuns: 40 },
    );
  });

  it('CheckpointService tree OID is stable across content-property insertion orders', async () => {
    await fc.assert(
      fc.asyncProperty(contentIdsArb, fc.integer(), async (contentIds, shuffleSeed) => {
        const baselineTreeOid = await createCheckpointTreeOid(contentIds, null);
        const shuffledTreeOid = await createCheckpointTreeOid(contentIds, shuffleSeed);
        expect(shuffledTreeOid).toBe(baselineTreeOid);
      }),
      { seed: PROPERTY_TEST_SEED, numRuns: 40 },
    );
  });
});

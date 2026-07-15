import { describe, expect, it } from 'vitest';

import type { WarpIntentDescriptor } from '../../../../src/domain/types/WarpIntentDescriptor.ts';
import GitCasAssetStorageAdapter from '../../../../src/infrastructure/adapters/GitCasAssetStorageAdapter.ts';
import GitCasIntentStoreAdapter from '../../../../src/infrastructure/adapters/GitCasIntentStoreAdapter.ts';
import { CborCodec } from '../../../../src/infrastructure/codecs/CborCodec.ts';
import InMemoryBlobStorageAdapter from '../../../helpers/InMemoryBlobStorageAdapter.ts';
import InMemoryGitCasFacade from '../../../helpers/InMemoryGitCasFacade.ts';
import InMemoryGraphAdapter from '../../../helpers/InMemoryGraphAdapter.ts';

const SHA = 'a'.repeat(40);

function createFixture() {
  const history = new InMemoryGraphAdapter();
  const backing = new InMemoryBlobStorageAdapter();
  const cas = new InMemoryGitCasFacade({ history, storage: backing });
  const assets = new GitCasAssetStorageAdapter({ cas, legacyReader: history });
  const codec = new CborCodec();
  const intents = new GitCasIntentStoreAdapter({ history, cas, assets, codec });
  return { assets, backing, cas, codec, history, intents };
}

function descriptor(intentId: string): WarpIntentDescriptor {
  return {
    intentId,
    nutritionLabel: {
      bundleHash: `bundle-${intentId}`,
      coreHash: `core-${intentId}`,
      profile: 'default',
      budget: 'bounded',
    },
    precommitGuards: [
      {
        op: 'nodeStatus',
        nodeId: 'node:a',
        expected: 'ready',
        failureTag: 'not-ready',
      },
      {
        op: 'nodeUnassignedOrSelf',
        nodeId: 'node:b',
        agentId: 'alice',
        failureTag: 'assigned',
      },
      {
        op: 'edgeExists',
        nodeId: 'node:c',
        failureTag: 'edge-missing',
      },
    ],
    suffixTransform: {
      op: 'append',
      payload: { intentId },
    },
  };
}

describe('GitCasIntentStoreAdapter', () => {
  it('publishes retained descriptors and scans them in causal order', async () => {
    const { intents } = createFixture();
    const first = await intents.publish({
      graphName: 'events',
      channel: 'queued',
      ownerId: 'alice',
      descriptor: descriptor('intent-1'),
    });
    const second = await intents.publish({
      graphName: 'events',
      channel: 'queued',
      ownerId: 'alice',
      descriptor: descriptor('intent-2'),
    });

    expect(first.retention).toMatchObject({
      policy: 'pinned',
      reachability: 'anchored',
      root: { kind: 'publication', generation: first.sha },
    });
    expect(second.sha).not.toBe(first.sha);
    await expect(intents.scan('events', 'queued', 'alice').collect())
      .resolves.toEqual([descriptor('intent-1'), descriptor('intent-2')]);
  });

  it('rejects parent cycles, nonlinear history, and identity substitution', async () => {
    const fixture = createFixture();
    const published = await fixture.intents.publish({
      graphName: 'events',
      channel: 'queued',
      ownerId: 'alice',
      descriptor: descriptor('intent-1'),
    });
    const node = await fixture.history.getNodeInfo(published.sha);
    const cycle = new GitCasIntentStoreAdapter({
      history: fixedHistory(node.message, [SHA]),
      cas: fixture.cas,
      assets: fixture.assets,
      codec: fixture.codec,
    });
    const substituted = new GitCasIntentStoreAdapter({
      history: fixedHistory(node.message),
      cas: fixture.cas,
      assets: fixture.assets,
      codec: fixture.codec,
    });
    const nonlinear = new GitCasIntentStoreAdapter({
      history: fixedHistory(node.message, [SHA, 'b'.repeat(40)]),
      cas: fixture.cas,
      assets: fixture.assets,
      codec: fixture.codec,
    });

    await expect(cycle.scan('events', 'queued', 'alice').collect())
      .rejects.toMatchObject({ code: 'E_INTENT_JOURNAL_CYCLE' });
    await expect(substituted.scan('events', 'admitted', 'alice').collect())
      .rejects.toMatchObject({ code: 'E_INTENT_JOURNAL_IDENTITY' });
    await expect(nonlinear.scan('events', 'queued', 'alice').collect())
      .rejects.toMatchObject({ code: 'E_INTENT_JOURNAL_NON_LINEAR' });
  });

  it('rejects malformed journal trailers and channel values', async () => {
    const fixture = createFixture();
    const malformedChannel = journalWithHandle(
      fixture,
      fixture.assets,
      'invalid',
    );
    const missingTrailers = new GitCasIntentStoreAdapter({
      history: fixedHistory('warp:intent'),
      cas: fixture.cas,
      assets: fixture.assets,
      codec: fixture.codec,
    });

    await expect((await malformedChannel).scan('events', 'queued', 'alice').collect())
      .rejects.toMatchObject({ code: 'E_INTENT_JOURNAL_MESSAGE' });
    await expect(missingTrailers.scan('events', 'queued', 'alice').collect())
      .rejects.toMatchObject({ code: 'E_INTENT_JOURNAL_MESSAGE' });
  });

  it.each([
    null,
    {},
    { ...descriptor('bad-guards'), precommitGuards: 'not-an-array' },
    {
      ...descriptor('bad-op'),
      precommitGuards: [{
        op: 'unknown',
        nodeId: 'node:a',
        failureTag: 'bad-op',
      }],
    },
    {
      ...descriptor('bad-optional'),
      precommitGuards: [{
        op: 'nodeStatus',
        nodeId: 'node:a',
        expected: '',
        failureTag: 'bad-optional',
      }],
    },
  ])('rejects malformed descriptor assets without partial hydration', async (value) => {
    const fixture = createFixture();
    const bytes = fixture.codec.encode(value);
    const staged = await fixture.assets.stage(singleChunk(bytes), {
      slug: 'malformed-intent',
      filename: 'intent.cbor',
    });
    const journal = await journalWithHandle(fixture, fixture.assets, 'queued', staged.handle.toString());

    await expect(journal.scan('events', 'queued', 'alice').collect())
      .rejects.toMatchObject({ code: 'E_INTENT_DESCRIPTOR_ASSET' });
  });
});

function fixedHistory(message: string, parents: string[] = []) {
  return {
    readRef: async (): Promise<string> => SHA,
    getNodeInfo: async (): Promise<{ message: string; parents: string[] }> => ({
      message,
      parents,
    }),
  };
}

async function journalWithHandle(
  fixture: ReturnType<typeof createFixture>,
  assets: GitCasAssetStorageAdapter,
  channel: string,
  handle = 'unused',
): Promise<GitCasIntentStoreAdapter> {
  const message = [
    'warp:intent',
    '',
    'eg-graph: events',
    `eg-intent-channel: ${channel}`,
    'eg-intent-owner: alice',
    `eg-intent-descriptor-handle: ${handle}`,
  ].join('\n');
  return new GitCasIntentStoreAdapter({
    history: fixedHistory(message),
    cas: fixture.cas,
    assets,
    codec: fixture.codec,
  });
}

async function* singleChunk(bytes: Uint8Array): AsyncGenerator<Uint8Array> {
  yield bytes;
}

import { describe, expect, it } from 'vitest';

import { DEFAULT_COMMIT_MESSAGE_CODEC } from '../../../src/infrastructure/adapters/TrailerCommitMessageCodecAdapter.ts';
import defaultCrypto from '../../../src/infrastructure/adapters/NodeCryptoSingleton.ts';
import defaultCodec from '../../../src/infrastructure/codecs/CborCodec.ts';
import type SyncReplayProtectionPort from '../../../src/ports/SyncReplayProtectionPort.ts';
import InMemoryGraphAdapter from '../../helpers/InMemoryGraphAdapter.ts';
import ManualClock, { MANUAL_CLOCK_EPOCH_MS } from '../../helpers/ManualClock.ts';
import MemoryRuntimeStorageAdapter, { withFixtureObjectTypeProbe } from '../../helpers/MemoryRuntimeStorageAdapter.ts';

const REPLAY_TTL_MS = 1_000;
const REPLAY_REQUEST = Object.freeze({ keyId: 'default', nonce: 'nonce-1', ttlMs: REPLAY_TTL_MS });

async function replayStoreOf(storage: MemoryRuntimeStorageAdapter): Promise<SyncReplayProtectionPort> {
  const services = await storage.createRuntimeStorageServices({
    timelineName: 'events',
    codec: defaultCodec,
    crypto: defaultCrypto,
    commitMessageCodec: DEFAULT_COMMIT_MESSAGE_CODEC,
  });
  if (services.syncReplayProtection === undefined) {
    throw new Error('expected memory storage to supply sync replay protection');
  }
  return services.syncReplayProtection;
}

describe('MemoryRuntimeStorageAdapter sync replay clock', () => {
  // Oracle: the SyncReplayProtectionPort contract. A reservation is stamped with the
  // store's time and holds its nonce until reservation time plus ttlMs. The store's
  // time here must be the clock that the adapter's builder supplies.
  it('stamps and expires replay reservations on the clock that its builder supplies', async () => {
    const clock = new ManualClock();
    const replay = await replayStoreOf(new MemoryRuntimeStorageAdapter({
      history: new InMemoryGraphAdapter(),
      clock,
    }));

    await expect(replay.reserve(REPLAY_REQUEST)).resolves.toMatchObject({
      admitted: true,
      reservedAtMs: MANUAL_CLOCK_EPOCH_MS,
      completedAtMs: MANUAL_CLOCK_EPOCH_MS,
      expiresAt: new Date(MANUAL_CLOCK_EPOCH_MS + REPLAY_TTL_MS).toISOString(),
    });
    clock.advance(REPLAY_TTL_MS - 1);
    await expect(replay.reserve(REPLAY_REQUEST)).resolves.toMatchObject({ admitted: false });
    clock.advance(1);
    await expect(replay.reserve(REPLAY_REQUEST)).resolves.toMatchObject({
      admitted: true,
      reservedAtMs: MANUAL_CLOCK_EPOCH_MS + REPLAY_TTL_MS,
    });
  });
});

describe('MemoryRuntimeStorageAdapter object type probe', () => {
  it('preserves normalized blob, tree, and commit object kinds', async () => {
    const history = new InMemoryGraphAdapter();
    Object.defineProperty(history, 'readObjectType', {
      configurable: true,
      value: undefined,
    });
    const probed = withFixtureObjectTypeProbe(history);
    const blobOid = await probed.writeBlob('content');
    const treeOid = await probed.writeTree([
      `100644 blob ${blobOid}\tcontent`,
    ]);
    const commitOid = await probed.commitNodeWithTree({
      treeOid,
      message: 'publish content',
    });

    await expect(probed.readObjectType(blobOid)).resolves.toBe('blob');
    await expect(probed.readObjectType(treeOid)).resolves.toBe('tree');
    await expect(probed.readObjectType(probed.emptyTree)).resolves.toBe('tree');
    await expect(probed.readObjectType(commitOid)).resolves.toBe('commit');
  });
});

import { describe, expect, it } from 'vitest';

import { getDefaultRuntimeHostNodePorts } from '../../../src/application/RuntimeHostNodeDefaults.ts';
import RuntimeHost from '../../../src/domain/RuntimeHost.ts';
import { DEFAULT_COMMIT_MESSAGE_CODEC } from '../../../src/infrastructure/adapters/TrailerCommitMessageCodecAdapter.ts';
import defaultCrypto from '../../../src/infrastructure/adapters/NodeCryptoSingleton.ts';
import defaultCodec from '../../../src/infrastructure/codecs/CborCodec.ts';
import type ClockPort from '../../../src/ports/ClockPort.ts';
import type SyncReplayProtectionPort from '../../../src/ports/SyncReplayProtectionPort.ts';
import InMemoryGraphAdapter from '../../helpers/InMemoryGraphAdapter.ts';
import ManualClock, { MANUAL_CLOCK_EPOCH_MS } from '../../helpers/ManualClock.ts';
import { createMemoryRuntimeStorage, openMemoryRuntimeHostProduct } from '../../helpers/MemoryRuntimeHost.ts';

const GRAPH_NAME = 'events';
const REPLAY_REQUEST = Object.freeze({ keyId: 'default', nonce: 'nonce-1', ttlMs: 1_000 });

async function openHost(history: InMemoryGraphAdapter, clock: ClockPort | undefined): Promise<RuntimeHost> {
  const host = await openMemoryRuntimeHostProduct({
    persistence: history,
    graphName: GRAPH_NAME,
    writerId: 'alice',
    ...(clock === undefined ? {} : { clock }),
  });
  if (!(host instanceof RuntimeHost)) {
    throw new Error('expected the memory runtime host');
  }
  return host;
}

async function replayStoreOf(history: InMemoryGraphAdapter, clock: ClockPort): Promise<SyncReplayProtectionPort | undefined> {
  const services = await createMemoryRuntimeStorage(history, clock).createRuntimeStorageServices({
    timelineName: GRAPH_NAME,
    codec: defaultCodec,
    crypto: defaultCrypto,
    commitMessageCodec: DEFAULT_COMMIT_MESSAGE_CODEC,
  });
  return services.syncReplayProtection;
}

describe('memory runtime host storage clock', () => {
  // Oracle: issue #1172. The runtime and its replay store share one clock, so the
  // store stamps a reservation with the configured clock's reading.
  it('gives the replay store the clock that the runtime is opened with', async () => {
    const history = new InMemoryGraphAdapter();
    const clock = new ManualClock();
    const host = await openHost(history, clock);

    expect(await replayStoreOf(history, clock)).toBe(host._syncReplayProtection);
    await expect(host._syncReplayProtection?.reserve(REPLAY_REQUEST)).resolves.toMatchObject({
      admitted: true,
      reservedAtMs: MANUAL_CLOCK_EPOCH_MS,
    });
  });

  it('gives the replay store the default runtime clock when the runtime has no configured clock', async () => {
    const history = new InMemoryGraphAdapter();
    const host = await openHost(history, undefined);

    expect(await replayStoreOf(history, getDefaultRuntimeHostNodePorts().clock))
      .toBe(host._syncReplayProtection);
  });

  it('refuses to reuse a history storage on another clock', async () => {
    const history = new InMemoryGraphAdapter();
    await openHost(history, new ManualClock());

    expect(() => createMemoryRuntimeStorage(history, new ManualClock()))
      .toThrow('this history already has memory storage on another clock');
  });
});

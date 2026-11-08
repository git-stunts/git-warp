import { describe, expect, it } from 'vitest';

import EntropyError from '../../../../src/domain/errors/EntropyError.ts';
import SyncAuthService, { signSyncRequest } from '../../../../src/domain/services/sync/SyncAuthService.ts';
import SyncSecret from '../../../../src/domain/services/sync/SyncSecret.ts';
import defaultCrypto from '../../../../src/infrastructure/adapters/NodeCryptoSingleton.ts';
import type RandomPort from '../../../../src/ports/RandomPort.ts';
import InMemorySyncReplayProtection from '../../../helpers/InMemorySyncReplayProtection.ts';
import SequenceRandomPort from '../../../helpers/SequenceRandomPort.ts';

const SECRET = SyncSecret.fromString('entropy-witness-secret');
const KEY_ID = 'default';
/** RFC 4122 v4 layout of the bytes 0x00..0x0f (version and variant bits set). */
const SEQUENCE_NONCE = '00010203-0405-4607-8809-0a0b0c0d0e0f';

class ShortRandomPort implements RandomPort {
  randomBytes(length: number): Uint8Array {
    return new Uint8Array(length - 4);
  }
}

async function sign(random: RandomPort, lamport = 1): Promise<Record<string, string>> {
  return await signSyncRequest(
    { method: 'POST', path: '/sync', contentType: 'text/plain', body: new TextEncoder().encode('entropy'), secret: SECRET, keyId: KEY_ID, lamport },
    { crypto: defaultCrypto, random },
  );
}

describe('signSyncRequest entropy', () => {
  it('derives the nonce only from the injected port', async () => {
    const random = new SequenceRandomPort(0);

    const first = await sign(random);
    const replay = await sign(new SequenceRandomPort(0));

    expect(first['x-warp-nonce']).toBe(SEQUENCE_NONCE);
    expect(replay).toEqual(first);
    expect(random.requests).toEqual([16]);
  });

  it('keeps the v4 nonce wire format accepted by the verifier', async () => {
    const headers = await sign(new SequenceRandomPort(0xf0), 7);
    const service = new SyncAuthService({
      keys: { [KEY_ID]: SECRET },
      crypto: defaultCrypto,
      replayProtection: new InMemorySyncReplayProtection(),
    });

    expect(headers['x-warp-nonce']).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    await expect(service.verify({
      method: 'POST',
      url: '/sync',
      headers: { 'content-type': 'text/plain', ...headers },
      body: new TextEncoder().encode('entropy'),
    })).resolves.toEqual({ ok: true });
  });

  it('fails closed when the port returns too few bytes', async () => {
    await expect(sign(new ShortRandomPort())).rejects.toBeInstanceOf(EntropyError);
    await expect(sign(new ShortRandomPort())).rejects.toMatchObject({ code: 'E_ENTROPY_SHORT_READ' });
  });
});

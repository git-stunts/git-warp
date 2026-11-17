import { describe, expect, it } from 'vitest';
import SyncAuthService, { signSyncRequest } from '../../../../src/domain/services/sync/SyncAuthService.ts';
import SyncSecret from '../../../../src/domain/services/sync/SyncSecret.ts';
import defaultCrypto from '../../../../src/infrastructure/adapters/NodeCryptoSingleton.ts';
import CryptoPort from '../../../../src/ports/CryptoPort.ts';
import InMemorySyncReplayProtection from '../../../helpers/InMemorySyncReplayProtection.ts';
import ManualClock from '../../../helpers/ManualClock.ts';
import SeededRandomPort from '../../../helpers/SeededRandomPort.ts';

const SECRET = SyncSecret.fromString('digest-length-test-secret');
const BODY = new TextEncoder().encode('{}');
/** Half of an HMAC-SHA256 digest. */
const SHORT_DIGEST_BYTES = 16;

/**
 * A crypto port whose HMAC is shorter than the SHA-256 digest a signer sends, and whose
 * comparison checks only the bytes both buffers have. The port contract leaves both free,
 * so the verifier must refuse a length mismatch itself.
 */
class PrefixComparingShortMacCrypto extends CryptoPort {
  override async hash(algorithm: string, data: string | Uint8Array): Promise<string> {
    return await defaultCrypto.hash(algorithm, data);
  }

  override async hmac(algorithm: string, key: string | Uint8Array, data: string | Uint8Array): Promise<Uint8Array> {
    return (await defaultCrypto.hmac(algorithm, key, data)).subarray(0, SHORT_DIGEST_BYTES);
  }

  override timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
    const length = Math.min(a.length, b.length);
    return defaultCrypto.timingSafeEqual(a.subarray(0, length), b.subarray(0, length));
  }
}

describe('SyncAuthService signature length', () => {
  it('refuses a signature longer than the verifier digest even when its prefix matches', async () => {
    const clock = new ManualClock();
    const headers = await signSyncRequest(
      { method: 'POST', path: '/sync', contentType: 'application/json', body: BODY, secret: SECRET, keyId: 'default' },
      { crypto: defaultCrypto, random: new SeededRandomPort(1112), clock },
    );
    const service = new SyncAuthService({
      keys: { default: SECRET }, crypto: new PrefixComparingShortMacCrypto(), clock,
      replayProtection: new InMemorySyncReplayProtection(clock.read),
    });

    const verdict = await service.verify({
      method: 'POST', url: '/sync', headers: { ...headers, 'content-type': 'application/json' }, body: BODY,
    });

    // Oracle: the verifier's own digest is 16 bytes and the signer sent 32, so no comparison may admit it.
    expect(verdict).toEqual({ ok: false, reason: 'INVALID_SIGNATURE', status: 401 });
  });
});

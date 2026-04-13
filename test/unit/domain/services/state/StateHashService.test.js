import { describe, it, expect, vi } from 'vitest';
import StateHashService from '../../../../../src/domain/services/state/StateHashService.js';
import { createEmptyState } from '../../../../../src/domain/services/JoinReducer.ts';
import { CborCodec } from '../../../../../src/infrastructure/codecs/CborCodec.js';
import CryptoPort from '../../../../../src/ports/CryptoPort.ts';

/**
 * Creates a mock CryptoPort with a hash spy.
 * @param {(algo: string, data: Uint8Array) => Promise<string>} [hashImpl]
 * @returns {CryptoPort}
 */
function createMockCrypto(hashImpl) {
  const mock = /** @type {any} */ (Object.create(CryptoPort.prototype));
  mock.hash = vi.fn(hashImpl ?? (async () => 'deadbeef'.repeat(8)));
  return mock;
}

describe('StateHashService', () => {
  it('requires a codec dependency', () => {
    const crypto = createMockCrypto();
    expect(() => new StateHashService(/** @type {any} */ ({ codec: null, crypto }))).toThrow(
      'StateHashService requires a codec',
    );
  });

  it('requires a crypto dependency', () => {
    expect(() => new StateHashService(/** @type {any} */ ({
      codec: new CborCodec(),
      crypto: null,
    }))).toThrow('StateHashService requires a crypto adapter');
  });

  it('computes a hex hash string', async () => {
    const crypto = createMockCrypto();
    const svc = new StateHashService({ codec: new CborCodec(), crypto });

    const hash = await svc.compute(createEmptyState());

    expect(typeof hash).toBe('string');
    expect(hash).toBe('deadbeef'.repeat(8));
    expect(crypto.hash).toHaveBeenCalledOnce();
    expect(crypto.hash).toHaveBeenCalledWith('sha256', expect.any(Uint8Array));
  });

  it('produces deterministic output for the same state', async () => {
    /** @type {Uint8Array[]} */
    const captured = [];
    const crypto = createMockCrypto(async (_algo, data) => {
      captured.push(data);
      return 'abc';
    });
    const svc = new StateHashService({ codec: new CborCodec(), crypto });

    await svc.compute(createEmptyState());
    await svc.compute(createEmptyState());

    // Same state → same bytes → same hash
    expect(captured).toHaveLength(2);
    expect(Array.from(/** @type {Uint8Array} */ (captured[0]))).toEqual(Array.from(/** @type {Uint8Array} */ (captured[1])));
  });
});

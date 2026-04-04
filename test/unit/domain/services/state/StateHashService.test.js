import { describe, it, expect, vi } from 'vitest';
import StateHashService from '../../../../../src/domain/services/state/StateHashService.js';
import { createEmptyStateV5 } from '../../../../../src/domain/services/JoinReducer.js';
import { CborCodec } from '../../../../../src/infrastructure/codecs/CborCodec.js';

describe('StateHashService', () => {
  it('computes a hex hash string', async () => {
    const crypto = { hash: vi.fn().mockResolvedValue('deadbeef'.repeat(8)) };
    const svc = new StateHashService({ codec: new CborCodec(), crypto });

    const hash = await svc.compute(createEmptyStateV5());

    expect(typeof hash).toBe('string');
    expect(hash).toBe('deadbeef'.repeat(8));
    expect(crypto.hash).toHaveBeenCalledOnce();
    expect(crypto.hash).toHaveBeenCalledWith('sha256', expect.any(Uint8Array));
  });

  it('produces deterministic output for the same state', async () => {
    /** @type {Uint8Array[]} */
    const captured = [];
    const crypto = {
      hash: vi.fn(async (/** @type {string} */ _algo, /** @type {Uint8Array} */ data) => {
        captured.push(data);
        return 'abc';
      }),
    };
    const svc = new StateHashService({ codec: new CborCodec(), crypto });

    await svc.compute(createEmptyStateV5());
    await svc.compute(createEmptyStateV5());

    // Same state → same bytes → same hash
    expect(captured).toHaveLength(2);
    expect(Array.from(captured[0])).toEqual(Array.from(captured[1]));
  });
});

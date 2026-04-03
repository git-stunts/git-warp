/**
 * Tests for _readPatchBlob null-guard on readBlob return value.
 *
 * @see src/domain/services/controllers/PatchController.js
 */

import { describe, it, expect, vi } from 'vitest';
import PatchController from '../../../../src/domain/services/controllers/PatchController.js';
import PersistenceError from '../../../../src/domain/errors/PersistenceError.js';

/**
 * Builds a PatchController with a minimal mock host.
 *
 * @param {{ readBlob: import('vitest').Mock }} persistence
 * @param {{ retrieve: import('vitest').Mock }|null} [patchBlobStorage]
 * @returns {PatchController}
 */
function createController(persistence, patchBlobStorage = null) {
  const host = /** @type {*} */ ({ _persistence: persistence, _patchBlobStorage: patchBlobStorage });
  return new PatchController(host);
}

describe('_readPatchBlob', () => {
  it('returns blob when readBlob succeeds', async () => {
    const expected = new Uint8Array([1, 2, 3]);
    const ctrl = createController({ readBlob: vi.fn().mockResolvedValue(expected) });
    const result = await ctrl._readPatchBlob({
      patchOid: 'a'.repeat(40),
      encrypted: false,
    });
    expect(result).toBe(expected);
  });

  it('throws PersistenceError with E_MISSING_OBJECT when readBlob returns null', async () => {
    const ctrl = createController({ readBlob: vi.fn().mockResolvedValue(null) });
    await expect(ctrl._readPatchBlob({
      patchOid: 'b'.repeat(40),
      encrypted: false,
    })).rejects.toThrow(PersistenceError);

    try {
      await ctrl._readPatchBlob({ patchOid: 'b'.repeat(40), encrypted: false });
    } catch (err) {
      expect(/** @type {PersistenceError} */ (err).code).toBe(PersistenceError.E_MISSING_OBJECT);
    }
  });

  it('throws PersistenceError with E_MISSING_OBJECT when readBlob returns undefined', async () => {
    const ctrl = createController({ readBlob: vi.fn().mockResolvedValue(undefined) });
    await expect(ctrl._readPatchBlob({
      patchOid: 'c'.repeat(40),
      encrypted: false,
    })).rejects.toThrow(PersistenceError);
  });

  it('delegates to patchBlobStorage.retrieve when encrypted', async () => {
    const expected = new Uint8Array([4, 5, 6]);
    const patchBlobStorage = { retrieve: vi.fn().mockResolvedValue(expected) };
    const ctrl = createController(
      { readBlob: vi.fn().mockResolvedValue(null) },
      patchBlobStorage,
    );
    const result = await ctrl._readPatchBlob({
      patchOid: 'd'.repeat(40),
      encrypted: true,
    });
    expect(result).toBe(expected);
    expect(patchBlobStorage.retrieve).toHaveBeenCalledWith('d'.repeat(40));
  });

  it('throws EncryptionError when encrypted but no patchBlobStorage', async () => {
    const ctrl = createController({ readBlob: vi.fn() }, null);
    await expect(ctrl._readPatchBlob({
      patchOid: 'e'.repeat(40),
      encrypted: true,
    })).rejects.toThrow(/encrypted.*patchBlobStorage/i);
  });
});

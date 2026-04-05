import { describe, it, expect, vi } from 'vitest';
import {
  MissingCapabilityError,
  requireBlobPort,
  requireCommitPort,
  requireTreePort,
} from '../../../src/infrastructure/adapters/requireCapabilities.js';

describe('requireCapabilities', () => {
  describe('MissingCapabilityError', () => {
    it('has name MissingCapabilityError', () => {
      const err = new MissingCapabilityError('readBlob');
      expect(err.name).toBe('MissingCapabilityError');
    });

    it('includes the method name in the message', () => {
      const err = new MissingCapabilityError('writeBlob');
      expect(err.message).toBe(
        'Persistence is missing required method: writeBlob()',
      );
    });

    it('exposes the method property', () => {
      const err = new MissingCapabilityError('getNodeInfo');
      expect(err.method).toBe('getNodeInfo');
    });

    it('is an instance of Error', () => {
      const err = new MissingCapabilityError('readBlob');
      expect(err).toBeInstanceOf(Error);
    });
  });

  describe('requireBlobPort', () => {
    /** @returns {{ readBlob: import('vitest').Mock, writeBlob: import('vitest').Mock }} */
    function makeBlobPersistence() {
      return /** @type {*} */ ({
        readBlob: vi.fn(),
        writeBlob: vi.fn(),
        extraMethod: vi.fn(),
      });
    }

    it('returns a frozen object with readBlob and writeBlob', () => {
      const result = requireBlobPort(makeBlobPersistence());
      expect(Object.isFrozen(result)).toBe(true);
      expect(typeof result.readBlob).toBe('function');
      expect(typeof result.writeBlob).toBe('function');
    });

    it('returned object has ONLY readBlob and writeBlob', () => {
      const result = requireBlobPort(makeBlobPersistence());
      expect(Object.keys(result).sort()).toEqual(['readBlob', 'writeBlob']);
    });

    it('methods are bound to the original object', () => {
      const persistence = makeBlobPersistence();
      persistence.readBlob.mockResolvedValue(new Uint8Array([1, 2, 3]));
      persistence.writeBlob.mockResolvedValue('abc123');

      const { readBlob, writeBlob } = requireBlobPort(persistence);

      readBlob('sha');
      expect(persistence.readBlob).toHaveBeenCalledWith('sha');

      writeBlob(new Uint8Array([4, 5]));
      expect(persistence.writeBlob).toHaveBeenCalledWith(
        new Uint8Array([4, 5]),
      );
    });

    it('throws MissingCapabilityError when readBlob is missing', () => {
      expect(() => requireBlobPort({ writeBlob: vi.fn() })).toThrow(
        MissingCapabilityError,
      );
      try {
        requireBlobPort({ writeBlob: vi.fn() });
      } catch (err) {
        expect(/** @type {MissingCapabilityError} */ (err).method).toBe(
          'readBlob',
        );
      }
    });

    it('throws MissingCapabilityError when writeBlob is missing', () => {
      expect(() => requireBlobPort({ readBlob: vi.fn() })).toThrow(
        MissingCapabilityError,
      );
      try {
        requireBlobPort({ readBlob: vi.fn() });
      } catch (err) {
        expect(/** @type {MissingCapabilityError} */ (err).method).toBe(
          'writeBlob',
        );
      }
    });

    it('throws when persistence is null', () => {
      expect(() => requireBlobPort(null)).toThrow(MissingCapabilityError);
    });

    it('throws when persistence is undefined', () => {
      expect(() => requireBlobPort(undefined)).toThrow(MissingCapabilityError);
    });
  });

  describe('requireCommitPort', () => {
    function makeCommitPersistence() {
      return /** @type {*} */ ({
        getNodeInfo: vi.fn(),
        extraMethod: vi.fn(),
      });
    }

    it('returns a frozen object with getNodeInfo', () => {
      const result = requireCommitPort(makeCommitPersistence());
      expect(Object.isFrozen(result)).toBe(true);
      expect(typeof result.getNodeInfo).toBe('function');
    });

    it('returned object has ONLY getNodeInfo', () => {
      const result = requireCommitPort(makeCommitPersistence());
      expect(Object.keys(result)).toEqual(['getNodeInfo']);
    });

    it('method is bound to the original object', () => {
      const persistence = makeCommitPersistence();
      persistence.getNodeInfo.mockResolvedValue({ sha: 'abc' });

      const { getNodeInfo } = requireCommitPort(persistence);

      getNodeInfo('abc');
      expect(persistence.getNodeInfo).toHaveBeenCalledWith('abc');
    });

    it('throws MissingCapabilityError when getNodeInfo is missing', () => {
      expect(() => requireCommitPort({ readBlob: vi.fn() })).toThrow(
        MissingCapabilityError,
      );
      try {
        requireCommitPort({ readBlob: vi.fn() });
      } catch (err) {
        expect(/** @type {MissingCapabilityError} */ (err).method).toBe(
          'getNodeInfo',
        );
      }
    });
  });

  describe('requireTreePort', () => {
    /** @returns {{ readTreeOids: import('vitest').Mock, writeTree: import('vitest').Mock }} */
    function makeTreePersistence() {
      return /** @type {*} */ ({
        readTreeOids: vi.fn(),
        writeTree: vi.fn(),
        extraMethod: vi.fn(),
      });
    }

    it('returns a frozen object with readTreeOids and writeTree', () => {
      const result = requireTreePort(makeTreePersistence());
      expect(Object.isFrozen(result)).toBe(true);
      expect(typeof result.readTreeOids).toBe('function');
      expect(typeof result.writeTree).toBe('function');
    });

    it('returned object has ONLY readTreeOids and writeTree', () => {
      const result = requireTreePort(makeTreePersistence());
      expect(Object.keys(result).sort()).toEqual(['readTreeOids', 'writeTree']);
    });

    it('methods are bound to the original object', () => {
      const persistence = makeTreePersistence();
      persistence.readTreeOids.mockResolvedValue({ 'file.txt': 'abc' });
      persistence.writeTree.mockResolvedValue('def456');

      const { readTreeOids, writeTree } = requireTreePort(persistence);

      readTreeOids('treeSha');
      expect(persistence.readTreeOids).toHaveBeenCalledWith('treeSha');

      writeTree(['entry1']);
      expect(persistence.writeTree).toHaveBeenCalledWith(['entry1']);
    });

    it('throws MissingCapabilityError when readTreeOids is missing', () => {
      expect(() => requireTreePort({ writeTree: vi.fn() })).toThrow(
        MissingCapabilityError,
      );
      try {
        requireTreePort({ writeTree: vi.fn() });
      } catch (err) {
        expect(/** @type {MissingCapabilityError} */ (err).method).toBe(
          'readTreeOids',
        );
      }
    });

    it('throws MissingCapabilityError when writeTree is missing', () => {
      expect(() => requireTreePort({ readTreeOids: vi.fn() })).toThrow(
        MissingCapabilityError,
      );
      try {
        requireTreePort({ readTreeOids: vi.fn() });
      } catch (err) {
        expect(/** @type {MissingCapabilityError} */ (err).method).toBe(
          'writeTree',
        );
      }
    });
  });
});

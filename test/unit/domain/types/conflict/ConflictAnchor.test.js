import { describe, it, expect } from 'vitest';
import ConflictAnchor from '../../../../../src/domain/types/conflict/ConflictAnchor.ts';

describe('ConflictAnchor', () => {
  const VALID = {
    patchSha: 'abcd1234',
    writerId: 'writer-1',
    lamport: 5,
    opIndex: 2,
  };

  const VALID_WITH_RECEIPT = {
    ...VALID,
    receiptPatchSha: 'abcd1234',
    receiptLamport: 5,
    receiptOpIndex: 3,
  };

  describe('constructor validation', () => {
    it('creates a frozen instance with required fields', () => {
      const anchor = new ConflictAnchor(VALID);
      expect(anchor.patchSha).toBe('abcd1234');
      expect(anchor.writerId).toBe('writer-1');
      expect(anchor.lamport).toBe(5);
      expect(anchor.opIndex).toBe(2);
      expect(anchor.receiptPatchSha).toBeUndefined();
      expect(anchor.receiptLamport).toBeUndefined();
      expect(anchor.receiptOpIndex).toBeUndefined();
      expect(Object.isFrozen(anchor)).toBe(true);
    });

    it('creates an instance with optional receipt fields', () => {
      const anchor = new ConflictAnchor(VALID_WITH_RECEIPT);
      expect(anchor.receiptPatchSha).toBe('abcd1234');
      expect(anchor.receiptLamport).toBe(5);
      expect(anchor.receiptOpIndex).toBe(3);
    });

    it('treats null receipt fields as undefined', () => {
      const anchor = new ConflictAnchor({
        ...VALID,
        receiptPatchSha: /** @type {any} */ (null),
        receiptLamport: /** @type {any} */ (null),
        receiptOpIndex: /** @type {any} */ (null),
      });
      expect(anchor.receiptPatchSha).toBeUndefined();
      expect(anchor.receiptLamport).toBeUndefined();
      expect(anchor.receiptOpIndex).toBeUndefined();
    });

    it('accepts lamport 0 and opIndex 0', () => {
      const anchor = new ConflictAnchor({ ...VALID, lamport: 0, opIndex: 0 });
      expect(anchor.lamport).toBe(0);
      expect(anchor.opIndex).toBe(0);
    });

    it('rejects empty patchSha', () => {
      expect(() => new ConflictAnchor({ ...VALID, patchSha: '' }))
        .toThrow('patchSha must be a non-empty string');
    });

    it('rejects non-string patchSha', () => {
      expect(() => new ConflictAnchor(/** @type {any} */ ({ ...VALID, patchSha: 42 })))
        .toThrow('patchSha must be a non-empty string');
    });

    it('rejects empty writerId', () => {
      expect(() => new ConflictAnchor({ ...VALID, writerId: '' }))
        .toThrow('writerId must be a non-empty string');
    });

    it('rejects negative lamport', () => {
      expect(() => new ConflictAnchor({ ...VALID, lamport: -1 }))
        .toThrow('lamport must be a non-negative integer');
    });

    it('rejects non-integer lamport', () => {
      expect(() => new ConflictAnchor({ ...VALID, lamport: 1.5 }))
        .toThrow('lamport must be a non-negative integer');
    });

    it('rejects negative opIndex', () => {
      expect(() => new ConflictAnchor({ ...VALID, opIndex: -1 }))
        .toThrow('opIndex must be a non-negative integer');
    });

    it('rejects invalid receiptPatchSha', () => {
      expect(() => new ConflictAnchor({ ...VALID, receiptPatchSha: 'XYZ' }))
        .toThrow('receiptPatchSha must be a hex SHA string');
    });

    it('rejects non-integer receiptLamport', () => {
      expect(() => new ConflictAnchor(/** @type {any} */ ({ ...VALID, receiptLamport: 'five' })))
        .toThrow('receiptLamport must be a non-negative integer');
    });

    it('rejects negative receiptOpIndex', () => {
      expect(() => new ConflictAnchor({ ...VALID, receiptOpIndex: -1 }))
        .toThrow('receiptOpIndex must be a non-negative integer');
    });
  });

  describe('toString', () => {
    it('returns deterministic padded string', () => {
      const anchor = new ConflictAnchor(VALID);
      expect(anchor.toString()).toBe('writer-1:0000000000000005:abcd1234:00000002');
    });

    it('pads lamport to 16 digits and opIndex to 8 digits', () => {
      const anchor = new ConflictAnchor({ ...VALID, lamport: 0, opIndex: 0 });
      expect(anchor.toString()).toBe('writer-1:0000000000000000:abcd1234:00000000');
    });

    it('handles large lamport values', () => {
      const anchor = new ConflictAnchor({ ...VALID, lamport: 999999999 });
      expect(anchor.toString()).toBe('writer-1:0000000999999999:abcd1234:00000002');
    });
  });

  describe('compare', () => {
    it('returns 0 for identical anchors', () => {
      const a = new ConflictAnchor(VALID);
      const b = new ConflictAnchor(VALID);
      expect(ConflictAnchor.compare(a, b)).toBe(0);
    });

    it('orders by writerId first', () => {
      const a = new ConflictAnchor({ ...VALID, writerId: 'aaa' });
      const b = new ConflictAnchor({ ...VALID, writerId: 'zzz' });
      expect(ConflictAnchor.compare(a, b)).toBeLessThan(0);
      expect(ConflictAnchor.compare(b, a)).toBeGreaterThan(0);
    });

    it('orders by lamport when writerId is equal', () => {
      const a = new ConflictAnchor({ ...VALID, lamport: 1 });
      const b = new ConflictAnchor({ ...VALID, lamport: 2 });
      expect(ConflictAnchor.compare(a, b)).toBeLessThan(0);
    });

    it('orders by patchSha when writerId and lamport are equal', () => {
      const a = new ConflictAnchor({ ...VALID, patchSha: 'aaaa' });
      const b = new ConflictAnchor({ ...VALID, patchSha: 'zzzz' });
      expect(ConflictAnchor.compare(a, b)).toBeLessThan(0);
    });

    it('orders by opIndex as final tiebreaker', () => {
      const a = new ConflictAnchor({ ...VALID, opIndex: 0 });
      const b = new ConflictAnchor({ ...VALID, opIndex: 1 });
      expect(ConflictAnchor.compare(a, b)).toBeLessThan(0);
    });
  });

  describe('fromRecord', () => {
    it('creates an anchor from an operation record', () => {
      const record = {
        patchSha: 'abcd1234',
        writerId: 'writer-1',
        lamport: 5,
        opIndex: 2,
        receiptOpIndex: 3,
      };
      const anchor = ConflictAnchor.fromRecord(record);
      expect(anchor.patchSha).toBe('abcd1234');
      expect(anchor.writerId).toBe('writer-1');
      expect(anchor.lamport).toBe(5);
      expect(anchor.opIndex).toBe(2);
      expect(anchor.receiptPatchSha).toBe('abcd1234');
      expect(anchor.receiptLamport).toBe(5);
      expect(anchor.receiptOpIndex).toBe(3);
      expect(Object.isFrozen(anchor)).toBe(true);
    });
  });

  describe('fromFrame', () => {
    it('creates an anchor from a patch frame at opIndex 0', () => {
      const frame = {
        sha: 'deadbeef',
        patch: { writer: 'w-1', lamport: 10 },
      };
      const anchor = ConflictAnchor.fromFrame(frame);
      expect(anchor.patchSha).toBe('deadbeef');
      expect(anchor.writerId).toBe('w-1');
      expect(anchor.lamport).toBe(10);
      expect(anchor.opIndex).toBe(0);
      expect(anchor.receiptPatchSha).toBeUndefined();
      expect(Object.isFrozen(anchor)).toBe(true);
    });
  });

  describe('JSON serialization', () => {
    it('round-trips through JSON.stringify/parse preserving structure', () => {
      const anchor = new ConflictAnchor(VALID_WITH_RECEIPT);
      const json = JSON.parse(JSON.stringify(anchor));
      expect(json.patchSha).toBe('abcd1234');
      expect(json.writerId).toBe('writer-1');
      expect(json.lamport).toBe(5);
      expect(json.opIndex).toBe(2);
      expect(json.receiptPatchSha).toBe('abcd1234');
      expect(json.receiptLamport).toBe(5);
      expect(json.receiptOpIndex).toBe(3);
    });

    it('omits undefined receipt fields from JSON', () => {
      const anchor = new ConflictAnchor(VALID);
      const json = JSON.parse(JSON.stringify(anchor));
      expect('receiptPatchSha' in json).toBe(false);
      expect('receiptLamport' in json).toBe(false);
      expect('receiptOpIndex' in json).toBe(false);
    });
  });
});

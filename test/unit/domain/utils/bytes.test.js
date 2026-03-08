import { describe, it, expect } from 'vitest';
import {
  hexEncode,
  hexDecode,
  base64Encode,
  base64Decode,
  concatBytes,
  textEncode,
  textDecode,
} from '../../../../src/domain/utils/bytes.js';

describe('bytes utilities', () => {
  describe('hexEncode', () => {
    it('encodes empty array', () => {
      expect(hexEncode(new Uint8Array(0))).toBe('');
    });

    it('encodes single byte', () => {
      expect(hexEncode(new Uint8Array([0xff]))).toBe('ff');
    });

    it('encodes multiple bytes with leading zeros', () => {
      expect(hexEncode(new Uint8Array([0x00, 0x0a, 0xff]))).toBe('000aff');
    });

    it('produces lowercase hex', () => {
      expect(hexEncode(new Uint8Array([0xAB, 0xCD]))).toBe('abcd');
    });

    it('round-trips through hexDecode', () => {
      const original = new Uint8Array([1, 2, 3, 127, 128, 255]);
      expect(hexDecode(hexEncode(original))).toEqual(original);
    });
  });

  describe('hexDecode', () => {
    it('decodes empty string', () => {
      expect(hexDecode('')).toEqual(new Uint8Array(0));
    });

    it('decodes hex pairs', () => {
      expect(hexDecode('ff00ab')).toEqual(new Uint8Array([0xff, 0x00, 0xab]));
    });

    it('handles uppercase input', () => {
      expect(hexDecode('FF')).toEqual(new Uint8Array([0xff]));
    });

    it('throws RangeError for odd-length input', () => {
      expect(() => hexDecode('abc')).toThrow(RangeError);
    });

    it('throws RangeError for non-hex characters', () => {
      expect(() => hexDecode('zzzz')).toThrow(RangeError);
    });

    it('throws RangeError for mixed valid/invalid characters', () => {
      expect(() => hexDecode('abgh')).toThrow(RangeError);
    });
  });

  describe('base64Encode', () => {
    it('encodes empty array', () => {
      expect(base64Encode(new Uint8Array(0))).toBe('');
    });

    it('encodes "Hello"', () => {
      const bytes = new TextEncoder().encode('Hello');
      expect(base64Encode(bytes)).toBe('SGVsbG8=');
    });

    it('round-trips through base64Decode', () => {
      const original = new Uint8Array([0, 1, 2, 253, 254, 255]);
      expect(base64Decode(base64Encode(original))).toEqual(original);
    });
  });

  describe('base64Decode', () => {
    it('decodes empty string', () => {
      expect(base64Decode('')).toEqual(new Uint8Array(0));
    });

    it('decodes "SGVsbG8="', () => {
      const result = base64Decode('SGVsbG8=');
      expect(new TextDecoder().decode(result)).toBe('Hello');
    });

    it('rejects base64 with length % 4 === 1', () => {
      expect(() => base64Decode('AAAAA')).toThrow(RangeError);
      expect(() => base64Decode('A')).toThrow(RangeError);
    });

    it('decodes valid unpadded base64', () => {
      // "AA" is 2 chars (length % 4 === 2) — valid, decodes to 1 byte
      expect(base64Decode('AA')).toEqual(new Uint8Array([0]));
      // "AAA" is 3 chars (length % 4 === 3) — valid, decodes to 2 bytes
      expect(base64Decode('AAA')).toEqual(new Uint8Array([0, 0]));
    });
  });

  describe('concatBytes', () => {
    it('returns empty for no arguments', () => {
      expect(concatBytes()).toEqual(new Uint8Array(0));
    });

    it('returns copy for single argument', () => {
      const a = new Uint8Array([1, 2]);
      const result = concatBytes(a);
      expect(result).toEqual(a);
      // Should be a copy, not the same reference
      expect(result).not.toBe(a);
    });

    it('concatenates two arrays', () => {
      const a = new Uint8Array([1, 2]);
      const b = new Uint8Array([3, 4]);
      expect(concatBytes(a, b)).toEqual(new Uint8Array([1, 2, 3, 4]));
    });

    it('concatenates three arrays including empty', () => {
      const a = new Uint8Array([1]);
      const b = new Uint8Array(0);
      const c = new Uint8Array([2, 3]);
      expect(concatBytes(a, b, c)).toEqual(new Uint8Array([1, 2, 3]));
    });
  });

  describe('textEncode', () => {
    it('encodes empty string', () => {
      expect(textEncode('')).toEqual(new Uint8Array(0));
    });

    it('encodes ASCII', () => {
      expect(textEncode('abc')).toEqual(new Uint8Array([0x61, 0x62, 0x63]));
    });

    it('encodes multi-byte UTF-8', () => {
      const bytes = textEncode('€');
      expect(bytes.length).toBe(3);
      expect(bytes).toEqual(new Uint8Array([0xe2, 0x82, 0xac]));
    });
  });

  describe('textDecode', () => {
    it('decodes empty array', () => {
      expect(textDecode(new Uint8Array(0))).toBe('');
    });

    it('decodes ASCII', () => {
      expect(textDecode(new Uint8Array([0x61, 0x62, 0x63]))).toBe('abc');
    });

    it('round-trips with textEncode', () => {
      const original = 'Hello, 世界! 🌍';
      expect(textDecode(textEncode(original))).toBe(original);
    });
  });
});

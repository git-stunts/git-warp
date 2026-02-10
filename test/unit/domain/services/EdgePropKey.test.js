import { describe, it, expect } from 'vitest';
import {
  encodeEdgePropKey,
  decodeEdgePropKey,
  isEdgePropKey,
  EDGE_PROP_PREFIX,
  encodePropKey,
} from '../../../../src/domain/services/JoinReducer.js';

describe('EdgePropKey', () => {
  describe('round-trip', () => {
    it('encode then decode returns original values', () => {
      const from = 'user:alice';
      const to = 'user:bob';
      const label = 'manages';
      const propKey = 'since';

      const encoded = encodeEdgePropKey(from, to, label, propKey);
      const decoded = decodeEdgePropKey(encoded);

      expect(decoded).toEqual({ from, to, label, propKey });
    });

    it('round-trips with single-character fields', () => {
      const encoded = encodeEdgePropKey('a', 'b', 'c', 'd');
      const decoded = decodeEdgePropKey(encoded);

      expect(decoded).toEqual({ from: 'a', to: 'b', label: 'c', propKey: 'd' });
    });

    it('round-trips with complex realistic keys', () => {
      const from = 'org:acme-corp/dept:engineering';
      const to = 'project:warp-graph-v7';
      const label = 'owns';
      const propKey = 'budget.allocated.2025';

      const encoded = encodeEdgePropKey(from, to, label, propKey);
      const decoded = decodeEdgePropKey(encoded);

      expect(decoded).toEqual({ from, to, label, propKey });
    });
  });

  describe('injectivity', () => {
    it('different from values produce different keys', () => {
      const a = encodeEdgePropKey('x', 'y', 'z', 'p');
      const b = encodeEdgePropKey('xx', 'y', 'z', 'p');

      expect(a).not.toBe(b);
    });

    it('different to values produce different keys', () => {
      const a = encodeEdgePropKey('x', 'y', 'z', 'p');
      const b = encodeEdgePropKey('x', 'yy', 'z', 'p');

      expect(a).not.toBe(b);
    });

    it('different label values produce different keys', () => {
      const a = encodeEdgePropKey('x', 'y', 'z', 'p');
      const b = encodeEdgePropKey('x', 'y', 'zz', 'p');

      expect(a).not.toBe(b);
    });

    it('different propKey values produce different keys', () => {
      const a = encodeEdgePropKey('x', 'y', 'z', 'p');
      const b = encodeEdgePropKey('x', 'y', 'z', 'pp');

      expect(a).not.toBe(b);
    });

    it('swapping from and to produces a different key', () => {
      const a = encodeEdgePropKey('alice', 'bob', 'likes', 'weight');
      const b = encodeEdgePropKey('bob', 'alice', 'likes', 'weight');

      expect(a).not.toBe(b);
    });

    it('all four fields identical but in different positions produce different keys', () => {
      const a = encodeEdgePropKey('a', 'b', 'c', 'd');
      const b = encodeEdgePropKey('b', 'a', 'c', 'd');
      const c = encodeEdgePropKey('a', 'c', 'b', 'd');
      const d = encodeEdgePropKey('a', 'b', 'd', 'c');

      const keys = new Set([a, b, c, d]);
      expect(keys.size).toBe(4);
    });
  });

  describe('collision freedom with node prop keys', () => {
    it('edge prop key never equals a node prop key for same strings', () => {
      const edgeKey = encodeEdgePropKey('node1', 'node2', 'rel', 'weight');
      const nodeKey = encodePropKey('node1', 'weight');

      expect(edgeKey).not.toBe(nodeKey);
    });

    it('edge prop key never equals node prop key even with crafted inputs', () => {
      // Try to craft a node prop key that looks like an edge prop key
      const nodeKey = encodePropKey('\x01from', 'to');
      const edgeKey = encodeEdgePropKey('from', 'to', '', '');

      expect(edgeKey).not.toBe(nodeKey);
    });

    it('no collision across a variety of inputs', () => {
      const nodeIds = ['a', 'b', 'user:1', 'node-x'];
      const propKeys = ['name', 'value', 'x', 'weight'];
      const labels = ['owns', 'likes', 'edge'];

      const edgeKeys = new Set();
      const nodeKeys = new Set();

      for (const from of nodeIds) {
        for (const to of nodeIds) {
          for (const label of labels) {
            for (const pk of propKeys) {
              edgeKeys.add(encodeEdgePropKey(from, to, label, pk));
            }
          }
        }
        for (const pk of propKeys) {
          nodeKeys.add(encodePropKey(from, pk));
        }
      }

      for (const ek of edgeKeys) {
        expect(nodeKeys.has(ek)).toBe(false);
      }
    });

    it('prefix byte prevents collision with any node prop key', () => {
      // Node prop keys start with the node ID (never \x01 in practice).
      // Edge prop keys always start with \x01.
      const edgeKey = encodeEdgePropKey('n', 'n', 'e', 'p');
      const nodeKey = encodePropKey('n', 'p');

      expect(edgeKey[0]).toBe('\x01');
      expect(nodeKey[0]).not.toBe('\x01');
    });
  });

  describe('isEdgePropKey', () => {
    it('returns true for edge prop keys', () => {
      const key = encodeEdgePropKey('a', 'b', 'c', 'd');

      expect(isEdgePropKey(key)).toBe(true);
    });

    it('returns false for node prop keys', () => {
      const key = encodePropKey('node1', 'name');

      expect(isEdgePropKey(key)).toBe(false);
    });

    it('returns false for plain strings', () => {
      expect(isEdgePropKey('hello')).toBe(false);
      expect(isEdgePropKey('node:abc')).toBe(false);
      expect(isEdgePropKey('')).toBe(false);
    });

    it('returns true for any string starting with \\x01', () => {
      expect(isEdgePropKey('\x01anything')).toBe(true);
      expect(isEdgePropKey('\x01')).toBe(true);
    });

    it('returns false for strings starting with other control characters', () => {
      expect(isEdgePropKey('\x00test')).toBe(false);
      expect(isEdgePropKey('\x02test')).toBe(false);
      expect(isEdgePropKey('\x7ftest')).toBe(false);
    });
  });

  describe('EDGE_PROP_PREFIX', () => {
    it('equals \\x01', () => {
      expect(EDGE_PROP_PREFIX).toBe('\x01');
    });

    it('has char code 1', () => {
      expect(EDGE_PROP_PREFIX.charCodeAt(0)).toBe(1);
    });

    it('has length 1', () => {
      expect(EDGE_PROP_PREFIX.length).toBe(1);
    });

    it('is the first character of every encoded edge prop key', () => {
      const key = encodeEdgePropKey('x', 'y', 'z', 'w');

      expect(key.startsWith(EDGE_PROP_PREFIX)).toBe(true);
    });
  });

  describe('fuzz: 10,000 random tuples round-trip', () => {
    /** @param {number} maxLen */
    function randomString(maxLen) {
      const len = Math.floor(Math.random() * maxLen) + 1;
      const chars = [];
      for (let i = 0; i < len; i++) {
        // Printable ASCII range 0x20-0x7e, avoiding \0 and \x01
        // which are used as delimiters/prefix
        chars.push(String.fromCharCode(0x20 + Math.floor(Math.random() * 95)));
      }
      return chars.join('');
    }

    it('all 10,000 random tuples round-trip correctly', () => {
      for (let i = 0; i < 10_000; i++) {
        const from = randomString(20);
        const to = randomString(20);
        const label = randomString(15);
        const propKey = randomString(15);

        const encoded = encodeEdgePropKey(from, to, label, propKey);
        const decoded = decodeEdgePropKey(encoded);

        expect(decoded).toEqual({ from, to, label, propKey });
        expect(isEdgePropKey(encoded)).toBe(true);
      }
    });

    it('no fuzzed edge key collides with a node prop key', () => {
      const nodeKeys = new Set();
      const edgeKeys = new Set();

      for (let i = 0; i < 1000; i++) {
        const a = randomString(20);
        const b = randomString(20);

        nodeKeys.add(encodePropKey(a, b));
        edgeKeys.add(encodeEdgePropKey(a, b, randomString(10), randomString(10)));
      }

      for (const ek of edgeKeys) {
        expect(nodeKeys.has(ek)).toBe(false);
      }
    });
  });

  describe('edge cases', () => {
    it('handles empty strings in all positions', () => {
      const encoded = encodeEdgePropKey('', '', '', '');
      const decoded = decodeEdgePropKey(encoded);

      expect(decoded).toEqual({ from: '', to: '', label: '', propKey: '' });
      expect(isEdgePropKey(encoded)).toBe(true);
    });

    it('handles empty string in from only', () => {
      const encoded = encodeEdgePropKey('', 'to', 'label', 'prop');
      const decoded = decodeEdgePropKey(encoded);

      expect(decoded).toEqual({ from: '', to: 'to', label: 'label', propKey: 'prop' });
    });

    it('handles empty string in to only', () => {
      const encoded = encodeEdgePropKey('from', '', 'label', 'prop');
      const decoded = decodeEdgePropKey(encoded);

      expect(decoded).toEqual({ from: 'from', to: '', label: 'label', propKey: 'prop' });
    });

    it('handles empty string in label only', () => {
      const encoded = encodeEdgePropKey('from', 'to', '', 'prop');
      const decoded = decodeEdgePropKey(encoded);

      expect(decoded).toEqual({ from: 'from', to: 'to', label: '', propKey: 'prop' });
    });

    it('handles empty string in propKey only', () => {
      const encoded = encodeEdgePropKey('from', 'to', 'label', '');
      const decoded = decodeEdgePropKey(encoded);

      expect(decoded).toEqual({ from: 'from', to: 'to', label: 'label', propKey: '' });
    });

    it('handles strings containing \\x01 characters', () => {
      const from = 'a\x01b';
      const to = '\x01c';
      const label = 'd\x01';
      const propKey = '\x01\x01';

      const encoded = encodeEdgePropKey(from, to, label, propKey);

      // The key should still be identifiable as an edge prop key
      expect(isEdgePropKey(encoded)).toBe(true);
      // Note: embedded \x01 characters do not affect decoding because
      // split is done on \0, not \x01
      const decoded = decodeEdgePropKey(encoded);
      expect(decoded).toEqual({ from, to, label, propKey });
    });

    it('handles unicode characters', () => {
      const from = 'user:\u00e9mile';
      const to = 'user:\u4e16\u754c';
      const label = '\u2764\ufe0f';
      const propKey = '\u00fc\u00f6\u00e4';

      const encoded = encodeEdgePropKey(from, to, label, propKey);
      const decoded = decodeEdgePropKey(encoded);

      expect(decoded).toEqual({ from, to, label, propKey });
    });

    it('handles emoji and surrogate pairs', () => {
      const from = 'user:\ud83d\ude80';
      const to = 'org:\ud83c\udf1f';
      const label = '\ud83d\udd17';
      const propKey = 'score\ud83c\udfaf';

      const encoded = encodeEdgePropKey(from, to, label, propKey);
      const decoded = decodeEdgePropKey(encoded);

      expect(decoded).toEqual({ from, to, label, propKey });
    });

    it('handles very long strings', () => {
      const long = 'x'.repeat(10_000);
      const encoded = encodeEdgePropKey(long, long, long, long);
      const decoded = decodeEdgePropKey(encoded);

      expect(decoded.from).toBe(long);
      expect(decoded.to).toBe(long);
      expect(decoded.label).toBe(long);
      expect(decoded.propKey).toBe(long);
    });

    it('throws when field contains embedded null character (extra segments)', () => {
      // A from value that itself contains the separator pattern
      const from = 'a\0b';
      const to = 'c';
      const label = 'd';
      const propKey = 'e';

      const encoded = encodeEdgePropKey(from, to, label, propKey);
      // With embedded \0 in "from", split produces 5 segments instead of 4.
      // The codec enforces exactly 4 segments and throws on malformed keys.
      expect(() => decodeEdgePropKey(encoded)).toThrow(
        'Invalid edge property key: expected 4 segments',
      );
    });

    it('encoded key always starts with EDGE_PROP_PREFIX', () => {
      const cases = [
        ['', '', '', ''],
        ['a', 'b', 'c', 'd'],
        ['\x01', '\x01', '\x01', '\x01'],
        ['very-long-node-id', 'another-long-node-id', 'relationship-type', 'property-name'],
      ];

      for (const [from, to, label, propKey] of cases) {
        const encoded = encodeEdgePropKey(from, to, label, propKey);
        expect(encoded[0]).toBe(EDGE_PROP_PREFIX);
      }
    });
  });
});

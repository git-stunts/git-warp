import { describe, it, expect } from 'vitest';
import {
  FIELD_SEPARATOR,
  EDGE_PROP_PREFIX,
  encodeEdgeKey,
  decodeEdgeKey,
  encodePropKey,
  decodePropKey,
  encodeEdgePropKey,
  decodeEdgePropKey,
  isEdgePropKey,
} from '../../../../src/domain/services/KeyCodec.js';

describe('KeyCodec', () => {
  describe('constants', () => {
    it('FIELD_SEPARATOR is null char', () => {
      expect(FIELD_SEPARATOR).toBe('\0');
    });

    it('EDGE_PROP_PREFIX is \\x01', () => {
      expect(EDGE_PROP_PREFIX).toBe('\x01');
    });
  });

  describe('encodeEdgeKey / decodeEdgeKey', () => {
    it('round-trips edge key', () => {
      const encoded = encodeEdgeKey('user:alice', 'user:bob', 'follows');
      const decoded = decodeEdgeKey(encoded);
      expect(decoded).toEqual({ from: 'user:alice', to: 'user:bob', label: 'follows' });
    });

    it('encodes to expected format', () => {
      const encoded = encodeEdgeKey('a', 'b', 'c');
      expect(encoded).toBe('a\0b\0c');
    });

    it('handles empty strings', () => {
      const encoded = encodeEdgeKey('', '', '');
      const decoded = decodeEdgeKey(encoded);
      expect(decoded).toEqual({ from: '', to: '', label: '' });
    });

    it('handles unicode', () => {
      const encoded = encodeEdgeKey('用户:alice', '用户:bob', '关注');
      const decoded = decodeEdgeKey(encoded);
      expect(decoded).toEqual({ from: '用户:alice', to: '用户:bob', label: '关注' });
    });
  });

  describe('encodePropKey / decodePropKey', () => {
    it('round-trips property key', () => {
      const encoded = encodePropKey('user:alice', 'name');
      const decoded = decodePropKey(encoded);
      expect(decoded).toEqual({ nodeId: 'user:alice', propKey: 'name' });
    });

    it('encodes to expected format', () => {
      const encoded = encodePropKey('node1', 'key1');
      expect(encoded).toBe('node1\0key1');
    });
  });

  describe('encodeEdgePropKey / decodeEdgePropKey', () => {
    it('round-trips edge property key', () => {
      const encoded = encodeEdgePropKey('a', 'b', 'label', 'weight');
      const decoded = decodeEdgePropKey(encoded);
      expect(decoded).toEqual({ from: 'a', to: 'b', label: 'label', propKey: 'weight' });
    });

    it('starts with EDGE_PROP_PREFIX', () => {
      const encoded = encodeEdgePropKey('a', 'b', 'c', 'd');
      expect(encoded[0]).toBe(EDGE_PROP_PREFIX);
    });

    it('throws on invalid prefix', () => {
      expect(() => decodeEdgePropKey('invalid')).toThrow('missing prefix');
    });

    it('throws on wrong segment count', () => {
      expect(() => decodeEdgePropKey('\x01a\0b')).toThrow('expected 4 segments');
    });
  });

  describe('isEdgePropKey', () => {
    it('returns true for edge property keys', () => {
      const key = encodeEdgePropKey('a', 'b', 'c', 'd');
      expect(isEdgePropKey(key)).toBe(true);
    });

    it('returns false for node property keys', () => {
      const key = encodePropKey('node1', 'key1');
      expect(isEdgePropKey(key)).toBe(false);
    });

    it('returns false for edge keys', () => {
      const key = encodeEdgeKey('a', 'b', 'c');
      expect(isEdgePropKey(key)).toBe(false);
    });
  });

  describe('no collision between node and edge property keys', () => {
    it('node property key and edge property key are distinct', () => {
      const nodeProp = encodePropKey('node1', 'key');
      const edgeProp = encodeEdgePropKey('node1', 'node2', 'label', 'key');
      expect(nodeProp).not.toBe(edgeProp);
      expect(isEdgePropKey(nodeProp)).toBe(false);
      expect(isEdgePropKey(edgeProp)).toBe(true);
    });
  });
});

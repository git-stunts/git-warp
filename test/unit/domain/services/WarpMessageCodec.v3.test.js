import { describe, it, expect } from 'vitest';
import {
  encodePatchMessage,
  encodeCheckpointMessage,
  encodeAnchorMessage,
  decodePatchMessage,
  decodeCheckpointMessage,
  decodeAnchorMessage,
  detectMessageKind,
  detectSchemaVersion,
  SCHEMA_V2,
  SCHEMA_V3,
} from '../../../../src/domain/services/WarpMessageCodec.js';

// Test fixtures
const VALID_OID_SHA1 = 'a'.repeat(40);
const VALID_STATE_HASH = 'c'.repeat(64);

// Edge property prefix used in JoinReducer
const EDGE_PROP_PREFIX = '\x01';

describe('WarpMessageCodec schema v3', () => {
  describe('constants', () => {
    it('SCHEMA_V2 is 2', () => {
      expect(SCHEMA_V2).toBe(2);
    });

    it('SCHEMA_V3 is 3', () => {
      expect(SCHEMA_V3).toBe(3);
    });
  });

  describe('detectSchemaVersion', () => {
    it('returns schema 2 for ops with only node PropSet', () => {
      const ops = [
        { type: 'NodeAdd', node: 'user:alice', dot: { writer: 'w1', seq: 1 } },
        { type: 'PropSet', node: 'user:alice', key: 'name', value: 'Alice' },
      ];
      expect(detectSchemaVersion(ops)).toBe(2);
    });

    it('returns schema 3 when any PropSet has edge prop prefix', () => {
      const edgePropNode = `${EDGE_PROP_PREFIX}user:alice\0user:bob\0manages\0weight`;
      const ops = [
        { type: 'NodeAdd', node: 'user:alice', dot: { writer: 'w1', seq: 1 } },
        { type: 'PropSet', node: edgePropNode, key: 'weight', value: 1.5 },
      ];
      expect(detectSchemaVersion(ops)).toBe(3);
    });

    it('returns schema 3 even if only one PropSet has edge prop prefix among many', () => {
      const edgePropNode = `${EDGE_PROP_PREFIX}a\0b\0rel\0key`;
      const ops = [
        { type: 'PropSet', node: 'user:alice', key: 'name', value: 'Alice' },
        { type: 'PropSet', node: 'user:bob', key: 'name', value: 'Bob' },
        { type: 'PropSet', node: edgePropNode, key: 'key', value: 42 },
        { type: 'PropSet', node: 'user:carol', key: 'name', value: 'Carol' },
      ];
      expect(detectSchemaVersion(ops)).toBe(3);
    });

    it('returns schema 2 for empty ops array', () => {
      expect(detectSchemaVersion([])).toBe(2);
    });

    it('returns schema 2 for non-array input', () => {
      expect(detectSchemaVersion(/** @type {any} */ (null))).toBe(2);
      expect(detectSchemaVersion(/** @type {any} */ (undefined))).toBe(2);
      expect(detectSchemaVersion(/** @type {any} */ ('not-an-array'))).toBe(2);
    });

    it('returns schema 2 when no PropSet ops exist', () => {
      const ops = [
        { type: 'NodeAdd', node: 'user:alice', dot: { writer: 'w1', seq: 1 } },
        { type: 'EdgeAdd', from: 'user:alice', to: 'user:bob', label: 'knows', dot: { writer: 'w1', seq: 2 } },
      ];
      expect(detectSchemaVersion(ops)).toBe(2);
    });

    it('ignores non-PropSet ops even if their node starts with \\x01', () => {
      const ops = [
        { type: 'NodeAdd', node: `${EDGE_PROP_PREFIX}weird`, dot: { writer: 'w1', seq: 1 } },
      ];
      expect(detectSchemaVersion(ops)).toBe(2);
    });
  });

  describe('encodePatchMessage with schema v3', () => {
    it('encodes a schema v3 patch message', () => {
      const message = encodePatchMessage({
        graph: 'events',
        writer: 'node-1',
        lamport: 1,
        patchOid: VALID_OID_SHA1,
        schema: 3,
      });

      expect(message).toContain('eg-schema: 3');
      expect(message).toContain('eg-kind: patch');
      expect(message).toContain('eg-graph: events');
    });

    it('defaults to schema 2 when schema is not provided', () => {
      const message = encodePatchMessage({
        graph: 'events',
        writer: 'node-1',
        lamport: 1,
        patchOid: VALID_OID_SHA1,
      });

      expect(message).toContain('eg-schema: 2');
    });
  });

  describe('decodePatchMessage with schema v3', () => {
    it('decodes a schema v3 patch message', () => {
      const encoded = encodePatchMessage({
        graph: 'events',
        writer: 'node-1',
        lamport: 42,
        patchOid: VALID_OID_SHA1,
        schema: 3,
      });

      const decoded = decodePatchMessage(encoded);

      expect(decoded.kind).toBe('patch');
      expect(decoded.graph).toBe('events');
      expect(decoded.writer).toBe('node-1');
      expect(decoded.lamport).toBe(42);
      expect(decoded.patchOid).toBe(VALID_OID_SHA1);
      expect(decoded.schema).toBe(3);
    });

    it('still decodes schema v2 patch messages without error', () => {
      const encoded = encodePatchMessage({
        graph: 'events',
        writer: 'node-1',
        lamport: 10,
        patchOid: VALID_OID_SHA1,
        schema: 2,
      });

      const decoded = decodePatchMessage(encoded);

      expect(decoded.kind).toBe('patch');
      expect(decoded.schema).toBe(2);
    });
  });

  describe('round-trip encoding/decoding', () => {
    it('v3 patch message round-trips correctly', () => {
      const original = {
        graph: 'my-graph',
        writer: 'writer-1',
        lamport: 99,
        patchOid: VALID_OID_SHA1,
        schema: 3,
      };

      const encoded = encodePatchMessage(original);
      const decoded = decodePatchMessage(encoded);

      expect(decoded.kind).toBe('patch');
      expect(decoded.graph).toBe(original.graph);
      expect(decoded.writer).toBe(original.writer);
      expect(decoded.lamport).toBe(original.lamport);
      expect(decoded.patchOid).toBe(original.patchOid);
      expect(decoded.schema).toBe(3);
    });

    it('v2 patch message still round-trips correctly', () => {
      const original = {
        graph: 'legacy-graph',
        writer: 'writer-2',
        lamport: 7,
        patchOid: VALID_OID_SHA1,
        schema: 2,
      };

      const encoded = encodePatchMessage(original);
      const decoded = decodePatchMessage(encoded);

      expect(decoded.kind).toBe('patch');
      expect(decoded.graph).toBe(original.graph);
      expect(decoded.writer).toBe(original.writer);
      expect(decoded.lamport).toBe(original.lamport);
      expect(decoded.patchOid).toBe(original.patchOid);
      expect(decoded.schema).toBe(2);
    });
  });

  describe('detectSchemaVersion integration with encodePatchMessage', () => {
    it('node-only ops produce schema 2', () => {
      const ops = [
        { type: 'NodeAdd', node: 'user:alice', dot: { writer: 'w1', seq: 1 } },
        { type: 'PropSet', node: 'user:alice', key: 'name', value: 'Alice' },
      ];
      const schema = detectSchemaVersion(ops);
      expect(schema).toBe(2);

      const message = encodePatchMessage({
        graph: 'test',
        writer: 'w1',
        lamport: 1,
        patchOid: VALID_OID_SHA1,
        schema,
      });
      expect(message).toContain('eg-schema: 2');
    });

    it('edge prop ops produce schema 3', () => {
      const edgePropNode = `${EDGE_PROP_PREFIX}a\0b\0rel\0weight`;
      const ops = [
        { type: 'NodeAdd', node: 'user:alice', dot: { writer: 'w1', seq: 1 } },
        { type: 'PropSet', node: edgePropNode, key: 'weight', value: 3.14 },
      ];
      const schema = detectSchemaVersion(ops);
      expect(schema).toBe(3);

      const message = encodePatchMessage({
        graph: 'test',
        writer: 'w1',
        lamport: 1,
        patchOid: VALID_OID_SHA1,
        schema,
      });
      expect(message).toContain('eg-schema: 3');
    });
  });

  describe('checkpoint message with schema v3', () => {
    it('encodes a schema v3 checkpoint with v5 checkpoint version', () => {
      const message = encodeCheckpointMessage({
        graph: 'events',
        stateHash: VALID_STATE_HASH,
        frontierOid: VALID_OID_SHA1,
        indexOid: VALID_OID_SHA1,
        schema: 3,
      });

      expect(message).toContain('eg-schema: 3');
      expect(message).toContain('eg-checkpoint: v5');
    });

    it('decodes a schema v3 checkpoint', () => {
      const encoded = encodeCheckpointMessage({
        graph: 'events',
        stateHash: VALID_STATE_HASH,
        frontierOid: VALID_OID_SHA1,
        indexOid: VALID_OID_SHA1,
        schema: 3,
      });

      const decoded = decodeCheckpointMessage(encoded);
      expect(decoded.schema).toBe(3);
      expect(decoded.checkpointVersion).toBe('v5');
    });
  });

  describe('anchor message with schema v3', () => {
    it('encodes a schema v3 anchor', () => {
      const message = encodeAnchorMessage({ graph: 'events', schema: 3 });
      expect(message).toContain('eg-schema: 3');
    });

    it('decodes a schema v3 anchor', () => {
      const encoded = encodeAnchorMessage({ graph: 'events', schema: 3 });
      const decoded = decodeAnchorMessage(encoded);
      expect(decoded.schema).toBe(3);
    });
  });

  describe('detectMessageKind with schema v3', () => {
    it('detects v3 patch messages', () => {
      const message = encodePatchMessage({
        graph: 'events',
        writer: 'node-1',
        lamport: 1,
        patchOid: VALID_OID_SHA1,
        schema: 3,
      });
      expect(detectMessageKind(message)).toBe('patch');
    });

    it('detects v3 checkpoint messages', () => {
      const message = encodeCheckpointMessage({
        graph: 'events',
        stateHash: VALID_STATE_HASH,
        frontierOid: VALID_OID_SHA1,
        indexOid: VALID_OID_SHA1,
        schema: 3,
      });
      expect(detectMessageKind(message)).toBe('checkpoint');
    });

    it('detects v3 anchor messages', () => {
      const message = encodeAnchorMessage({ graph: 'events', schema: 3 });
      expect(detectMessageKind(message)).toBe('anchor');
    });
  });
});

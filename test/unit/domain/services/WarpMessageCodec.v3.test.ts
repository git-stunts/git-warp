import { describe, it, expect } from 'vitest';
import {
  encodePatchMessage,
  encodeCheckpointMessage,
  encodeAnchorMessage,
  decodePatchMessage,
  decodeCheckpointMessage,
  decodeAnchorMessage,
  detectMessageKind,
} from '../../../../src/infrastructure/adapters/TrailerCommitMessageCodecAdapter.ts';
import {
  detectSchemaVersion,
  CLASSIC_PATCH_SCHEMA_VERSION,
  EDGE_PROPERTY_PATCH_SCHEMA_VERSION,
} from '../../../../src/domain/services/codec/MessageSchemaDetector.ts';
import { Dot } from '../../../../src/domain/crdt/Dot.ts';
import EdgeAdd from '../../../../src/domain/types/ops/EdgeAdd.ts';
import NodeAdd from '../../../../src/domain/types/ops/NodeAdd.ts';
import PropSet from '../../../../src/domain/types/ops/PropSet.ts';

// Test fixtures
const VALID_OID_SHA1 = 'a'.repeat(40);
const VALID_STATE_HASH = 'c'.repeat(64);

// Edge property prefix used in JoinReducer
const EDGE_PROP_PREFIX = '\x01';

function nodeAddOp(nodeId: string, counter: number): NodeAdd {
  return new NodeAdd(nodeId, new Dot('w1', counter));
}

function edgeAddOp(from: string, to: string, label: string, counter: number): EdgeAdd {
  return new EdgeAdd({ from, to, label, dot: new Dot('w1', counter) });
}

function nodePropSetOp(nodeId: string, key: string, value: string): PropSet {
  return new PropSet(nodeId, key, value);
}

function edgePropSetOp(from: string, to: string, label: string, key: string, value: number): PropSet {
  return new PropSet(`${EDGE_PROP_PREFIX}${from}\0${to}\0${label}`, key, value);
}

describe('WarpMessageCodec schema v3', () => {
  describe('constants', () => {
    it('CLASSIC_PATCH_SCHEMA_VERSION is 2', () => {
      expect(CLASSIC_PATCH_SCHEMA_VERSION).toBe(2);
    });

    it('EDGE_PROPERTY_PATCH_SCHEMA_VERSION is 3', () => {
      expect(EDGE_PROPERTY_PATCH_SCHEMA_VERSION).toBe(3);
    });
  });

  describe('detectSchemaVersion', () => {
    it('returns schema 2 for ops with only node PropSet', () => {
      const ops = [
        nodeAddOp('user:alice', 1),
        nodePropSetOp('user:alice', 'name', 'Alice'),
      ];
      expect(detectSchemaVersion(ops)).toBe(2);
    });

    it('returns schema 3 when any PropSet has edge prop prefix', () => {
      const ops = [
        nodeAddOp('user:alice', 1),
        edgePropSetOp('user:alice', 'user:bob', 'manages', 'weight', 1.5),
      ];
      expect(detectSchemaVersion(ops)).toBe(3);
    });

    it('returns schema 3 even if only one PropSet has edge prop prefix among many', () => {
      const ops = [
        nodePropSetOp('user:alice', 'name', 'Alice'),
        nodePropSetOp('user:bob', 'name', 'Bob'),
        edgePropSetOp('a', 'b', 'rel', 'key', 42),
        nodePropSetOp('user:carol', 'name', 'Carol'),
      ];
      expect(detectSchemaVersion(ops)).toBe(3);
    });

    it('returns schema 2 for empty ops array', () => {
      expect(detectSchemaVersion([])).toBe(2);
    });

    it('returns schema 2 for non-array input', () => {
      expect(detectSchemaVersion(null)).toBe(2);
      expect(detectSchemaVersion(undefined)).toBe(2);
      // @ts-expect-error Exercising the runtime guard for untyped JavaScript callers.
      expect(detectSchemaVersion('not-an-array')).toBe(2);
    });

    it('returns schema 2 when no PropSet ops exist', () => {
      const ops = [
        nodeAddOp('user:alice', 1),
        edgeAddOp('user:alice', 'user:bob', 'knows', 2),
      ];
      expect(detectSchemaVersion(ops)).toBe(2);
    });

    it('returns schema 2 for non-property runtime ops', () => {
      const ops = [
        nodeAddOp('user:alice', 1),
        edgeAddOp('user:alice', 'user:bob', 'knows', 2),
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
        nodeAddOp('user:alice', 1),
        nodePropSetOp('user:alice', 'name', 'Alice'),
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
      const ops = [
        nodeAddOp('user:alice', 1),
        edgePropSetOp('a', 'b', 'rel', 'weight', 3.14),
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

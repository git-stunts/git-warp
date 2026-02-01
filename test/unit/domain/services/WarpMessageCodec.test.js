import { describe, it, expect } from 'vitest';
import {
  encodePatchMessage,
  encodeCheckpointMessage,
  encodeAnchorMessage,
  decodePatchMessage,
  decodeCheckpointMessage,
  decodeAnchorMessage,
  detectMessageKind,
} from '../../../../src/domain/services/WarpMessageCodec.js';

// Test fixtures
const VALID_OID_SHA1 = 'a'.repeat(40);
const VALID_OID_SHA256 = 'b'.repeat(64);
const VALID_STATE_HASH = 'c'.repeat(64);

describe('WarpMessageCodec', () => {
  describe('encodePatchMessage', () => {
    it('encodes a valid patch message with all required fields', () => {
      const message = encodePatchMessage({
        graph: 'events',
        writer: 'node-1',
        lamport: 42,
        patchOid: VALID_OID_SHA1,
        schema: 2,
      });

      expect(message).toContain('empty-graph:patch');
      expect(message).toContain('eg-kind: patch');
      expect(message).toContain('eg-graph: events');
      expect(message).toContain('eg-writer: node-1');
      expect(message).toContain('eg-lamport: 42');
      expect(message).toContain(`eg-patch-oid: ${VALID_OID_SHA1}`);
      expect(message).toContain('eg-schema: 2');
    });

    it('accepts custom schema version', () => {
      const message = encodePatchMessage({
        graph: 'events',
        writer: 'node-1',
        lamport: 1,
        patchOid: VALID_OID_SHA1,
        schema: 3,
      });

      expect(message).toContain('eg-schema: 3');
    });

    it('accepts SHA-256 OIDs', () => {
      const message = encodePatchMessage({
        graph: 'events',
        writer: 'node-1',
        lamport: 1,
        patchOid: VALID_OID_SHA256,
      });

      expect(message).toContain(`eg-patch-oid: ${VALID_OID_SHA256}`);
    });

    it('rejects invalid graph name', () => {
      expect(() =>
        encodePatchMessage({
          graph: '../etc',
          writer: 'node-1',
          lamport: 1,
          patchOid: VALID_OID_SHA1,
        })
      ).toThrow('path traversal');
    });

    it('rejects empty graph name', () => {
      expect(() =>
        encodePatchMessage({
          graph: '',
          writer: 'node-1',
          lamport: 1,
          patchOid: VALID_OID_SHA1,
        })
      ).toThrow('cannot be empty');
    });

    it('rejects invalid writer ID', () => {
      expect(() =>
        encodePatchMessage({
          graph: 'events',
          writer: 'node/1',
          lamport: 1,
          patchOid: VALID_OID_SHA1,
        })
      ).toThrow('forward slash');
    });

    it('rejects zero lamport', () => {
      expect(() =>
        encodePatchMessage({
          graph: 'events',
          writer: 'node-1',
          lamport: 0,
          patchOid: VALID_OID_SHA1,
        })
      ).toThrow('positive integer');
    });

    it('rejects negative lamport', () => {
      expect(() =>
        encodePatchMessage({
          graph: 'events',
          writer: 'node-1',
          lamport: -1,
          patchOid: VALID_OID_SHA1,
        })
      ).toThrow('positive integer');
    });

    it('rejects non-integer lamport', () => {
      expect(() =>
        encodePatchMessage({
          graph: 'events',
          writer: 'node-1',
          lamport: 1.5,
          patchOid: VALID_OID_SHA1,
        })
      ).toThrow('positive integer');
    });

    it('rejects invalid OID format', () => {
      expect(() =>
        encodePatchMessage({
          graph: 'events',
          writer: 'node-1',
          lamport: 1,
          patchOid: 'not-a-valid-oid',
        })
      ).toThrow('40 or 64 character hex string');
    });

    it('rejects OID with uppercase characters', () => {
      expect(() =>
        encodePatchMessage({
          graph: 'events',
          writer: 'node-1',
          lamport: 1,
          patchOid: 'A'.repeat(40),
        })
      ).toThrow('40 or 64 character hex string');
    });
  });

  describe('encodeCheckpointMessage', () => {
    it('encodes a valid checkpoint message with all required fields', () => {
      const message = encodeCheckpointMessage({
        graph: 'events',
        stateHash: VALID_STATE_HASH,
        frontierOid: VALID_OID_SHA1,
        indexOid: VALID_OID_SHA1,
        schema: 2,
      });

      expect(message).toContain('empty-graph:checkpoint');
      expect(message).toContain('eg-kind: checkpoint');
      expect(message).toContain('eg-graph: events');
      expect(message).toContain(`eg-state-hash: ${VALID_STATE_HASH}`);
      expect(message).toContain(`eg-frontier-oid: ${VALID_OID_SHA1}`);
      expect(message).toContain(`eg-index-oid: ${VALID_OID_SHA1}`);
      expect(message).toContain('eg-schema: 2');
    });

    it('accepts custom schema version', () => {
      const message = encodeCheckpointMessage({
        graph: 'events',
        stateHash: VALID_STATE_HASH,
        frontierOid: VALID_OID_SHA1,
        indexOid: VALID_OID_SHA1,
        schema: 3,
      });

      expect(message).toContain('eg-schema: 3');
    });

    it('rejects invalid graph name', () => {
      expect(() =>
        encodeCheckpointMessage({
          graph: 'my graph',
          stateHash: VALID_STATE_HASH,
          frontierOid: VALID_OID_SHA1,
          indexOid: VALID_OID_SHA1,
        })
      ).toThrow('contains space');
    });

    it('rejects invalid stateHash (not 64 chars)', () => {
      expect(() =>
        encodeCheckpointMessage({
          graph: 'events',
          stateHash: 'a'.repeat(40),
          frontierOid: VALID_OID_SHA1,
          indexOid: VALID_OID_SHA1,
        })
      ).toThrow('64 character hex string');
    });

    it('rejects invalid frontierOid', () => {
      expect(() =>
        encodeCheckpointMessage({
          graph: 'events',
          stateHash: VALID_STATE_HASH,
          frontierOid: 'invalid',
          indexOid: VALID_OID_SHA1,
        })
      ).toThrow('40 or 64 character hex string');
    });

    it('rejects invalid indexOid', () => {
      expect(() =>
        encodeCheckpointMessage({
          graph: 'events',
          stateHash: VALID_STATE_HASH,
          frontierOid: VALID_OID_SHA1,
          indexOid: 'invalid',
        })
      ).toThrow('40 or 64 character hex string');
    });
  });

  describe('encodeAnchorMessage', () => {
    it('encodes a valid anchor message with required fields', () => {
      const message = encodeAnchorMessage({ graph: 'events', schema: 2 });

      expect(message).toContain('empty-graph:anchor');
      expect(message).toContain('eg-kind: anchor');
      expect(message).toContain('eg-graph: events');
      expect(message).toContain('eg-schema: 2');
    });

    it('accepts custom schema version', () => {
      const message = encodeAnchorMessage({ graph: 'events', schema: 5 });

      expect(message).toContain('eg-schema: 5');
    });

    it('rejects invalid graph name', () => {
      expect(() => encodeAnchorMessage({ graph: '' })).toThrow('cannot be empty');
    });

    it('rejects zero schema version', () => {
      expect(() => encodeAnchorMessage({ graph: 'events', schema: 0 })).toThrow('positive integer');
    });
  });

  describe('decodePatchMessage', () => {
    it('decodes a valid patch message', () => {
      const encoded = encodePatchMessage({
        graph: 'events',
        writer: 'node-1',
        lamport: 42,
        patchOid: VALID_OID_SHA1,
        schema: 2,
      });

      const decoded = decodePatchMessage(encoded);

      expect(decoded.kind).toBe('patch');
      expect(decoded.graph).toBe('events');
      expect(decoded.writer).toBe('node-1');
      expect(decoded.lamport).toBe(42);
      expect(decoded.patchOid).toBe(VALID_OID_SHA1);
      expect(decoded.schema).toBe(2);
    });

    it('throws when eg-kind is not patch', () => {
      const anchorMessage = encodeAnchorMessage({ graph: 'events' });

      expect(() => decodePatchMessage(anchorMessage)).toThrow("eg-kind must be 'patch'");
    });

    it('throws when eg-graph is missing', () => {
      // Manually construct a malformed message
      const message = `empty-graph:patch

eg-kind: patch
eg-writer: node-1
eg-lamport: 1
eg-patch-oid: ${VALID_OID_SHA1}
eg-schema: 1`;

      expect(() => decodePatchMessage(message)).toThrow('missing required trailer eg-graph');
    });

    it('throws when eg-writer is missing', () => {
      const message = `empty-graph:patch

eg-kind: patch
eg-graph: events
eg-lamport: 1
eg-patch-oid: ${VALID_OID_SHA1}
eg-schema: 1`;

      expect(() => decodePatchMessage(message)).toThrow('missing required trailer eg-writer');
    });

    it('throws when eg-lamport is missing', () => {
      const message = `empty-graph:patch

eg-kind: patch
eg-graph: events
eg-writer: node-1
eg-patch-oid: ${VALID_OID_SHA1}
eg-schema: 1`;

      expect(() => decodePatchMessage(message)).toThrow('missing required trailer eg-lamport');
    });

    it('throws when eg-lamport is not a positive integer', () => {
      const message = `empty-graph:patch

eg-kind: patch
eg-graph: events
eg-writer: node-1
eg-lamport: zero
eg-patch-oid: ${VALID_OID_SHA1}
eg-schema: 1`;

      expect(() => decodePatchMessage(message)).toThrow('eg-lamport must be a positive integer');
    });

    it('throws when eg-lamport is zero', () => {
      const message = `empty-graph:patch

eg-kind: patch
eg-graph: events
eg-writer: node-1
eg-lamport: 0
eg-patch-oid: ${VALID_OID_SHA1}
eg-schema: 1`;

      expect(() => decodePatchMessage(message)).toThrow('eg-lamport must be a positive integer');
    });

    it('throws when eg-patch-oid is missing', () => {
      const message = `empty-graph:patch

eg-kind: patch
eg-graph: events
eg-writer: node-1
eg-lamport: 1
eg-schema: 1`;

      expect(() => decodePatchMessage(message)).toThrow('missing required trailer eg-patch-oid');
    });

    it('throws when eg-schema is missing', () => {
      const message = `empty-graph:patch

eg-kind: patch
eg-graph: events
eg-writer: node-1
eg-lamport: 1
eg-patch-oid: ${VALID_OID_SHA1}`;

      expect(() => decodePatchMessage(message)).toThrow('missing required trailer eg-schema');
    });
  });

  describe('decodeCheckpointMessage', () => {
    it('decodes a valid checkpoint message', () => {
      const encoded = encodeCheckpointMessage({
        graph: 'events',
        stateHash: VALID_STATE_HASH,
        frontierOid: VALID_OID_SHA1,
        indexOid: VALID_OID_SHA1,
        schema: 2,
      });

      const decoded = decodeCheckpointMessage(encoded);

      expect(decoded.kind).toBe('checkpoint');
      expect(decoded.graph).toBe('events');
      expect(decoded.stateHash).toBe(VALID_STATE_HASH);
      expect(decoded.frontierOid).toBe(VALID_OID_SHA1);
      expect(decoded.indexOid).toBe(VALID_OID_SHA1);
      expect(decoded.schema).toBe(2);
    });

    it('throws when eg-kind is not checkpoint', () => {
      const patchMessage = encodePatchMessage({
        graph: 'events',
        writer: 'node-1',
        lamport: 1,
        patchOid: VALID_OID_SHA1,
      });

      expect(() => decodeCheckpointMessage(patchMessage)).toThrow(
        "eg-kind must be 'checkpoint'"
      );
    });

    it('throws when eg-graph is missing', () => {
      const message = `empty-graph:checkpoint

eg-kind: checkpoint
eg-state-hash: ${VALID_STATE_HASH}
eg-frontier-oid: ${VALID_OID_SHA1}
eg-index-oid: ${VALID_OID_SHA1}
eg-schema: 1`;

      expect(() => decodeCheckpointMessage(message)).toThrow('missing required trailer eg-graph');
    });

    it('throws when eg-state-hash is missing', () => {
      const message = `empty-graph:checkpoint

eg-kind: checkpoint
eg-graph: events
eg-frontier-oid: ${VALID_OID_SHA1}
eg-index-oid: ${VALID_OID_SHA1}
eg-schema: 1`;

      expect(() => decodeCheckpointMessage(message)).toThrow(
        'missing required trailer eg-state-hash'
      );
    });

    it('throws when eg-frontier-oid is missing', () => {
      const message = `empty-graph:checkpoint

eg-kind: checkpoint
eg-graph: events
eg-state-hash: ${VALID_STATE_HASH}
eg-index-oid: ${VALID_OID_SHA1}
eg-schema: 1`;

      expect(() => decodeCheckpointMessage(message)).toThrow(
        'missing required trailer eg-frontier-oid'
      );
    });

    it('throws when eg-index-oid is missing', () => {
      const message = `empty-graph:checkpoint

eg-kind: checkpoint
eg-graph: events
eg-state-hash: ${VALID_STATE_HASH}
eg-frontier-oid: ${VALID_OID_SHA1}
eg-schema: 1`;

      expect(() => decodeCheckpointMessage(message)).toThrow(
        'missing required trailer eg-index-oid'
      );
    });

    it('throws when eg-schema is missing', () => {
      const message = `empty-graph:checkpoint

eg-kind: checkpoint
eg-graph: events
eg-state-hash: ${VALID_STATE_HASH}
eg-frontier-oid: ${VALID_OID_SHA1}
eg-index-oid: ${VALID_OID_SHA1}`;

      expect(() => decodeCheckpointMessage(message)).toThrow(
        'missing required trailer eg-schema'
      );
    });
  });

  describe('decodeAnchorMessage', () => {
    it('decodes a valid anchor message', () => {
      const encoded = encodeAnchorMessage({ graph: 'events', schema: 2 });

      const decoded = decodeAnchorMessage(encoded);

      expect(decoded.kind).toBe('anchor');
      expect(decoded.graph).toBe('events');
      expect(decoded.schema).toBe(2);
    });

    it('throws when eg-kind is not anchor', () => {
      const patchMessage = encodePatchMessage({
        graph: 'events',
        writer: 'node-1',
        lamport: 1,
        patchOid: VALID_OID_SHA1,
      });

      expect(() => decodeAnchorMessage(patchMessage)).toThrow("eg-kind must be 'anchor'");
    });

    it('throws when eg-graph is missing', () => {
      const message = `empty-graph:anchor

eg-kind: anchor
eg-schema: 1`;

      expect(() => decodeAnchorMessage(message)).toThrow('missing required trailer eg-graph');
    });

    it('throws when eg-schema is missing', () => {
      const message = `empty-graph:anchor

eg-kind: anchor
eg-graph: events`;

      expect(() => decodeAnchorMessage(message)).toThrow('missing required trailer eg-schema');
    });

    it('throws when eg-schema is invalid', () => {
      const message = `empty-graph:anchor

eg-kind: anchor
eg-graph: events
eg-schema: invalid`;

      expect(() => decodeAnchorMessage(message)).toThrow('eg-schema must be a positive integer');
    });
  });

  describe('detectMessageKind', () => {
    it('detects patch messages', () => {
      const message = encodePatchMessage({
        graph: 'events',
        writer: 'node-1',
        lamport: 1,
        patchOid: VALID_OID_SHA1,
        schema: 2,
      });

      expect(detectMessageKind(message)).toBe('patch');
    });

    it('detects checkpoint messages', () => {
      const message = encodeCheckpointMessage({
        graph: 'events',
        stateHash: VALID_STATE_HASH,
        frontierOid: VALID_OID_SHA1,
        indexOid: VALID_OID_SHA1,
        schema: 2,
      });

      expect(detectMessageKind(message)).toBe('checkpoint');
    });

    it('detects anchor messages', () => {
      const message = encodeAnchorMessage({ graph: 'events', schema: 2 });

      expect(detectMessageKind(message)).toBe('anchor');
    });

    it('returns null for non-WARP messages', () => {
      const message = 'Just a regular commit message';

      expect(detectMessageKind(message)).toBeNull();
    });

    it('returns null for messages with unknown eg-kind', () => {
      const message = `empty-graph:unknown

eg-kind: unknown
eg-graph: events
eg-schema: 1`;

      expect(detectMessageKind(message)).toBeNull();
    });

    it('returns null for non-string input', () => {
      expect(detectMessageKind(null)).toBeNull();
      expect(detectMessageKind(undefined)).toBeNull();
      expect(detectMessageKind(123)).toBeNull();
      expect(detectMessageKind({})).toBeNull();
    });

    it('returns null for empty string', () => {
      expect(detectMessageKind('')).toBeNull();
    });

    it('returns null for malformed messages', () => {
      expect(detectMessageKind('just\nsome\ntext')).toBeNull();
    });
  });

  describe('round-trip encoding/decoding', () => {
    it('patch message round-trips correctly', () => {
      const original = {
        graph: 'my-events',
        writer: 'producer-1',
        lamport: 12345,
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
      expect(decoded.schema).toBe(original.schema);
    });

    it('checkpoint message round-trips correctly', () => {
      const original = {
        graph: 'team/events',
        stateHash: VALID_STATE_HASH,
        frontierOid: VALID_OID_SHA1,
        indexOid: 'd'.repeat(40),
        schema: 2,
      };

      const encoded = encodeCheckpointMessage(original);
      const decoded = decodeCheckpointMessage(encoded);

      expect(decoded.kind).toBe('checkpoint');
      expect(decoded.graph).toBe(original.graph);
      expect(decoded.stateHash).toBe(original.stateHash);
      expect(decoded.frontierOid).toBe(original.frontierOid);
      expect(decoded.indexOid).toBe(original.indexOid);
      expect(decoded.schema).toBe(original.schema);
    });

    it('anchor message round-trips correctly', () => {
      const original = {
        graph: 'production',
        schema: 3,
      };

      const encoded = encodeAnchorMessage(original);
      const decoded = decodeAnchorMessage(encoded);

      expect(decoded.kind).toBe('anchor');
      expect(decoded.graph).toBe(original.graph);
      expect(decoded.schema).toBe(original.schema);
    });

    it('handles edge case graph names', () => {
      const edgeCases = ['a', 'Graph123', 'my-graph_v2', 'team/shared/events'];

      for (const graph of edgeCases) {
        const encoded = encodeAnchorMessage({ graph, schema: 2 });
        const decoded = decodeAnchorMessage(encoded);
        expect(decoded.graph).toBe(graph);
      }
    });

    it('handles edge case writer IDs', () => {
      const edgeCases = ['a', 'Writer_01', 'node-123', 'writer.v2'];

      for (const writer of edgeCases) {
        const encoded = encodePatchMessage({
          graph: 'events',
          writer,
          lamport: 1,
          patchOid: VALID_OID_SHA1,
          schema: 2,
        });
        const decoded = decodePatchMessage(encoded);
        expect(decoded.writer).toBe(writer);
      }
    });

    it('handles large lamport values', () => {
      const largeLamport = Number.MAX_SAFE_INTEGER;

      const encoded = encodePatchMessage({
        graph: 'events',
        writer: 'node-1',
        lamport: largeLamport,
        patchOid: VALID_OID_SHA1,
        schema: 2,
      });
      const decoded = decodePatchMessage(encoded);

      expect(decoded.lamport).toBe(largeLamport);
    });
  });

  describe('message format verification', () => {
    it('patch message has correct title', () => {
      const message = encodePatchMessage({
        graph: 'events',
        writer: 'node-1',
        lamport: 1,
        patchOid: VALID_OID_SHA1,
        schema: 2,
      });

      const lines = message.split('\n');
      expect(lines[0]).toBe('empty-graph:patch');
    });

    it('checkpoint message has correct title', () => {
      const message = encodeCheckpointMessage({
        graph: 'events',
        stateHash: VALID_STATE_HASH,
        frontierOid: VALID_OID_SHA1,
        indexOid: VALID_OID_SHA1,
        schema: 2,
      });

      const lines = message.split('\n');
      expect(lines[0]).toBe('empty-graph:checkpoint');
    });

    it('anchor message has correct title', () => {
      const message = encodeAnchorMessage({ graph: 'events', schema: 2 });

      const lines = message.split('\n');
      expect(lines[0]).toBe('empty-graph:anchor');
    });

    it('trailers are separated by blank line from title', () => {
      const message = encodeAnchorMessage({ graph: 'events', schema: 2 });

      const lines = message.split('\n');
      expect(lines[0]).toBe('empty-graph:anchor');
      expect(lines[1]).toBe('');
      expect(lines[2]).toMatch(/^eg-/);
    });
  });
});

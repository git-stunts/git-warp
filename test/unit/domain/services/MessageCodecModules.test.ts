import { describe, expect, it } from 'vitest';

import {
  decodeAnchorMessage,
  encodeAnchorMessage,
} from '../../../../src/domain/services/codec/AnchorMessageCodec.ts';
import {
  decodeCheckpointMessage,
  encodeCheckpointMessage,
} from '../../../../src/domain/services/codec/CheckpointMessageCodec.ts';
import {
  getCodec,
  validateOid,
  validatePositiveInteger,
  validateSha256,
} from '../../../../src/domain/services/codec/MessageCodecInternal.ts';
import {
  assertOpsCompatible,
  detectMessageKind,
  detectSchemaVersion,
  EDGE_PROPERTY_PATCH_SCHEMA_VERSION,
} from '../../../../src/domain/services/codec/MessageSchemaDetector.ts';
import {
  decodePatchMessage,
  encodePatchMessage,
} from '../../../../src/domain/services/codec/PatchMessageCodec.ts';
import {
  parsePositiveIntTrailer,
  requireTrailer,
  validateKindDiscriminator,
} from '../../../../src/domain/services/codec/TrailerValidation.ts';
import { EDGE_PROP_PREFIX } from '../../../../src/domain/services/KeyCodec.ts';
import SchemaUnsupportedError from '../../../../src/domain/errors/SchemaUnsupportedError.ts';
import PropSet from '../../../../src/domain/types/ops/PropSet.ts';

const OID = 'a'.repeat(40);
const STATE_HASH = 'b'.repeat(64);

describe('message codec modules', () => {
  it('round-trips patch, checkpoint, and anchor messages through individual modules', () => {
    const patchMessage = encodePatchMessage({
      graph: 'events',
      writer: 'writer-1',
      lamport: 7,
      patchOid: OID,
      schema: 3,
    });
    const checkpointMessage = encodeCheckpointMessage({
      graph: 'events',
      stateHash: STATE_HASH,
      frontierOid: OID,
      indexOid: OID,
      schema: 3,
    });
    const anchorMessage = encodeAnchorMessage({ graph: 'events', schema: 3 });

    expect(decodePatchMessage(patchMessage)).toMatchObject({
      kind: 'patch',
      graph: 'events',
      writer: 'writer-1',
      lamport: 7,
      patchOid: OID,
      schema: 3,
    });
    expect(decodeCheckpointMessage(checkpointMessage)).toMatchObject({
      kind: 'checkpoint',
      graph: 'events',
      stateHash: STATE_HASH,
      frontierOid: OID,
      indexOid: OID,
      schema: 3,
    });
    expect(decodeAnchorMessage(anchorMessage)).toMatchObject({
      kind: 'anchor',
      graph: 'events',
      schema: 3,
    });
  });

  it('detects message kind and schema compatibility from shared detector module', () => {
    const edgePropOp = new PropSet(`${EDGE_PROP_PREFIX}node:a\0node:b\0rel`, 'weight', 1);
    const anchorMessage = encodeAnchorMessage({ graph: 'events', schema: 2 });

    expect(detectSchemaVersion([edgePropOp])).toBe(EDGE_PROPERTY_PATCH_SCHEMA_VERSION);
    expect(() => assertOpsCompatible([edgePropOp], 2)).toThrow(SchemaUnsupportedError);
    expect(detectMessageKind(anchorMessage)).toBe('anchor');
    expect(detectMessageKind('not a warp trailer message')).toBeNull();
  });

  it('validates trailer presence, integer parsing, and kind discriminators', () => {
    const trailers = {
      'eg-kind': 'patch',
      'eg-lamport': '7',
    };

    expect(requireTrailer(trailers, 'lamport', 'patch')).toBe('7');
    expect(parsePositiveIntTrailer(trailers, 'lamport', 'patch')).toBe(7);
    expect(() => validateKindDiscriminator(trailers, 'patch')).not.toThrow();
    expect(() => requireTrailer(trailers, 'graph', 'patch')).toThrow('eg-graph');
    expect(() => parsePositiveIntTrailer({ ...trailers, 'eg-lamport': '7x' }, 'lamport', 'patch')).toThrow(
      'positive integer',
    );
    expect(() => validateKindDiscriminator({ ...trailers, 'eg-kind': 'anchor' }, 'patch')).toThrow(
      "eg-kind must be 'patch'",
    );
  });

  it('validates shared scalar fields and reuses a singleton trailer codec', () => {
    expect(getCodec()).toBe(getCodec());
    expect(() => validateOid(OID, 'patchOid')).not.toThrow();
    expect(() => validateSha256(STATE_HASH, 'stateHash')).not.toThrow();
    expect(() => validatePositiveInteger(1, 'schema')).not.toThrow();
    expect(() => validateOid('A'.repeat(40), 'patchOid')).toThrow('40 or 64 character hex string');
    expect(() => validateSha256(OID, 'stateHash')).toThrow('64 character hex string');
    expect(() => validatePositiveInteger(0, 'schema')).toThrow('positive integer');
  });
});

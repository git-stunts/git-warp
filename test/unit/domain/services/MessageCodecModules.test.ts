import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  decodeAnchorMessage,
  decodeCheckpointMessage,
  decodePatchMessage,
  detectMessageKind as detectCommitMessageKind,
  encodeAnchorMessage,
  encodeCheckpointMessage,
  encodePatchMessage,
} from '../../../../src/infrastructure/adapters/TrailerCommitMessageCodecAdapter.ts';
import {
  decodeTrailerTextMessage,
  encodeTrailerTextMessage,
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
  parsePositiveIntTrailer,
  requireTrailer,
  validateKindDiscriminator,
} from '../../../../src/domain/services/codec/TrailerValidation.ts';
import { EDGE_PROP_PREFIX } from '../../../../src/domain/services/KeyCodec.ts';
import SchemaUnsupportedError from '../../../../src/domain/errors/SchemaUnsupportedError.ts';
import PropSet from '../../../../src/domain/types/ops/PropSet.ts';

const OID = 'a'.repeat(40);
const STATE_HASH = 'b'.repeat(64);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const DOMAIN_CODEC_MODULES = [
  'src/domain/services/codec/AuditMessageCodec.ts',
  'src/domain/services/codec/CommitMessageCodecRequirement.ts',
  'src/domain/services/codec/MessageCodecInternal.ts',
  'src/domain/services/codec/MessageSchemaDetector.ts',
  'src/domain/services/codec/TrailerValidation.ts',
  'src/domain/services/codec/WarpMessageCodec.ts',
];
const RETIRED_DOMAIN_COMMIT_MESSAGE_FACADES = [
  'src/domain/services/codec/AnchorMessageCodec.ts',
  'src/domain/services/codec/CheckpointMessageCodec.ts',
  'src/domain/services/codec/PatchMessageCodec.ts',
  'src/domain/services/codec/TextCommitMessageCodec.ts',
];
const TRAILER_COMMIT_MESSAGE_ADAPTER = 'src/infrastructure/adapters/TrailerCommitMessageCodecAdapter.ts';
const RUNTIME_HOST_BOOT = 'src/domain/warp/RuntimeHostBoot.ts';

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

  it('keeps trailer-codec behind the commit message adapter boundary', () => {
    const adapterSource = readFileSync(resolve(ROOT, TRAILER_COMMIT_MESSAGE_ADAPTER), 'utf8');

    expect(adapterSource).toContain("@git-stunts/trailer-codec");
    expect(adapterSource).toContain('extends CommitMessageCodecPort');

    for (const modulePath of DOMAIN_CODEC_MODULES) {
      const source = readFileSync(resolve(ROOT, modulePath), 'utf8');

      expect(source, `${modulePath} must not import infrastructure adapters`)
        .not.toContain('infrastructure/adapters');
      expect(source, `${modulePath} must not import the trailer-codec package`)
        .not.toContain('@git-stunts/trailer-codec');
    }
  });

  it('keeps runtime boot from resolving the trailer adapter inside domain', () => {
    const source = readFileSync(resolve(ROOT, RUNTIME_HOST_BOOT), 'utf8');

    expect(source).toContain('installRuntimeHostCommitMessageCodecResolver');
    expect(source).not.toContain('TrailerCommitMessageCodecAdapter');
    expect(source).not.toContain('@git-stunts/trailer-codec');
  });

  it('retires domain-local commit message facade modules', () => {
    for (const modulePath of RETIRED_DOMAIN_COMMIT_MESSAGE_FACADES) {
      expect(existsSync(resolve(ROOT, modulePath)), `${modulePath} must stay deleted`).toBe(false);
    }
  });

  it('detects message kind and schema compatibility from shared detector module', () => {
    const edgePropOp = new PropSet(`${EDGE_PROP_PREFIX}node:a\0node:b\0rel`, 'weight', 1);
    const anchorMessage = encodeAnchorMessage({ graph: 'events', schema: 2 });

    expect(detectSchemaVersion([edgePropOp])).toBe(EDGE_PROPERTY_PATCH_SCHEMA_VERSION);
    expect(() => assertOpsCompatible([edgePropOp], 2)).toThrow(SchemaUnsupportedError);
    expect(detectCommitMessageKind(anchorMessage)).toBe('anchor');
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

  it('validates shared scalar fields and trailer text parsing', () => {
    const trailerMessage = encodeTrailerTextMessage({
      title: 'warp:test',
      trailers: {
        'eg-kind': 'test',
      },
    });

    expect(decodeTrailerTextMessage(trailerMessage).trailers['eg-kind']).toBe('test');
    expect(() => validateOid(OID, 'patchOid')).not.toThrow();
    expect(() => validateSha256(STATE_HASH, 'stateHash')).not.toThrow();
    expect(() => validatePositiveInteger(1, 'schema')).not.toThrow();
    expect(() => validateOid('A'.repeat(40), 'patchOid')).toThrow('40 or 64 character hex string');
    expect(() => validateSha256(OID, 'stateHash')).toThrow('64 character hex string');
    expect(() => validatePositiveInteger(0, 'schema')).toThrow('positive integer');
  });

  it('rejects multiline trailer text before encoding', () => {
    expect(() => encodeTrailerTextMessage({
      title: 'warp:test',
      trailers: {
        'eg-kind': 'test\ninjected: true',
      },
    })).toThrow('single-line');
    expect(() => encodeTrailerTextMessage({
      title: 'warp:test',
      trailers: {
        'eg-kind:extra': 'test',
      },
    })).toThrow('must not contain ":"');
  });
});

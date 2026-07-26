import { describe, expect, it } from 'vitest';

import AssetHandle from '../../../../src/domain/storage/AssetHandle.ts';
import {
  TrailerCommitMessageCodecAdapter,
  TRAILER_KEYS,
  decodePatchMessage,
  encodeAnchorMessage,
  encodeCheckpointMessage,
  encodePatchMessage,
} from '../../../../src/infrastructure/adapters/TrailerCommitMessageCodecAdapter.ts';
import {
  createGitCasPatchStorage,
} from '../../../../src/ports/CommitMessageCodecPort.ts';

const OID = 'a'.repeat(40);
const STATE_HASH = 'b'.repeat(64);

function replaceTrailer(message: string, key: string, value: string): string {
  const prefix = `${key}: `;
  const lines = message.split('\n');
  const index = lines.findIndex((line) => line.startsWith(prefix));
  if (index < 0) {
    throw new Error(`missing fixture trailer ${key}`);
  }
  lines[index] = `${prefix}${value}`;
  return lines.join('\n');
}

function appendTrailer(message: string, key: string, value: string): string {
  return `${message.trimEnd()}\n${key}: ${value}\n`;
}

function removeTrailer(message: string, key: string): string {
  const prefix = `${key}: `;
  return message
    .split('\n')
    .filter((line) => !line.startsWith(prefix))
    .join('\n');
}

function currentPatchMessage(): string {
  return encodePatchMessage({
    graph: 'events',
    writer: 'alice',
    lamport: 1,
    patchOid: OID,
  });
}

describe('TrailerCommitMessageCodecAdapter storage routing', () => {
  it('round-trips the current git-cas asset route without a legacy OID trailer', () => {
    const adapter = new TrailerCommitMessageCodecAdapter();
    const patchHandle = new AssetHandle('asset:current-patch');
    const encoded = adapter.encodePatch({
      kind: 'patch',
      graph: 'events',
      writer: 'alice',
      lamport: 1,
      patchHandle,
      schema: 2,
      storage: createGitCasPatchStorage({ encrypted: false }),
    });

    expect(encoded).toContain(`${TRAILER_KEYS.patchHandle}: ${patchHandle.toString()}`);
    expect(encoded).not.toContain('eg-patch-oid:');
    expect(adapter.decodePatch(encoded)).toEqual({
      kind: 'patch',
      graph: 'events',
      writer: 'alice',
      lamport: 1,
      patchHandle,
      schema: 2,
      storage: createGitCasPatchStorage({ encrypted: false }),
    });
  });

  it('rejects a v18 raw-OID patch message', () => {
    const adapter = new TrailerCommitMessageCodecAdapter();
    const encoded = [
      'warp:patch',
      '',
      'eg-kind: patch',
      'eg-graph: events',
      'eg-writer: alice',
      'eg-lamport: 1',
      `eg-patch-oid: ${OID}`,
      'eg-schema: 2',
      '',
    ].join('\n');

    expect(() => adapter.decodePatch(encoded))
      .toThrow(/current git-cas asset storage trailers/);
  });

  it('rejects partial and unknown git-cas storage trailer pairs', () => {
    const adapter = new TrailerCommitMessageCodecAdapter();
    const partial = removeTrailer(
      currentPatchMessage(),
      TRAILER_KEYS.storageSchema,
    );
    const unknown = replaceTrailer(
      replaceTrailer(
        currentPatchMessage(),
        TRAILER_KEYS.storageVersion,
        'unknown-storage',
      ),
      TRAILER_KEYS.storageSchema,
      'unknown-schema',
    );

    expect(() => adapter.decodePatch(partial))
      .toThrow(/current git-cas asset storage trailers/);
    expect(() => adapter.decodePatch(unknown))
      .toThrow(/current git-cas asset storage trailers/);
  });

  it('encodes the OID helper as an explicit current asset handle', () => {
    const decoded = new TrailerCommitMessageCodecAdapter().decodePatch(encodePatchMessage({
      graph: 'events',
      writer: 'alice',
      lamport: 1,
      patchOid: OID,
    }));

    expect(decoded.patchHandle.toString()).toBe(
      `git-cas:1:asset:manifest-tree:cbor:sha1:${OID}`,
    );
    expect(decoded.storage).toEqual(createGitCasPatchStorage({ encrypted: false }));
  });

  it('round-trips encrypted current asset storage', () => {
    const encoded = encodePatchMessage({
      graph: 'events',
      writer: 'alice',
      lamport: 1,
      patchOid: OID,
      encrypted: true,
    });
    const decoded = decodePatchMessage(encoded);
    const canonical = new TrailerCommitMessageCodecAdapter().decodePatch(encoded);

    expect(decoded).toMatchObject({
      encrypted: true,
      storage: { strategy: 'git-cas-asset', encrypted: true },
    });
    expect(canonical).not.toHaveProperty('patchOid');
    expect(canonical.patchHandle.toString()).toBe(
      `git-cas:1:asset:manifest-tree:cbor:sha1:${OID}`,
    );
  });
});

describe('TrailerCommitMessageCodecAdapter validation', () => {
  it('rejects malformed patch scalar trailers', () => {
    const adapter = new TrailerCommitMessageCodecAdapter();
    const encoded = currentPatchMessage();

    expect(() => adapter.decodePatch(
      replaceTrailer(encoded, TRAILER_KEYS.lamport, '0'),
    )).toThrow(/positive integer/);
    expect(() => adapter.decodePatch(
      removeTrailer(encoded, TRAILER_KEYS.patchHandle),
    )).toThrow(/missing required trailer/);
    expect(() => adapter.decodePatch(
      replaceTrailer(encoded, TRAILER_KEYS.graph, '../events'),
    )).toThrow(/graph/i);
  });

  it('rejects malformed checkpoint hashes and graph names', () => {
    const adapter = new TrailerCommitMessageCodecAdapter();
    const encoded = encodeCheckpointMessage({
      graph: 'events',
      stateHash: STATE_HASH,
      bundleHandle: `bundle:${OID}`,
    });

    expect(() => adapter.decodeCheckpoint(
      replaceTrailer(encoded, TRAILER_KEYS.stateHash, 'not-a-hash'),
    )).toThrow(/stateHash/);
    expect(() => adapter.decodeCheckpoint(
      replaceTrailer(encoded, TRAILER_KEYS.graph, '../events'),
    )).toThrow(/graph/i);
  });

  it('rejects invalid patch and anchor values before encoding', () => {
    const adapter = new TrailerCommitMessageCodecAdapter();

    expect(() => adapter.encodePatch({
      kind: 'patch',
      graph: '../events',
      writer: 'alice',
      lamport: 1,
      patchHandle: new AssetHandle(
        `git-cas:1:asset:manifest-tree:cbor:sha1:${OID}`,
      ),
      schema: 2,
      storage: createGitCasPatchStorage({ encrypted: false }),
    })).toThrow(/graph/i);
    expect(() => adapter.encodeAnchor({
      kind: 'anchor',
      graph: '../events',
      schema: 2,
    })).toThrow(/graph/i);
  });

  it('rejects wrong-kind and invalid anchor messages', () => {
    const adapter = new TrailerCommitMessageCodecAdapter();
    const patch = currentPatchMessage();
    const anchor = encodeAnchorMessage({ graph: 'events' });

    expect(() => adapter.decodePatch(anchor)).toThrow("must be 'patch'");
    expect(() => adapter.decodeAnchor(patch)).toThrow("must be 'anchor'");
    expect(() => adapter.decodeAnchor(
      replaceTrailer(anchor, TRAILER_KEYS.graph, '../events'),
    )).toThrow(/graph/i);
  });

  it('returns null when kind detection cannot decode the input', () => {
    const adapter = new TrailerCommitMessageCodecAdapter();

    expect(adapter.detectKind(null as unknown as string)).toBeNull();
  });
});

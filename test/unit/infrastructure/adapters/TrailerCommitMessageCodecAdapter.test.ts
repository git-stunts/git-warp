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
  LEGACY_GIT_BLOB_PATCH_STORAGE,
  createGitCasPatchStorage,
  createLegacyGitCasPatchStorage,
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

function legacyPatchMessage(): string {
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
    expect(encoded).not.toContain(`${TRAILER_KEYS.patchOid}:`);
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

  it('round-trips the explicit legacy git-cas compatibility route', () => {
    const adapter = new TrailerCommitMessageCodecAdapter();
    const encoded = adapter.encodePatch({
      kind: 'patch',
      graph: 'events',
      writer: 'alice',
      lamport: 1,
      patchHandle: new AssetHandle(OID),
      schema: 2,
      storage: createLegacyGitCasPatchStorage({ encrypted: true }),
    });

    expect(adapter.decodePatch(encoded)).toMatchObject({
      storage: {
        strategy: 'legacy-git-cas',
        encrypted: true,
      },
    });
  });

  it('rejects partial and unknown git-cas storage trailer pairs', () => {
    const adapter = new TrailerCommitMessageCodecAdapter();
    const partial = appendTrailer(
      legacyPatchMessage(),
      TRAILER_KEYS.storageVersion,
      'git-cas-asset-v1',
    );
    const unknown = appendTrailer(
      appendTrailer(
        legacyPatchMessage(),
        TRAILER_KEYS.storageVersion,
        'unknown-storage',
      ),
      TRAILER_KEYS.storageSchema,
      'unknown-schema',
    );

    expect(() => adapter.decodePatch(partial)).toThrow(/must be present together/);
    expect(() => adapter.decodePatch(unknown)).toThrow(/invalid git-cas patch storage trailers/);
  });

  it('keeps the legacy helper from accepting opaque asset handles', () => {
    expect(() => encodePatchMessage({
      graph: 'events',
      writer: 'alice',
      lamport: 1,
      patchOid: OID,
      storage: createGitCasPatchStorage({ encrypted: false }),
    })).toThrow(/cannot encode asset handles/);
  });

  it('preserves encrypted legacy external-storage compatibility', () => {
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
      storage: { strategy: 'legacy-external-storage' },
    });
    expect(canonical).not.toHaveProperty('patchOid');
    expect(canonical.patchHandle.toString()).toBe(OID);
  });
});

describe('TrailerCommitMessageCodecAdapter validation', () => {
  it('rejects malformed patch scalar trailers', () => {
    const adapter = new TrailerCommitMessageCodecAdapter();
    const encoded = legacyPatchMessage();

    expect(() => adapter.decodePatch(
      replaceTrailer(encoded, TRAILER_KEYS.lamport, '0'),
    )).toThrow(/positive integer/);
    expect(() => adapter.decodePatch(
      replaceTrailer(encoded, TRAILER_KEYS.patchOid, 'not-an-oid'),
    )).toThrow(/patchOid/);
    expect(() => adapter.decodePatch(
      replaceTrailer(encoded, TRAILER_KEYS.graph, '../events'),
    )).toThrow(/graph/i);
  });

  it('rejects malformed checkpoint hashes and graph names', () => {
    const adapter = new TrailerCommitMessageCodecAdapter();
    const encoded = encodeCheckpointMessage({
      graph: 'events',
      stateHash: STATE_HASH,
      frontierOid: OID,
      indexOid: OID,
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
      patchHandle: new AssetHandle(OID),
      schema: 2,
      storage: LEGACY_GIT_BLOB_PATCH_STORAGE,
    })).toThrow(/graph/i);
    expect(() => adapter.encodeAnchor({
      kind: 'anchor',
      graph: '../events',
      schema: 2,
    })).toThrow(/graph/i);
  });

  it('rejects wrong-kind and invalid anchor messages', () => {
    const adapter = new TrailerCommitMessageCodecAdapter();
    const patch = legacyPatchMessage();
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

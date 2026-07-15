import { describe, expect, it } from 'vitest';
import AssetHandle from '../../../../src/domain/storage/AssetHandle.ts';
import BundleHandle from '../../../../src/domain/storage/BundleHandle.ts';
import {
  CHECKPOINT_STORAGE_FORMAT,
  createGitCasPatchStorage,
} from '../../../../src/ports/CommitMessageCodecPort.ts';
import {
  TrailerCommitMessageCodecAdapter,
  decodePatchMessage,
  detectMessageKind,
  encodePatchMessage,
} from '../../../../src/infrastructure/adapters/TrailerCommitMessageCodecAdapter.ts';

const LEGACY_OID = 'a'.repeat(40);
const STATE_HASH = 'b'.repeat(64);

describe('TrailerCommitMessageCodecAdapter', () => {
  const codec = new TrailerCommitMessageCodecAdapter();

  it('round-trips current git-cas patch asset locators', () => {
    const encoded = codec.encodePatch({
      kind: 'patch',
      graph: 'events',
      writer: 'writer-1',
      lamport: 42,
      schema: 3,
      patchHandle: new AssetHandle('git-cas:asset:patch-42'),
      storage: createGitCasPatchStorage({ encrypted: false }),
    });
    const decoded = codec.decodePatch(encoded);

    expect(encoded).toContain('eg-patch-handle: git-cas:asset:patch-42');
    expect(encoded).toContain('eg-storage-version: v19');
    expect(encoded).toContain('eg-storage-schema: git-cas-asset-patch-v1');
    expect(decoded).toMatchObject({
      kind: 'patch',
      graph: 'events',
      writer: 'writer-1',
      lamport: 42,
      schema: 3,
      storage: { strategy: 'git-cas-asset', encrypted: false },
    });
    expect(decoded.patchHandle.toString()).toBe('git-cas:asset:patch-42');
  });

  it('records current encrypted asset routes without exposing keys', () => {
    const encoded = codec.encodePatch({
      kind: 'patch',
      graph: 'events',
      writer: 'writer-1',
      lamport: 1,
      schema: 2,
      patchHandle: new AssetHandle('git-cas:asset:encrypted'),
      storage: createGitCasPatchStorage({ encrypted: true }),
    });

    expect(encoded).toContain('eg-encrypted: true');
    expect(codec.decodePatch(encoded).storage).toMatchObject({
      strategy: 'git-cas-asset',
      encrypted: true,
    });
    expect(encoded).not.toMatch(/key|passphrase/iu);
  });

  it('continues to decode supported legacy patch OID messages', () => {
    const encoded = encodePatchMessage({
      graph: 'legacy-events',
      writer: 'writer-1',
      lamport: 1,
      patchOid: LEGACY_OID,
      schema: 2,
    });
    const decoded = decodePatchMessage(encoded);

    expect(decoded.patchHandle.toString()).toBe(LEGACY_OID);
    expect(decoded.storage.strategy).toBe('legacy-git-blob');
    expect(decoded.encrypted).toBe(false);
  });

  it('classifies encrypted legacy locators as external storage', () => {
    const decoded = decodePatchMessage(encodePatchMessage({
      graph: 'legacy-events',
      writer: 'writer-1',
      lamport: 1,
      patchOid: LEGACY_OID,
      encrypted: true,
    }));

    expect(decoded.storage).toMatchObject({
      strategy: 'legacy-external-storage',
      encrypted: true,
    });
  });

  it('round-trips storage-neutral checkpoint publication metadata', () => {
    const encoded = codec.encodeCheckpoint({
      kind: 'checkpoint',
      graph: 'events',
      stateHash: STATE_HASH,
      schema: 5,
      checkpointVersion: CHECKPOINT_STORAGE_FORMAT,
      bundleHandle: new BundleHandle('bundle:checkpoint'),
    });
    const decoded = codec.decodeCheckpoint(encoded);

    expect(encoded).toContain('eg-checkpoint: v19');
    expect(encoded).toContain('eg-checkpoint-handle: bundle:checkpoint');
    expect(encoded).not.toContain('frontier-oid');
    expect(encoded).not.toContain('index-oid');
    expect(decoded).toEqual({
      kind: 'checkpoint',
      graph: 'events',
      stateHash: STATE_HASH,
      schema: 5,
      checkpointVersion: 'v19',
      bundleHandle: new BundleHandle('bundle:checkpoint'),
    });
  });

  it('rejects contradictory checkpoint storage metadata on encode', () => {
    expect(() => codec.encodeCheckpoint({
      kind: 'checkpoint',
      graph: 'events',
      stateHash: STATE_HASH,
      schema: 5,
      checkpointVersion: CHECKPOINT_STORAGE_FORMAT,
      bundleHandle: null,
    })).toThrow(/requires a bundle handle/u);

    expect(() => codec.encodeCheckpoint({
      kind: 'checkpoint',
      graph: 'events',
      stateHash: STATE_HASH,
      schema: 5,
      checkpointVersion: 'v5',
      bundleHandle: new BundleHandle('bundle:checkpoint'),
    })).toThrow(/current storage version/u);
  });

  it('round-trips anchors', () => {
    const encoded = codec.encodeAnchor({ kind: 'anchor', graph: 'events', schema: 5 });
    expect(codec.decodeAnchor(encoded)).toEqual({
      kind: 'anchor',
      graph: 'events',
      schema: 5,
    });
  });

  it.each([
    ['patch', codec.encodePatch({
      kind: 'patch',
      graph: 'events',
      writer: 'writer-1',
      lamport: 1,
      schema: 2,
      patchHandle: new AssetHandle('asset:patch'),
      storage: createGitCasPatchStorage({ encrypted: false }),
    })],
    ['checkpoint', codec.encodeCheckpoint({
      kind: 'checkpoint',
      graph: 'events',
      stateHash: STATE_HASH,
      schema: 5,
      checkpointVersion: 'v5',
      bundleHandle: null,
    })],
    ['anchor', codec.encodeAnchor({ kind: 'anchor', graph: 'events', schema: 5 })],
  ] as const)('detects %s messages', (kind, message) => {
    expect(codec.detectKind(message)).toBe(kind);
    expect(detectMessageKind(message)).toBe(kind);
  });

  it('returns null for non-WARP messages', () => {
    expect(codec.detectKind('ordinary commit')).toBeNull();
  });

  it('rejects malformed graph, writer, lamport, hash, and handles', () => {
    expect(() => codec.encodePatch({
      kind: 'patch',
      graph: '../events',
      writer: 'writer-1',
      lamport: 1,
      schema: 2,
      patchHandle: new AssetHandle('asset:patch'),
      storage: createGitCasPatchStorage({ encrypted: false }),
    })).toThrow(/path traversal/u);
    expect(() => codec.encodePatch({
      kind: 'patch',
      graph: 'events',
      writer: 'writer/1',
      lamport: 1,
      schema: 2,
      patchHandle: new AssetHandle('asset:patch'),
      storage: createGitCasPatchStorage({ encrypted: false }),
    })).toThrow(/forward slash/u);
    expect(() => encodePatchMessage({
      graph: 'events',
      writer: 'writer-1',
      lamport: 0,
      patchOid: LEGACY_OID,
    })).toThrow(/positive integer/u);
    expect(() => codec.encodeCheckpoint({
      kind: 'checkpoint',
      graph: 'events',
      stateHash: 'short',
      schema: 5,
      checkpointVersion: 'v5',
      bundleHandle: null,
    })).toThrow(/64 character hex string/u);
  });

  it('rejects locator/type mismatches and missing required trailers', () => {
    expect(() => codec.decodePatch('warp:patch\n\neg-kind: patch\n'))
      .toThrow(/missing required trailer/u);
    expect(() => codec.decodeCheckpoint(codec.encodeAnchor({
      kind: 'anchor',
      graph: 'events',
      schema: 5,
    }))).toThrow(/must be 'checkpoint'/u);
  });
});

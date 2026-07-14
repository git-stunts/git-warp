import { describe, expect, it } from 'vitest';

import { parseGitCasStateCacheIndex } from '../../../../src/infrastructure/adapters/GitCasStateCacheIndexCodec.ts';

const SNAPSHOT_ID = 'snap-12345';

function indexBuffer(entry: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify({
    schemaVersion: 1,
    snapshots: { [SNAPSHOT_ID]: entry },
  }));
}

function cacheEntry(overrides: Record<string, unknown> = {}) {
  return {
    snapshotId: SNAPSHOT_ID,
    coordinate: { frontier: { w1: 'a'.repeat(40) }, ceiling: 10 },
    retention: 'evictable',
    provenancePosture: 'full',
    stateHash: 'hash-1',
    payloadRef: 'tree-1',
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('GitCasStateCacheIndexCodec', () => {
  it('accepts a fully validated persisted snapshot entry', () => {
    const parsed = parseGitCasStateCacheIndex(indexBuffer(cacheEntry({
      lastAccessedAt: new Date().toISOString(),
      indexTreeOid: 'index-tree-1',
    })));

    expect(parsed.snapshots[SNAPSHOT_ID]).toMatchObject({
      snapshotId: SNAPSHOT_ID,
      retention: 'evictable',
      provenancePosture: 'full',
    });
  });

  it.each([
    ['entry', null, /entry must be an object/],
    ['snapshotId type', cacheEntry({ snapshotId: 42 }), /snapshotId must be a non-empty string/],
    ['snapshotId key', cacheEntry({ snapshotId: 'different' }), /snapshotId must match its map key/],
    ['coordinate', cacheEntry({ coordinate: null }), /coordinate must be an object/],
    [
      'frontier',
      cacheEntry({ coordinate: { frontier: [], ceiling: 10 } }),
      /coordinate\.frontier must be an object/,
    ],
    [
      'frontier writer',
      cacheEntry({ coordinate: { frontier: { '': 'tip' }, ceiling: 10 } }),
      /writer ids must be non-empty/,
    ],
    [
      'frontier tip',
      cacheEntry({ coordinate: { frontier: { w1: 42 }, ceiling: 10 } }),
      /coordinate\.frontier\.w1 must be a non-empty string/,
    ],
    [
      'ceiling',
      cacheEntry({ coordinate: { frontier: {}, ceiling: -1 } }),
      /coordinate\.ceiling must be null or a non-negative safe integer/,
    ],
    ['retention', cacheEntry({ retention: 'forever' }), /retention must be evictable or pinned/],
    [
      'provenance',
      cacheEntry({ provenancePosture: 'complete' }),
      /provenancePosture must be full or degraded/,
    ],
    ['stateHash', cacheEntry({ stateHash: '' }), /stateHash must be a non-empty string/],
    ['payloadRef', cacheEntry({ payloadRef: null }), /payloadRef must be a non-empty string/],
    ['createdAt', cacheEntry({ createdAt: 'yesterday' }), /createdAt must be a valid timestamp/],
    [
      'lastAccessedAt',
      cacheEntry({ lastAccessedAt: 42 }),
      /lastAccessedAt must be a non-empty string/,
    ],
    [
      'indexTreeOid',
      cacheEntry({ indexTreeOid: '' }),
      /indexTreeOid must be a non-empty string/,
    ],
  ])('rejects malformed persisted snapshot %s', (_name, entry, expectedError) => {
    expect(() => parseGitCasStateCacheIndex(indexBuffer(entry))).toThrow(expectedError);
  });
});

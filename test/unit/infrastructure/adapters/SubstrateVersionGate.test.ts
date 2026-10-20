import { describe, expect, it } from 'vitest';

import WarpError from '../../../../src/domain/errors/WarpError.ts';
import { textEncode } from '../../../../src/domain/utils/bytes.ts';
import SubstrateVersionGate, {
  CURRENT_SUBSTRATE_MARKER,
} from '../../../../src/infrastructure/adapters/SubstrateVersionGate.ts';
import {
  DEFAULT_COMMIT_MESSAGE_CODEC,
  encodePatchMessage,
} from '../../../../src/infrastructure/adapters/TrailerCommitMessageCodecAdapter.ts';

const MARKER_REF = 'refs/warp/events/substrate-version';
const MARKER_OID = '1111111111111111111111111111111111111111';
const HEAD_OID = '2222222222222222222222222222222222222222';
const CURRENT_PATCH_MESSAGE = encodePatchMessage({
  graph: 'events', writer: 'alice', lamport: 1, patchOid: '3'.repeat(40), schema: 2,
});
/** A v18 patch commit: the patch blob is named by OID, with no git-cas storage trailers. */
const V18_PATCH_MESSAGE = 'warp:patch\n\neg-kind: patch\neg-graph: events\neg-writer: alice\n'
  + `eg-lamport: 1\neg-schema: 2\neg-patch-oid: ${'3'.repeat(40)}\n`;

class MemorySubstrateHistory {
  readonly blobs = new Map<string, Uint8Array>();
  readonly messages = new Map<string, string>();
  readonly objectTypes = new Map<string, string>();
  readonly refs = new Map<string, string>();
  listFailures = 0;
  writes = 0;

  async compareAndSwapRef(
    ref: string,
    newOid: string,
    expectedOid: string | null,
  ): Promise<void> {
    const current = this.refs.get(ref) ?? null;
    if (current !== expectedOid) {
      throw new Error(`ref changed: ${ref}`);
    }
    this.refs.set(ref, newOid);
  }

  listRefs(prefix: string, options?: { readonly limit?: number }): Promise<string[]> {
    if (this.listFailures > 0) {
      this.listFailures -= 1;
      return Promise.reject(new Error('transient ref listing failure'));
    }
    const refs = [...this.refs.keys()].filter((ref) => ref.startsWith(prefix)).sort();
    return Promise.resolve(
      options?.limit === undefined ? refs : refs.slice(0, options.limit),
    );
  }

  readBlob(oid: string): Promise<Uint8Array> {
    const blob = this.blobs.get(oid);
    if (blob === undefined) {
      return Promise.reject(new Error(`missing blob: ${oid}`));
    }
    return Promise.resolve(blob);
  }

  readObjectType(oid: string): Promise<string> {
    return Promise.resolve(this.objectTypes.get(oid) ?? 'missing');
  }

  showNode(sha: string): Promise<string> {
    const message = this.messages.get(sha);
    return message === undefined ? Promise.reject(new Error(`missing commit: ${sha}`)) : Promise.resolve(message);
  }

  readRef(ref: string): Promise<string | null> {
    return Promise.resolve(this.refs.get(ref) ?? null);
  }

  writeBlob(content: Uint8Array | string): Promise<string> {
    this.writes += 1;
    const bytes = typeof content === 'string' ? textEncode(content) : content;
    this.blobs.set(MARKER_OID, bytes);
    this.objectTypes.set(MARKER_OID, 'blob');
    return Promise.resolve(MARKER_OID);
  }
}

describe('SubstrateVersionGate', () => {
  it('initializes the v19 marker only for an empty timeline', async () => {
    const history = new MemorySubstrateHistory();
    const gate = new SubstrateVersionGate(history);

    await Promise.all([gate.ensure('events', DEFAULT_COMMIT_MESSAGE_CODEC), gate.ensure('events', DEFAULT_COMMIT_MESSAGE_CODEC)]);

    expect(history.refs.get(MARKER_REF)).toBe(MARKER_OID);
    expect(history.writes).toBe(1);
    expect(history.blobs.get(MARKER_OID)).toEqual(textEncode(CURRENT_SUBSTRATE_MARKER));
  });

  it('requires migration for unmarked v18 writer chains before writing a marker', async () => {
    const history = new MemorySubstrateHistory();
    history.refs.set('refs/warp/events/writers/alice', HEAD_OID);
    history.messages.set(HEAD_OID, V18_PATCH_MESSAGE);
    const gate = new SubstrateVersionGate(history);

    const error = await gate.ensure('events', DEFAULT_COMMIT_MESSAGE_CODEC).catch((cause: unknown) => cause);

    expect(error).toBeInstanceOf(WarpError);
    if (error instanceof WarpError) {
      expect(error.code).toBe('E_SUBSTRATE_MIGRATION_REQUIRED');
      expect(error.message).toContain('git-warp-v18-to-v19');
    }
    expect(history.refs.has(MARKER_REF)).toBe(false);
    expect(history.writes).toBe(0);
  });

  it.each([
    ['current writer chains', (history: MemorySubstrateHistory) => {
      history.refs.set('refs/warp/events/writers/alice', HEAD_OID);
      history.messages.set(HEAD_OID, CURRENT_PATCH_MESSAGE);
    }, 'current-patch-commits'],
    ['refs without a writer patch', (history: MemorySubstrateHistory) => {
      history.refs.set('refs/warp/events/checkpoints/head', HEAD_OID);
    }, 'no-writer-patches'],
  ] as const)('reports a missing marker, not a migration, for %s', async (_case, seed, evidence) => {
    const history = new MemorySubstrateHistory();
    seed(history);
    const gate = new SubstrateVersionGate(history);

    const error = await gate.ensure('events', DEFAULT_COMMIT_MESSAGE_CODEC).catch((cause: unknown) => cause);

    expect(error).toBeInstanceOf(WarpError);
    if (error instanceof WarpError) {
      expect(error.code).toBe('E_SUBSTRATE_MARKER_MISSING');
      expect(error.message).toContain(MARKER_REF);
      expect(error.message).not.toContain('git-warp-v18-to-v19');
      expect(error.context).toMatchObject({ graphName: 'events', markerRef: MARKER_REF, evidence });
    }
    expect(history.refs.has(MARKER_REF)).toBe(false);
    expect(history.writes).toBe(0);
  });

  it('rejects a marker whose bytes are not the exact v19 marker', async () => {
    const history = new MemorySubstrateHistory();
    history.refs.set(MARKER_REF, MARKER_OID);
    history.blobs.set(MARKER_OID, textEncode('version: 18\n'));
    history.objectTypes.set(MARKER_OID, 'blob');
    const gate = new SubstrateVersionGate(history);

    const error = await gate.ensure('events', DEFAULT_COMMIT_MESSAGE_CODEC).catch((cause: unknown) => cause);

    expect(error).toBeInstanceOf(WarpError);
    if (error instanceof WarpError) {
      expect(error.code).toBe('E_SUBSTRATE_VERSION_UNSUPPORTED');
    }
  });

  it('retries a transient failure without discarding successful caching', async () => {
    const history = new MemorySubstrateHistory();
    history.listFailures = 1;
    const gate = new SubstrateVersionGate(history);

    await expect(gate.ensure('events', DEFAULT_COMMIT_MESSAGE_CODEC)).rejects.toThrow('transient ref listing failure');
    await expect(gate.ensure('events', DEFAULT_COMMIT_MESSAGE_CODEC)).resolves.toBeUndefined();
    await expect(gate.ensure('events', DEFAULT_COMMIT_MESSAGE_CODEC)).resolves.toBeUndefined();

    expect(history.writes).toBe(1);
  });
});

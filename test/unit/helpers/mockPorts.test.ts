import { describe, expect, it } from 'vitest';

import type CodecValue from '../../../src/domain/types/codec/CodecValue.ts';
import { createMockCodec, createMockPersistence } from '../../helpers/mockPorts.ts';

type CodecRecord = { readonly [key: string]: CodecValue };

function isCodecRecord(value: CodecValue): value is CodecRecord {
  return (
    typeof value === 'object'
    && value !== null
    && !Array.isArray(value)
    && !(value instanceof Uint8Array)
    && !(value instanceof Date)
  );
}

function bytesFromDecodedPayload(value: CodecValue): Uint8Array {
  if (isCodecRecord(value)) {
    const bytes = value['bytes'];
    if (bytes instanceof Uint8Array) {
      return bytes;
    }
  }
  throw new Error('expected decoded payload bytes');
}

describe('mockPorts createMockPersistence', () => {
  it('rejects compareAndSwapRef when expected oid does not match current ref', async () => {
    const persistence = createMockPersistence();
    const ref = 'refs/warp/test/writers/alice';
    const currentOid = 'a'.repeat(40);
    const nextOid = 'b'.repeat(40);

    await persistence.updateRef(ref, currentOid);

    await expect(persistence.compareAndSwapRef(ref, nextOid, null)).rejects.toThrow('CAS mismatch');
    await expect(persistence.readRef(ref)).resolves.toBe(currentOid);
  });

  it('types readTreeOids as a tree object id to object-map contract', async () => {
    const persistence = createMockPersistence();
    const readTreeOids: (treeOid: string) => Promise<Record<string, string>> =
      persistence.readTreeOids;

    const treeOids = await readTreeOids('tree-oid');

    expect(treeOids).toEqual({});
    expect(Array.isArray(treeOids)).toBe(false);
  });
});

describe('mockPorts createMockCodec', () => {
  it('wraps the structured codec boundary instead of JSON stringifying values', () => {
    const codec = createMockCodec();
    const payload = { bytes: new Uint8Array([1, 2, 3]) };

    const encoded = codec.encode(payload);
    const decodedBytes = bytesFromDecodedPayload(codec.decode(encoded));

    expect(codec.encode).toHaveBeenCalledWith(payload);
    expect(decodedBytes).toBeInstanceOf(Uint8Array);
    expect([...decodedBytes]).toEqual([1, 2, 3]);
  });
});

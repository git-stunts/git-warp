import { describe, expect, it } from 'vitest';

import {
  createBTR,
  NodeCryptoAdapter,
  ProvenancePayload,
  verifyBTR,
} from '../../legacy.ts';
import BtrCodecAdapter from '../../src/infrastructure/adapters/BtrCodecAdapter.ts';
import BtrSigningBytes from '../../src/domain/services/provenance/BtrSigningBytes.ts';
import type BtrSigningEnvelope from '../../src/domain/services/provenance/BtrSigningEnvelope.ts';
import CryptoPort from '../../src/ports/CryptoPort.ts';
import { createEmptyState, createSamplePatches } from '../helpers/warpGraphTestUtils.ts';

const key = 'btr-signing-bytes-ownership-test-key';
const timestamp = '2026-04-14T00:00:00.000Z';
const btrCodec = new BtrCodecAdapter();
const crypto = new NodeCryptoAdapter();

class CapturingCryptoPort extends CryptoPort {
  readonly #delegate = new NodeCryptoAdapter();
  readonly #hmacInputs: Uint8Array[] = [];

  hmacInputs(): readonly Uint8Array[] {
    return this.#hmacInputs.map((bytes) => new Uint8Array(bytes));
  }

  override async hash(algorithm: string, data: string | Uint8Array): Promise<string> {
    return await this.#delegate.hash(algorithm, data);
  }

  override async hmac(
    algorithm: string,
    hmacKey: string | Uint8Array,
    data: string | Uint8Array,
  ): Promise<Uint8Array> {
    this.#hmacInputs.push(copyData(data));
    return await this.#delegate.hmac(algorithm, hmacKey, data);
  }

  override timingSafeEqual(left: Uint8Array, right: Uint8Array): boolean {
    return this.#delegate.timingSafeEqual(left, right);
  }
}

class AlteredSigningBytesCodec extends BtrCodecAdapter {
  override signingBytes(envelope: BtrSigningEnvelope): BtrSigningBytes {
    return BtrSigningBytes.fromCanonicalBtrSigningEncoder(
      appendZero(super.signingBytes(envelope).copyBytes()),
    );
  }
}

function samplePayload(): ProvenancePayload {
  const { patchA, patchB } = createSamplePatches();
  return new ProvenancePayload([patchA, patchB]);
}

function copyData(data: string | Uint8Array): Uint8Array {
  if (typeof data === 'string') {
    return new TextEncoder().encode(data);
  }
  return new Uint8Array(data);
}

function appendZero(bytes: Uint8Array): Uint8Array {
  const altered = new Uint8Array(bytes.byteLength + 1);
  altered.set(bytes);
  altered[bytes.byteLength] = 0;
  return altered;
}

function firstByte(bytes: Uint8Array): number {
  const byte = bytes[0];
  if (byte === undefined) {
    throw new Error('Expected non-empty signing bytes');
  }
  return byte;
}

function runtimeSigningBytesConstructor(): Function {
  const sample = BtrSigningBytes.fromCanonicalBtrSigningEncoder(new Uint8Array([1]));
  const prototype = Reflect.getPrototypeOf(sample);
  if (prototype === null || typeof prototype.constructor !== 'function') {
    throw new Error('Missing BtrSigningBytes runtime constructor');
  }
  return prototype.constructor;
}

describe('BTR signing-byte ownership behavior', () => {
  it('returns runtime-backed BtrSigningBytes from the BTR codec port', async () => {
    const record = await createBTR(createEmptyState(), samplePayload(), {
      key,
      timestamp,
      crypto,
      btrCodec,
    });
    const signingBytes = btrCodec.signingBytes(record.envelope);

    expect(signingBytes).toBeInstanceOf(BtrSigningBytes);
    expect(signingBytes.copyBytes().byteLength).toBeGreaterThan(0);
  });

  it('defensively copies canonical signing bytes', async () => {
    const record = await createBTR(createEmptyState(), samplePayload(), {
      key,
      timestamp,
      crypto,
      btrCodec,
    });
    const signingBytes = btrCodec.signingBytes(record.envelope);
    const exposed = signingBytes.copyBytes();
    const originalFirstByte = firstByte(exposed);

    exposed[0] = originalFirstByte ^ 0xff;

    expect(firstByte(signingBytes.copyBytes())).toBe(originalFirstByte);
  });

  it('feeds the HMAC consumer with canonical BtrSigningBytes from the codec port', async () => {
    const capturingCrypto = new CapturingCryptoPort();
    const record = await createBTR(createEmptyState(), samplePayload(), {
      key,
      timestamp,
      crypto: capturingCrypto,
      btrCodec,
    });
    const hmacInputs = capturingCrypto.hmacInputs();
    const hmacInput = hmacInputs[0];
    if (hmacInput === undefined) {
      throw new Error('Expected createBTR to call CryptoPort.hmac');
    }

    expect(hmacInputs).toHaveLength(1);
    expect(hmacInput).toEqual(btrCodec.signingBytes(record.envelope).copyBytes());
  });

  it('rejects verification when the codec port returns different signing bytes', async () => {
    const record = await createBTR(createEmptyState(), samplePayload(), {
      key,
      timestamp,
      crypto,
      btrCodec,
    });
    const verification = await verifyBTR(record, key, {
      crypto,
      btrCodec: new AlteredSigningBytesCodec(),
    });

    expect(verification.valid).toBe(false);
    expect(verification.reason).toBe('Authentication tag mismatch');
  });

  it('rejects raw runtime construction outside the canonical encoder path', () => {
    expect(() => Reflect.construct(
      runtimeSigningBytesConstructor(),
      [new Uint8Array([1]), Symbol('raw-signing-bytes')],
    )).toThrow('BtrSigningBytes must be created by the canonical BTR signing encoder');
  });
});

import { describe, expect, it, vi } from 'vitest';
import assetByteLength from '../../../src/domain/storage/assetByteLength.ts';

describe('native asset byte length', () => {
  it('uses the actual view length and never invokes a caller-owned getter', () => {
    const bytes = new Uint8Array(new ArrayBuffer(8), 2, 3);
    Object.defineProperty(bytes, 'byteLength', { get: () => { throw new Error('untrusted getter'); } });
    expect(assetByteLength(bytes)).toBe(3);
    expect(assetByteLength(new Uint8Array())).toBe(0);
  });

  it.each([undefined, { value: 0 }])('refuses a missing platform accessor', async (descriptor) => {
    const read = await withPlatformDescriptor(descriptor);
    expect(() => read(new Uint8Array(1)))
      .toThrow(expect.objectContaining({ code: 'E_ASSET_BYTE_LENGTH' }));
  });

  it.each(['invalid', 0.5, -1])('refuses an invalid platform result %s', async (value) => {
    const read = await withPlatformDescriptor({ get: () => value });
    expect(() => read(new Uint8Array(1)))
      .toThrow(expect.objectContaining({ code: 'E_ASSET_BYTE_LENGTH' }));
  });
});

/** Fault injection tests platform validation, not a claim about normal native getters. */
async function withPlatformDescriptor(descriptor: PropertyDescriptor | undefined) {
  const original = Object.getOwnPropertyDescriptor;
  vi.resetModules();
  const spy = vi.spyOn(Object, 'getOwnPropertyDescriptor').mockImplementation((target, key) =>
    key === 'byteLength' ? descriptor : original(target, key));
  try {
    return (await import('../../../src/domain/storage/assetByteLength.ts')).default;
  } finally {
    spy.mockRestore();
  }
}

import { expect, it } from 'vitest';
import AssetStreamConsumption from '../../../src/domain/storage/AssetStreamConsumption.ts';

it('is demand-driven and refuses partial consumption as a complete receipt', async () => {
  let pulled = 0;
  let closed = false;
  async function* source() {
    try { pulled += 1; yield new Uint8Array([1]); pulled += 1; yield new Uint8Array([2]); }
    finally { closed = true; }
  }
  const consumption = new AssetStreamConsumption(2);
  const stream = consumption.stream(source());
  expect(pulled).toBe(0);
  for await (const chunk of stream) { expect(chunk.byteLength).toBe(1); break; }
  expect(pulled).toBe(1);
  expect(closed).toBe(true);
  expect(() => consumption.size).toThrow(expect.objectContaining({ code: 'E_ASSET_INPUT_INCOMPLETE' }));
  await expect(consumption.stream(source())[Symbol.asyncIterator]().next()).rejects.toMatchObject({ code: 'E_ASSET_INPUT_REUSED' });
});

it('counts an undeclared empty stream and verifies the storage receipt', async () => {
  async function* source() { yield new Uint8Array(); }
  const consumption = new AssetStreamConsumption(null);
  for await (const chunk of consumption.stream(source())) expect(chunk.byteLength).toBe(0);
  expect(consumption.size).toBe(0);
  consumption.verifyPlaintextReceipt(0);
  expect(() => consumption.verifyPlaintextReceipt(1)).toThrow(expect.objectContaining({ code: 'E_ASSET_SIZE_MISMATCH' }));
});

it('ignores a forged huge size when counting the actual one-byte stream', async () => {
  // Forged metadata is not evidence of an actual huge allocation or byte count.
  const lyingChunk = new Uint8Array();
  Object.defineProperty(lyingChunk, 'byteLength', { value: Number.MAX_SAFE_INTEGER });
  async function* source() { yield lyingChunk; yield new Uint8Array([1]); }
  const consumption = new AssetStreamConsumption(undefined);
  for await (const chunk of consumption.stream(source())) expect(chunk).toBeInstanceOf(Uint8Array);
  expect(consumption.size).toBe(1);
});

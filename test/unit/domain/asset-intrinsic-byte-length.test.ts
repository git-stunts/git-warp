import { expect, it } from 'vitest';
import AssetStreamConsumption from '../../../src/domain/storage/AssetStreamConsumption.ts';
import AssetSizeExpectation from '../../../src/domain/storage/AssetSizeExpectation.ts';
import BoundedByteCollector from '../../../src/domain/storage/BoundedByteCollector.ts';
import { byteSizeOfContent } from '../../../src/domain/services/PatchBuilderValidation.ts';
import { requirePatchPropertyValue } from '../../../src/domain/services/PatchBuilderContent.ts';
it('refuses oversized typed arrays even when their byteLength property is shadowed', () => {
  const bytes = new Uint8Array(64 * 1024 + 1);
  Object.defineProperty(bytes, 'byteLength', { value: 1 });
  expect(() => requirePatchPropertyValue(bytes))
    .toThrow(expect.objectContaining({ code: 'E_INLINE_BINARY_LIMIT' }));
});

function shadowedBytes() {
  const bytes = new Uint8Array([1, 2, 3]);
  Object.defineProperty(bytes, 'byteLength', { value: 1 });
  return bytes;
}

async function* chunks(): AsyncIterable<Uint8Array> { yield shadowedBytes(); }

it('counts actual plaintext bytes rather than a shadowed size', async () => {
  const consumption = new AssetStreamConsumption(null);
  for await (const chunk of consumption.stream(chunks())) expect(chunk).toBeInstanceOf(Uint8Array);
  expect(consumption.size).toBe(3);
});

it('rejects actual overflow before forwarding a chunk', async () => {
  const stream = new AssetSizeExpectation(1).stream(chunks());
  await expect(stream[Symbol.asyncIterator]().next()).rejects.toMatchObject({ code: 'E_ASSET_SIZE_MISMATCH' });
});

it('does not silently truncate collected bytes when a chunk shadows its size', async () => {
  expect(await new BoundedByteCollector(100).collect(chunks())).toEqual(new Uint8Array([1, 2, 3]));
});

it('derives direct attachment metadata from the native byte count', () => {
  expect(byteSizeOfContent(shadowedBytes())).toBe(3);
});

it.each([-1, 0.5, Number.MAX_SAFE_INTEGER + 1])('refuses invalid declared counts %s', (bytes) => {
  expect(() => new AssetSizeExpectation(bytes))
    .toThrow(expect.objectContaining({ code: 'E_ASSET_SIZE_INVALID' }));
});

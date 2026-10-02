import { describe, expect, it } from 'vitest';
import AssetByteCount from '../../../src/domain/storage/AssetByteCount.ts';

describe('AssetByteCount', () => {
  it('accumulates exact safe counts and refuses overflow without changing state', () => {
    const count = new AssetByteCount();
    expect(count.value).toBe(0);
    count.add(1);
    count.add(Number.MAX_SAFE_INTEGER - 1);
    expect(count.value).toBe(Number.MAX_SAFE_INTEGER);
    expect(() => count.add(1)).toThrow(expect.objectContaining({ code: 'E_ASSET_SIZE_INVALID' }));
    expect(count.value).toBe(Number.MAX_SAFE_INTEGER);
  });

  it.each([-1, 0.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])(
    'refuses invalid additions %s without changing state', (bytes) => {
      const count = new AssetByteCount();
      count.add(3);
      expect(() => count.add(bytes)).toThrow(expect.objectContaining({ code: 'E_ASSET_SIZE_INVALID' }));
      expect(count.value).toBe(3);
    },
  );
});

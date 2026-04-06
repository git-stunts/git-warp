import { describe, it, expect } from 'vitest';

describe('WarpOptions', () => {
  it('loads as a type-only module with no runtime exports', async () => {
    const mod = await import('../../../../src/domain/types/WarpOptions.js');
    expect(Object.keys(mod)).toEqual([]);
  });
});

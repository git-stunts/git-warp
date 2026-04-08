import { describe, it, expect } from 'vitest';

describe('WarpPersistence', () => {
  it('loads as a type-only module with no runtime exports', async () => {
    const mod = await import('../../../../src/domain/types/WarpPersistence.ts');
    expect(Object.keys(mod)).toEqual([]);
  });
});

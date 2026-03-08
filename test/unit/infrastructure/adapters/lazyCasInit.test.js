import { describe, it, expect, vi } from 'vitest';
import { createLazyCas } from '../../../../src/infrastructure/adapters/lazyCasInit.js';

describe('createLazyCas', () => {
  it('caches a resolved promise across multiple calls', async () => {
    const factory = vi.fn().mockResolvedValue('cas-instance');
    const getCas = createLazyCas(factory);

    const a = await getCas();
    const b = await getCas();

    expect(a).toBe('cas-instance');
    expect(b).toBe('cas-instance');
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it('resets on rejection so subsequent calls retry', async () => {
    const factory = vi.fn()
      .mockRejectedValueOnce(new Error('init failed'))
      .mockResolvedValueOnce('recovered');

    const getCas = createLazyCas(factory);

    await expect(getCas()).rejects.toThrow('init failed');
    const result = await getCas();

    expect(result).toBe('recovered');
    expect(factory).toHaveBeenCalledTimes(2);
  });

  it('returns the same promise for concurrent callers', async () => {
    let resolveInit;
    const factory = vi.fn().mockImplementation(
      () => new Promise((resolve) => { resolveInit = resolve; }),
    );
    const getCas = createLazyCas(factory);

    const p1 = getCas();
    const p2 = getCas();
    expect(p1).toBe(p2);

    resolveInit('shared');
    expect(await p1).toBe('shared');
    expect(await p2).toBe('shared');
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it('concurrent callers during rejection all see the error', async () => {
    const factory = vi.fn()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce('ok');

    const getCas = createLazyCas(factory);

    const p1 = getCas();
    const p2 = getCas();
    // Both should reject with the same error
    await expect(p1).rejects.toThrow('boom');
    await expect(p2).rejects.toThrow('boom');

    // After rejection, a new call retries
    const result = await getCas();
    expect(result).toBe('ok');
    expect(factory).toHaveBeenCalledTimes(2);
  });
});

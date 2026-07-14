import { describe, expect, it } from 'vitest';

import {
  resolveRuntimeHostConstructionOptions,
  WarpOpenOptions,
} from '../../../../src/domain/warp/RuntimeHostBoot.ts';
import { openRuntimeHostProduct } from '../../../../src/domain/warp/RuntimeHostProduct.ts';
import defaultCodec from '../../../../src/infrastructure/codecs/CborCodec.ts';
import NodeCryptoAdapter from '../../../../src/infrastructure/adapters/NodeCryptoAdapter.ts';
import { createMockPersistence } from '../../../helpers/warpGraphTestUtils.ts';
import { createMemoryRuntimeStorage } from '../../../helpers/MemoryRuntimeHost.ts';

describe('WarpOpenOptions', () => {
  it('freezes required runtime open options without resolving default ports', () => {
    const persistence = createMockPersistence();
    const options = new WarpOpenOptions({
      persistence,
      graphName: 'parsed-options',
      writerId: 'writer-1',
    });

    expect(Object.isFrozen(options)).toBe(true);
    expect(options.persistence).toBe(persistence);
    expect(options.graphName).toBe('parsed-options');
    expect(options.writerId).toBe('writer-1');
    expect(options.gcPolicy).toEqual({});
    expect(options.codec).toBeUndefined();
    expect(options.crypto).toBeUndefined();
    expect(options.checkpointPolicy).toBeUndefined();
  });

  it('normalizes checkpointPolicy into a frozen value object', () => {
    const checkpointPolicy = { every: 5 };
    const options = new WarpOpenOptions({
      persistence: createMockPersistence(),
      graphName: 'checkpoint-options',
      writerId: 'writer-1',
      checkpointPolicy,
    });

    expect(options.checkpointPolicy).toEqual({ every: 5 });
    expect(options.checkpointPolicy).not.toBe(checkpointPolicy);
    expect(Object.isFrozen(options.checkpointPolicy)).toBe(true);
  });

  it('snapshots gcPolicy config objects before freezing open options', () => {
    const gcPolicy = { enabled: true };
    const options = new WarpOpenOptions({
      persistence: createMockPersistence(),
      graphName: 'gc-options',
      writerId: 'writer-1',
      gcPolicy,
    });

    gcPolicy.enabled = false;

    expect(options.gcPolicy).toEqual({ enabled: true });
    expect(options.gcPolicy).not.toBe(gcPolicy);
    expect(Object.isFrozen(options.gcPolicy)).toBe(true);
  });

  it('rejects invalid checkpointPolicy values before async boot resolution', () => {
    expect(() => new WarpOpenOptions({
      persistence: createMockPersistence(),
      graphName: 'bad-checkpoint-options',
      writerId: 'writer-1',
      checkpointPolicy: { every: 0 },
    })).toThrow('checkpointPolicy.every must be a positive integer');
  });

  it('builds a minimal frozen open-options object for tests', () => {
    const persistence = createMockPersistence();
    const options = WarpOpenOptions.minimal({ persistence });

    expect(Object.isFrozen(options)).toBe(true);
    expect(options.persistence).toBe(persistence);
    expect(options.graphName).toBe('default');
    expect(options.writerId).toBe('local');
  });

  it('keeps raw object compatibility at the construction resolver boundary', async () => {
    const persistence = createMockPersistence();
    const { options } = await resolveRuntimeHostConstructionOptions({
      persistence,
      runtimeStorage: createMemoryRuntimeStorage(persistence),
      graphName: 'raw-options',
      writerId: 'writer-1',
    });

    expect(options.graphName).toBe('raw-options');
    expect(options.writerId).toBe('writer-1');
    expect(options.codec).toBe(defaultCodec);
    expect(options.crypto).toBeInstanceOf(NodeCryptoAdapter);
  });

  it('opens runtime products from a parsed options instance', async () => {
    const persistence = createMockPersistence();
    const runtime = await openRuntimeHostProduct(new WarpOpenOptions({
      persistence,
      runtimeStorage: createMemoryRuntimeStorage(persistence),
      graphName: 'parsed-runtime',
      writerId: 'writer-1',
      onDeleteWithData: 'cascade',
    }));

    expect(runtime.graphName).toBe('parsed-runtime');
    expect(runtime.writerId).toBe('writer-1');
    expect(runtime.onDeleteWithData).toBe('cascade');
  });

  it('treats JavaScript null runtime storage as absent and fails closed', async () => {
    const options = new WarpOpenOptions({
      persistence: createMockPersistence(),
      graphName: 'null-runtime-storage',
      writerId: 'writer-1',
      // @ts-expect-error exercising runtime validation for JavaScript callers
      runtimeStorage: null,
    });

    expect(options.runtimeStorage).toBeUndefined();
    await expect(resolveRuntimeHostConstructionOptions(options)).rejects.toMatchObject({
      code: 'E_RUNTIME_STORAGE_REQUIRED',
    });
  });
});

import { describe, expect, it, vi } from 'vitest';

import type { ApiRuntimeContext } from '../../../../src/domain/api/ApiRuntimeContext.ts';
import { createSettlementFrontierRef } from '../../../../src/domain/api/SettlementIdentityRuntime.ts';

describe('SettlementIdentityRuntime', () => {
  it('orders frontier writer ids by stable codepoint order', async () => {
    const createOpaqueId = vi.fn(
      async (namespace: 'tick' | 'evidence' | 'admission', parts: readonly (string | number)[]) =>
        `${namespace}:${parts.join(':')}`
    );
    const context: ApiRuntimeContext = {
      bindReceipt: () => undefined,
      createOpaqueId,
      reserveRecoveryNonce: () => 'unused',
    };
    const entries = Object.freeze([
      Object.freeze({ patchSha: 'patch:lower', writerId: 'a' }),
      Object.freeze({ patchSha: 'patch:upper', writerId: 'A' }),
    ]);

    await createSettlementFrontierRef({
      checkpointSha: 'checkpoint:1',
      context,
      entries,
      worldlineName: 'events',
    });

    expect(createOpaqueId).toHaveBeenCalledWith('admission', [
      'settlement-frontier',
      'events',
      'checkpoint:1',
      'A',
      'patch:upper',
      'a',
      'patch:lower',
    ]);
    expect(entries.map(({ writerId }) => writerId)).toEqual(['a', 'A']);
  });
});

import { describe, expect, it } from 'vitest';
import TrustError from '../../../../src/domain/errors/TrustError.ts';
import {
  TrustState,
  type ActiveKeyInfo,
  type BindingInfo,
  type BuildError,
  type RevokedBindingInfo,
  type RevokedKeyInfo,
  buildState,
} from '../../../../src/domain/trust/TrustStateBuilder.ts';
import {
  KEY_ADD_1,
  KEY_ID_1,
  KEY_ID_2,
  PUBLIC_KEY_1,
  WRITER_BIND_ADD_ALICE,
} from './fixtures/goldenRecords.ts';

function emptyTrustState(fields: {
  readonly activeKeys?: Map<string, ActiveKeyInfo>;
  readonly revokedKeys?: Map<string, RevokedKeyInfo>;
  readonly writerBindings?: Map<string, BindingInfo>;
  readonly revokedBindings?: Map<string, RevokedBindingInfo>;
  readonly errors?: BuildError[];
  readonly recordsProcessed?: number;
} = {}): TrustState {
  return new TrustState({
    activeKeys: fields.activeKeys ?? new Map(),
    revokedKeys: fields.revokedKeys ?? new Map(),
    writerBindings: fields.writerBindings ?? new Map(),
    revokedBindings: fields.revokedBindings ?? new Map(),
    errors: fields.errors ?? [],
    recordsProcessed: fields.recordsProcessed ?? 0,
  });
}

describe('TrustState runtime boundaries', () => {
  it('defensively copies maps and freezes stored values', () => {
    const activeKeys = new Map<string, ActiveKeyInfo>([
      [KEY_ID_1, { publicKey: PUBLIC_KEY_1, addedAt: '2025-06-15T12:00:00Z' }],
    ]);
    const state = emptyTrustState({ activeKeys, recordsProcessed: 1 });

    activeKeys.clear();

    expect(state.hasActiveKey(KEY_ID_1)).toBe(true);
    expect(state.activeKeys.size).toBe(1);
    expect(Object.isFrozen(state.activeKeys.get(KEY_ID_1))).toBe(true);
  });

  it('does not expose Map mutators at runtime', () => {
    const state = emptyTrustState({
      activeKeys: new Map([
        [KEY_ID_1, { publicKey: PUBLIC_KEY_1, addedAt: '2025-06-15T12:00:00Z' }],
      ]),
    });

    expect(Reflect.get(state.activeKeys, 'set')).toBeUndefined();
    expect(Reflect.get(state.activeKeys, 'delete')).toBeUndefined();
    expect(Reflect.get(state.activeKeys, 'clear')).toBeUndefined();
  });

  it('validates constructor map fields', () => {
    expect(() => new TrustState({
      // @ts-expect-error runtime validation covers malformed boundary input.
      activeKeys: [],
      revokedKeys: new Map(),
      writerBindings: new Map(),
      revokedBindings: new Map(),
      errors: [],
      recordsProcessed: 0,
    })).toThrow(TrustError);
  });

  it('validates key and binding key formats', () => {
    expect(() => emptyTrustState({
      activeKeys: new Map([
        ['not-a-key-id', { publicKey: PUBLIC_KEY_1, addedAt: '2025-06-15T12:00:00Z' }],
      ]),
    })).toThrow(TrustError);

    expect(() => emptyTrustState({
      writerBindings: new Map([
        [`alice\0${KEY_ID_1}`, { keyId: KEY_ID_2, boundAt: '2025-06-15T12:00:00Z' }],
      ]),
    })).toThrow(TrustError);
  });

  it('rejects malformed map entries with TrustError', () => {
    expect(() => emptyTrustState({
      // @ts-expect-error runtime validation covers malformed boundary input.
      activeKeys: new Map([[KEY_ID_1, null]]),
    })).toThrow(TrustError);

    expect(() => emptyTrustState({
      // @ts-expect-error runtime validation covers malformed boundary input.
      revokedKeys: new Map([[KEY_ID_1, null]]),
    })).toThrow(TrustError);

    expect(() => emptyTrustState({
      // @ts-expect-error runtime validation covers malformed boundary input.
      writerBindings: new Map([[`alice\0${KEY_ID_1}`, null]]),
    })).toThrow(TrustError);

    expect(() => emptyTrustState({
      // @ts-expect-error runtime validation covers malformed boundary input.
      revokedBindings: new Map([[`alice\0${KEY_ID_1}`, null]]),
    })).toThrow(TrustError);
  });

  it('exposes writer binding query methods', async () => {
    const state = await buildState([KEY_ADD_1, WRITER_BIND_ADD_ALICE]);

    expect(state.getBindingsForWriter('alice')).toEqual([
      { keyId: KEY_ID_1, boundAt: WRITER_BIND_ADD_ALICE.issuedAt },
    ]);
    expect(state.getBindingsForWriter('nobody')).toEqual([]);
    expect(state.hasRevokedBindingsForWriter('alice')).toBe(false);
  });
});

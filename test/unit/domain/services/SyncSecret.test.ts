import { describe, expect, it } from 'vitest';
import { inspect } from 'node:util';

import defaultCrypto from '../../../../src/domain/utils/defaultCrypto.ts';
import SyncAuthService, {
  signSyncRequest,
} from '../../../../src/domain/services/sync/SyncAuthService.ts';
import SyncSecret from '../../../../src/domain/services/sync/SyncSecret.ts';

describe('SyncSecret', () => {
  it('redacts accidental string, JSON, and inspect output', () => {
    const secret = SyncSecret.fromString('test-secret-key-1234567890');

    expect(String(secret)).toBe('[REDACTED]');
    expect(JSON.stringify({ secret })).toBe('{"secret":"[REDACTED]"}');
    expect(inspect(secret)).toBe('[REDACTED]');
    expect(Object.keys(secret)).toEqual([]);
  });

  it('signs and verifies sync requests without exposing a string secret', async () => {
    const secret = SyncSecret.fromString('test-secret-key-1234567890');
    const service = new SyncAuthService({
      keys: { default: secret },
      crypto: defaultCrypto,
    });
    const body = new TextEncoder().encode('verify-me');
    const headers = await signSyncRequest(
      {
        method: 'POST',
        path: '/sync',
        contentType: 'text/plain',
        body,
        secret,
        keyId: 'default',
        lamport: 1,
      },
      { crypto: defaultCrypto },
    );

    const result = await service.verify({
      method: 'POST',
      url: '/sync',
      headers: { 'content-type': 'text/plain', ...headers },
      body,
    });

    expect(result).toEqual({ ok: true });
  });

  it('rejects plain string keys at runtime', () => {
    expect(() => new SyncAuthService({
      // @ts-expect-error Runtime guard mirrors the public type boundary.
      keys: { default: 'test-secret-key-1234567890' },
      crypto: defaultCrypto,
    })).toThrow('SyncAuthService requires SyncSecret values');
  });
});

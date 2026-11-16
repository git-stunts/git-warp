import { describe, expect, it } from 'vitest';
import { inspect } from 'node:util';

import defaultCrypto from '../../../../src/infrastructure/adapters/NodeCryptoSingleton.ts';
import SeededRandomPort from '../../../helpers/SeededRandomPort.ts';
import SyncAuthService, {
  signSyncRequest,
} from '../../../../src/domain/services/sync/SyncAuthService.ts';
import SyncSecret from '../../../../src/domain/services/sync/SyncSecret.ts';
import InMemorySyncReplayProtection from '../../../helpers/InMemorySyncReplayProtection.ts';
import ManualClock from '../../../helpers/ManualClock.ts';

/** Deterministic, well-spread nonce entropy shared by this file's signed requests. */
/** Fixed wall clock for signer, verifier and replay store; these tests never advance time. */
const CLOCK = new ManualClock();

const NONCE_RANDOM = new SeededRandomPort(184003);

describe('SyncSecret', () => {
  it('redacts accidental string, JSON, and inspect output', async () => {
    const secret = SyncSecret.fromString('test-secret-key-1234567890');

    expect(String(secret)).toBe('[REDACTED]');
    expect(await Response.json({ secret }).text()).toBe('{"secret":"[REDACTED]"}');
    expect(inspect(secret)).toBe('[REDACTED]');
    expect(Object.keys(secret)).toEqual([]);
  });

  it('signs and verifies sync requests without exposing a string secret', async () => {
    const secret = SyncSecret.fromString('test-secret-key-1234567890');
    const service = new SyncAuthService({
      keys: { default: secret },
      crypto: defaultCrypto,
      replayProtection: new InMemorySyncReplayProtection(CLOCK.read),
      clock: CLOCK,
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
      },
      { crypto: defaultCrypto, random: NONCE_RANDOM, clock: CLOCK },
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
      replayProtection: new InMemorySyncReplayProtection(CLOCK.read),
      clock: CLOCK,
    })).toThrow('SyncAuthService requires SyncSecret values');
  });
});

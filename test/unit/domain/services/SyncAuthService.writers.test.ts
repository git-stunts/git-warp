import { describe, it, expect } from 'vitest';
import SyncAuthService, { type SyncAuthServiceOptions } from '../../../../src/domain/services/sync/SyncAuthService.ts';
import SyncSecret from '../../../../src/domain/services/sync/SyncSecret.ts';
import defaultCrypto from '../../../../src/infrastructure/adapters/NodeCryptoSingleton.ts';
import ManualClock from '../../../helpers/ManualClock.ts';
import InMemorySyncReplayProtection from '../../../helpers/InMemorySyncReplayProtection.ts';

function syncKeys(values: Record<string, string>): Record<string, SyncSecret> {
  return Object.fromEntries(Object.entries(values).map(([key, value]): [string, SyncSecret] => [key, SyncSecret.fromString(value)]));
}
function createService(options: Partial<SyncAuthServiceOptions> = {}): SyncAuthService {
  const clock = new ManualClock();
  return new SyncAuthService({ keys: syncKeys({ default: 'secret123' }), crypto: defaultCrypto, clock,
    replayProtection: new InMemorySyncReplayProtection(clock.read), ...options });
}

// ---------------------------------------------------------------------------
// verifyWriters()
// ---------------------------------------------------------------------------
describe('verifyWriters()', () => {
  it('allows all writers when allowedWriters is not set', async () => {
    const auth = createService({
      keys: syncKeys({ default: 'secret123' }),
      crypto: defaultCrypto,
    });
    const result = auth.verifyWriters(['alice', 'bob', 'charlie']);
    expect(result.ok).toBe(true);
  });

  it('allows listed writers', async () => {
    const auth = createService({
      keys: syncKeys({ default: 'secret123' }),
      crypto: defaultCrypto,
      allowedWriters: ['alice', 'bob'],
    });
    const result = auth.verifyWriters(['alice', 'bob']);
    expect(result.ok).toBe(true);
  });

  it('rejects unlisted writers with FORBIDDEN_WRITER 403', async () => {
    const auth = createService({
      keys: syncKeys({ default: 'secret123' }),
      crypto: defaultCrypto,
      allowedWriters: ['alice'],
    });
    const result = auth.verifyWriters(['alice', 'eve']);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('FORBIDDEN_WRITER');
      expect(result.status).toBe(403);
    }
  });

  it('increments forbiddenWriterRejects metric', async () => {
    const auth = createService({
      keys: syncKeys({ default: 'secret123' }),
      crypto: defaultCrypto,
      allowedWriters: ['alice'],
    });
    auth.verifyWriters(['eve']);
    expect(auth.getMetrics().forbiddenWriterRejects).toBe(1);
  });

  it('validates writer IDs at construction time', () => {
    expect(() => createService({
      keys: syncKeys({ default: 'secret123' }),
      crypto: defaultCrypto,
      allowedWriters: ['valid', 'a/b'],
    })).toThrow('Invalid writer ID');
  });

  it('rejects empty allowedWriters array', () => {
    expect(() => createService({
      keys: syncKeys({ default: 'secret123' }),
      crypto: defaultCrypto,
      allowedWriters: [],
    })).toThrow('allowedWriters must be a non-empty array');
  });
});

// ---------------------------------------------------------------------------
// Mode-agnostic validation
// ---------------------------------------------------------------------------
describe('mode-agnostic validation', () => {
  it('verifyWriters() returns { ok: false } in log-only mode (caller decides enforcement)', () => {
    const svc = createService({
      keys: syncKeys({ default: 'secret123' }),
      crypto: defaultCrypto,
      mode: 'log-only',
      allowedWriters: ['alice'],
    });
    const result = svc.verifyWriters(['eve']);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('FORBIDDEN_WRITER');
    }
  });
});

// ---------------------------------------------------------------------------
// enforceWriters() — mode-aware convenience wrapper
// ---------------------------------------------------------------------------
describe('enforceWriters()', () => {
  it('rejects forbidden writers in enforce mode', () => {
    const svc = createService({
      keys: syncKeys({ default: 'secret123' }),
      crypto: defaultCrypto,
      mode: 'enforce',
      allowedWriters: ['alice'],
    });
    const result = svc.enforceWriters(['eve']);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('FORBIDDEN_WRITER');
      expect(result.status).toBe(403);
    }
  });

  it('allows forbidden writers through in log-only mode', () => {
    const svc = createService({
      keys: syncKeys({ default: 'secret123' }),
      crypto: defaultCrypto,
      mode: 'log-only',
      allowedWriters: ['alice'],
    });
    const result = svc.enforceWriters(['eve']);
    expect(result.ok).toBe(true);
  });

  it('increments logOnlyPassthroughs in log-only mode', () => {
    const svc = createService({
      keys: syncKeys({ default: 'secret123' }),
      crypto: defaultCrypto,
      mode: 'log-only',
      allowedWriters: ['alice'],
    });
    svc.enforceWriters(['eve']);
    expect(svc.getMetrics().logOnlyPassthroughs).toBe(1);
  });

  it('still increments forbiddenWriterRejects metric in log-only mode', () => {
    const svc = createService({
      keys: syncKeys({ default: 'secret123' }),
      crypto: defaultCrypto,
      mode: 'log-only',
      allowedWriters: ['alice'],
    });
    svc.enforceWriters(['eve']);
    expect(svc.getMetrics().forbiddenWriterRejects).toBe(1);
  });

  it('allows listed writers in any mode', () => {
    const svc = createService({
      keys: syncKeys({ default: 'secret123' }),
      crypto: defaultCrypto,
      mode: 'enforce',
      allowedWriters: ['alice', 'bob'],
    });
    expect(svc.enforceWriters(['alice', 'bob']).ok).toBe(true);
  });

  it('passes through when no allowedWriters configured', () => {
    const svc = createService({
      keys: syncKeys({ default: 'secret123' }),
      crypto: defaultCrypto,
      mode: 'enforce',
    });
    expect(svc.enforceWriters(['anyone']).ok).toBe(true);
  });
});

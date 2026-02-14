import { describe, it, expect } from 'vitest';
import {
  parseTrustConfig,
  canonicalizeTrustConfig,
  computeTrustDigest,
  TRUST_DIGEST_PREFIX,
} from '../../../../src/domain/services/TrustSchema.js';
import NodeCryptoAdapter from '../../../../src/infrastructure/adapters/NodeCryptoAdapter.js';

// ============================================================================
// Valid config factory
// ============================================================================

/** @returns {Record<string, unknown>} */
function validConfig(/** @type {Record<string, unknown>} */ overrides = {}) {
  return {
    version: 1,
    trustedWriters: ['alice', 'bob'],
    policy: 'any',
    epoch: '2025-01-01T00:00:00.000Z',
    requiredSignatures: null,
    allowedSignersPath: null,
    ...overrides,
  };
}

// ============================================================================
// Schema Validation
// ============================================================================

describe('TrustSchema — parseTrustConfig', () => {
  it('accepts a valid config', () => {
    const config = parseTrustConfig(validConfig());
    expect(config.version).toBe(1);
    expect(config.trustedWriters).toEqual(['alice', 'bob']);
    expect(config.policy).toBe('any');
  });

  it('accepts all_writers_must_be_trusted policy', () => {
    const config = parseTrustConfig(validConfig({ policy: 'all_writers_must_be_trusted' }));
    expect(config.policy).toBe('all_writers_must_be_trusted');
  });

  it('sorts and dedupes trustedWriters at parse boundary', () => {
    const config = parseTrustConfig(validConfig({
      trustedWriters: ['charlie', 'alice', 'bob', 'alice'],
    }));
    expect(config.trustedWriters).toEqual(['alice', 'bob', 'charlie']);
  });

  it('trims whitespace from writer entries', () => {
    const config = parseTrustConfig(validConfig({
      trustedWriters: ['  alice  ', ' bob '],
    }));
    expect(config.trustedWriters).toEqual(['alice', 'bob']);
  });

  it('filters out empty writer entries after trim', () => {
    const config = parseTrustConfig(validConfig({
      trustedWriters: ['alice', '', '   ', 'bob'],
    }));
    expect(config.trustedWriters).toEqual(['alice', 'bob']);
  });

  it('rejects missing version field', () => {
    const raw = validConfig();
    delete raw.version;
    expect(() => parseTrustConfig(raw)).toThrow();
  });

  it('rejects version !== 1', () => {
    expect(() => parseTrustConfig(validConfig({ version: 2 }))).toThrow();
  });

  it('rejects missing trustedWriters field', () => {
    const raw = validConfig();
    delete raw.trustedWriters;
    expect(() => parseTrustConfig(raw)).toThrow();
  });

  it('rejects missing policy field', () => {
    const raw = validConfig();
    delete raw.policy;
    expect(() => parseTrustConfig(raw)).toThrow();
  });

  it('rejects missing epoch field', () => {
    const raw = validConfig();
    delete raw.epoch;
    expect(() => parseTrustConfig(raw)).toThrow();
  });

  it('rejects empty epoch', () => {
    expect(() => parseTrustConfig(validConfig({ epoch: '' }))).toThrow(/epoch/);
  });

  it('rejects extra keys (Zod strict)', () => {
    const raw = { ...validConfig(), extraKey: 'oops' };
    expect(() => parseTrustConfig(raw)).toThrow();
  });

  it('throws E_TRUST_SCHEMA_INVALID on bad schema', () => {
    try {
      parseTrustConfig({ version: 1 });
      expect.unreachable('should have thrown');
    } catch (/** @type {*} */ err) {
      expect(err.code).toBe('E_TRUST_SCHEMA_INVALID');
    }
  });

  it('throws E_TRUST_POLICY_RESERVED for allowlist_with_exceptions', () => {
    try {
      parseTrustConfig(validConfig({ policy: 'allowlist_with_exceptions' }));
      expect.unreachable('should have thrown');
    } catch (/** @type {*} */ err) {
      expect(err.code).toBe('E_TRUST_POLICY_RESERVED');
      expect(err.message).toMatch(/reserved/);
    }
  });

  it('rejects unknown policy values', () => {
    try {
      parseTrustConfig(validConfig({ policy: 'yolo' }));
      expect.unreachable('should have thrown');
    } catch (/** @type {*} */ err) {
      expect(err.code).toBe('E_TRUST_SCHEMA_INVALID');
    }
  });
});

// ============================================================================
// Canonicalization
// ============================================================================

describe('TrustSchema — canonicalizeTrustConfig', () => {
  it('produces deterministic key order regardless of insertion order', () => {
    const config1 = parseTrustConfig(validConfig());
    const config2 = parseTrustConfig({
      allowedSignersPath: null,
      epoch: '2025-01-01T00:00:00.000Z',
      policy: 'any',
      requiredSignatures: null,
      trustedWriters: ['bob', 'alice'],
      version: 1,
    });

    expect(canonicalizeTrustConfig(config1)).toBe(canonicalizeTrustConfig(config2));
  });

  it('produces stable JSON with sorted keys', () => {
    const config = parseTrustConfig(validConfig());
    const json = canonicalizeTrustConfig(config);
    const parsed = JSON.parse(json);
    const keys = Object.keys(parsed);
    expect(keys).toEqual([...keys].sort());
  });
});

// ============================================================================
// Digest
// ============================================================================

describe('TrustSchema — computeTrustDigest', () => {
  it('produces a hex string', async () => {
    const crypto = new NodeCryptoAdapter();
    const config = parseTrustConfig(validConfig());
    const canonical = canonicalizeTrustConfig(config);
    const digest = await computeTrustDigest(canonical, crypto);
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is deterministic across key reorderings', async () => {
    const crypto = new NodeCryptoAdapter();
    const json1 = canonicalizeTrustConfig(parseTrustConfig(validConfig()));
    const json2 = canonicalizeTrustConfig(parseTrustConfig({
      allowedSignersPath: null,
      epoch: '2025-01-01T00:00:00.000Z',
      policy: 'any',
      requiredSignatures: null,
      trustedWriters: ['bob', 'alice'],
      version: 1,
    }));

    const d1 = await computeTrustDigest(json1, crypto);
    const d2 = await computeTrustDigest(json2, crypto);
    expect(d1).toBe(d2);
  });

  it('uses domain separation prefix', () => {
    expect(TRUST_DIGEST_PREFIX).toContain('git-warp:trust:v1');
    expect(TRUST_DIGEST_PREFIX).toContain('\0');
  });
});

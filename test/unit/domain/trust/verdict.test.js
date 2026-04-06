import { describe, it, expect } from 'vitest';

import { deriveTrustVerdict } from '../../../../src/domain/trust/verdict.js';

describe('deriveTrustVerdict', () => {
  it('returns not_configured when trust is not configured', () => {
    expect(deriveTrustVerdict({
      status: 'not_configured',
      untrustedWriters: ['alice'],
    })).toBe('not_configured');
  });

  it('returns fail for error status', () => {
    expect(deriveTrustVerdict({
      status: 'error',
      untrustedWriters: [],
    })).toBe('fail');
  });

  it('returns fail when there are untrusted writers', () => {
    expect(deriveTrustVerdict({
      status: 'configured',
      untrustedWriters: ['alice'],
    })).toBe('fail');
  });

  it('returns pass for trusted configured states', () => {
    expect(deriveTrustVerdict({
      status: 'configured',
      untrustedWriters: [],
    })).toBe('pass');

    expect(deriveTrustVerdict({
      status: 'pinned',
      untrustedWriters: [],
    })).toBe('pass');
  });
});

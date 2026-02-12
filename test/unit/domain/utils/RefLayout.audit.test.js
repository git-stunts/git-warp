import { describe, it, expect } from 'vitest';
import { buildAuditRef } from '../../../../src/domain/utils/RefLayout.js';

describe('buildAuditRef', () => {
  it('builds correct audit ref path', () => {
    expect(buildAuditRef('events', 'alice')).toBe('refs/warp/events/audit/alice');
  });

  it('validates graphName', () => {
    expect(() => buildAuditRef('', 'alice')).toThrow();
    expect(() => buildAuditRef('../etc', 'alice')).toThrow();
  });

  it('validates writerId', () => {
    expect(() => buildAuditRef('events', '')).toThrow();
    expect(() => buildAuditRef('events', 'a/b')).toThrow();
  });
});

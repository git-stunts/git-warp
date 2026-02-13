import { describe, it, expect } from 'vitest';
import { parseVerifyAuditArgs } from '../../../bin/cli/commands/verify-audit.js';

describe('parseVerifyAuditArgs', () => {
  it('parses --since with a value', () => {
    const result = parseVerifyAuditArgs(['--since', 'abc123']);
    expect(result.since).toBe('abc123');
  });

  it('parses --writer with a value', () => {
    const result = parseVerifyAuditArgs(['--writer', 'alice']);
    expect(result.writerFilter).toBe('alice');
  });

  it('parses both --since and --writer', () => {
    const result = parseVerifyAuditArgs(['--since', 'abc', '--writer', 'bob']);
    expect(result.since).toBe('abc');
    expect(result.writerFilter).toBe('bob');
  });

  it('returns undefined for unprovided options', () => {
    const result = parseVerifyAuditArgs([]);
    expect(result.since).toBeUndefined();
    expect(result.writerFilter).toBeUndefined();
  });

  it('rejects empty-string value for --since', () => {
    expect(() => parseVerifyAuditArgs(['--since', ''])).toThrow(/missing value/i);
  });

  it('rejects empty-string value for --writer', () => {
    expect(() => parseVerifyAuditArgs(['--writer', ''])).toThrow(/missing value/i);
  });

  it('throws on unknown flag', () => {
    expect(() => parseVerifyAuditArgs(['--writter', 'alice'])).toThrow(/unknown/i);
  });

  it('throws on unexpected positional argument', () => {
    expect(() => parseVerifyAuditArgs(['foo'])).toThrow(/unexpected/i);
  });

  it('throws when --since is missing its value', () => {
    expect(() => parseVerifyAuditArgs(['--since'])).toThrow(/missing/i);
  });

  it('throws when --writer is missing its value', () => {
    expect(() => parseVerifyAuditArgs(['--writer'])).toThrow(/missing/i);
  });
});

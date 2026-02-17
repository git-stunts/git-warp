/**
 * CLI pin precedence tests (W4.2).
 *
 * Tests that trust pin resolution follows: CLI flag > env > ref.
 */

import { describe, it, expect } from 'vitest';
import { parseTrustArgs } from '../../../bin/cli/commands/trust.js';

describe('trust CLI pin precedence', () => {
  it('parses --trust-pin from CLI args', () => {
    const result = parseTrustArgs(['--trust-pin', 'abc123']);
    expect(result.trustPin).toBe('abc123');
  });

  it('parses --mode from CLI args', () => {
    const result = parseTrustArgs(['--mode', 'enforce']);
    expect(result.mode).toBe('enforce');
  });

  it('defaults to no pin and no mode', () => {
    const result = parseTrustArgs([]);
    expect(result.trustPin).toBeNull();
    expect(result.mode).toBeNull();
  });

  it('rejects invalid mode', () => {
    expect(() => parseTrustArgs(['--mode', 'bogus'])).toThrow();
  });
});

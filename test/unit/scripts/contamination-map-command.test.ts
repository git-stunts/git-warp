import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

describe('contamination map command', () => {
  it('enforces dynamic import policy through the scanner command', () => {
    expect(() => execFileSync(
      process.execPath,
      ['scripts/contamination-map.ts'],
      { cwd: process.cwd(), encoding: 'utf8', stdio: 'pipe' },
    )).not.toThrow();
  });
});

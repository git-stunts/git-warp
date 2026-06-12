import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = process.cwd();

describe('TypeScript config package files', () => {
  it('ships TypeScript-native lint and test config files', () => {
    expect(existsSync(join(repoRoot, 'eslint.config.ts'))).toBe(true);
    expect(existsSync(join(repoRoot, 'vitest.config.ts'))).toBe(true);
  });

  it('does not keep the retired JavaScript config filenames', () => {
    expect(existsSync(join(repoRoot, 'eslint.config.js'))).toBe(false);
    expect(existsSync(join(repoRoot, 'vitest.config.js'))).toBe(false);
  });
});

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));

function readRepoFile(relativePath: string): string {
  return readFileSync(`${repoRoot}${relativePath}`, 'utf8');
}

describe('changelog config extension shape', () => {
  it('does not claim the TypeScript config pair still uses .js extensions', () => {
    const changelog = readRepoFile('CHANGELOG.md');
    const typeScriptBullet = changelog
      .split('\n')
      .find((line) => line.includes('**100% TypeScript**')) ?? '';

    expect(typeScriptBullet).not.toContain('eslint.config.js and vitest.config.js');
    expect(typeScriptBullet).toContain('eslint.config.ts');
    expect(typeScriptBullet).toContain('vitest.config.ts');
  });
});

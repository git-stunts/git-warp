import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import jsrJson from '../../../jsr.json' with { type: 'json' };
import packageJson from '../../../package.json' with { type: 'json' };
import tsconfig from '../../../tsconfig.json' with { type: 'json' };
import srcConfig from '../../../tsconfig.src.json' with { type: 'json' };
import testConfig from '../../../tsconfig.test.json' with { type: 'json' };
import { shouldAutoUpdateCoverageRatchet } from '../../../scripts/coverage-ratchet.ts';
import vitestConfig from '../../../vitest.config.ts';

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));

function trackedNonTypeScriptTail(): string[] {
  const output = execFileSync('git', ['ls-files', '-z', '--', '*.js', '*.d.ts'], {
    cwd: repoRoot,
    encoding: 'utf8',
  });

  return output
    .split('\0')
    .filter((path) => path.length > 0)
    .filter((path) => !path.startsWith('.obsidian/'))
    .sort();
}

describe('non-TS tail shape', () => {
  it('keeps the tracked non-TS tail explicit and bounded', () => {
    expect(trackedNonTypeScriptTail()).toEqual([
      'src/globals.d.ts',
      'test/type-check/runtime-declarations.d.ts',
    ]);
  });

  it('moves the root config pair onto .ts and drops the old .js files', () => {
    expect(existsSync(`${repoRoot}eslint.config.ts`)).toBe(true);
    expect(existsSync(`${repoRoot}vitest.config.ts`)).toBe(true);
    expect(existsSync(`${repoRoot}eslint.config.js`)).toBe(false);
    expect(existsSync(`${repoRoot}vitest.config.js`)).toBe(false);
  });

  it('keeps the sha1sync export honest without a standalone declaration file', () => {
    expect(packageJson.exports['./sha1sync']).toEqual({
      types: './dist/src/infrastructure/adapters/sha1sync.d.ts',
      import: './dist/src/infrastructure/adapters/sha1sync.js',
      default: './dist/src/infrastructure/adapters/sha1sync.js',
    });
    expect(jsrJson.exports['./sha1sync']).toBe('./src/infrastructure/adapters/sha1sync.ts');
    expect(trackedNonTypeScriptTail()).not.toContain('src/infrastructure/adapters/sha1sync.d.ts');
  });

  it('keeps the coverage ratchet hook and removes stale .js glob assumptions from vitest and tsconfig', () => {
    expect(vitestConfig.test?.coverage?.thresholds?.autoUpdate).toBe(shouldAutoUpdateCoverageRatchet());
    expect(shouldAutoUpdateCoverageRatchet({ GIT_WARP_UPDATE_COVERAGE_RATCHET: '1' })).toBe(true);
    expect(shouldAutoUpdateCoverageRatchet({ GIT_WARP_UPDATE_COVERAGE_RATCHET: '0' })).toBe(false);
    expect(vitestConfig.test?.include).toEqual([
      '**/*.{test,spec}.?(c|m)[jt]s?(x)',
      '**/benchmark/*.benchmark.ts',
    ]);
    expect(tsconfig.include).not.toContain('src/**/*.js');
    expect(tsconfig.include).not.toContain('bin/**/*.js');
    expect(tsconfig.include).not.toContain('scripts/**/*.js');
    expect(tsconfig.include).not.toContain('test/**/*.js');
    expect(srcConfig.include).not.toContain('src/**/*.js');
    expect(testConfig.include).not.toContain('src/**/*.js');
  });
});

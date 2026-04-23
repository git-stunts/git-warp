import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));

function readRepoFile(relativePath: string): string {
  return readFileSync(`${repoRoot}${relativePath}`, 'utf8');
}

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
  it('reduces the tracked non-TS tail to the two explicit blockers', () => {
    expect(trackedNonTypeScriptTail()).toEqual([
      'src/domain/warp/_wiredMethods.d.ts',
      'src/globals.d.ts',
    ]);
  });

  it('moves the root config pair onto .ts and drops the old .js files', () => {
    expect(existsSync(`${repoRoot}eslint.config.ts`)).toBe(true);
    expect(existsSync(`${repoRoot}vitest.config.ts`)).toBe(true);
    expect(existsSync(`${repoRoot}eslint.config.js`)).toBe(false);
    expect(existsSync(`${repoRoot}vitest.config.js`)).toBe(false);
  });

  it('keeps the sha1sync export honest without a standalone declaration file', () => {
    const packageJson = readRepoFile('package.json');
    const jsrJson = readRepoFile('jsr.json');

    expect(packageJson).toContain('"./sha1sync"');
    expect(packageJson).toContain('"types": "./src/infrastructure/adapters/sha1sync.ts"');
    expect(packageJson).not.toContain('"sha1sync.d.ts"');
    expect(jsrJson).not.toContain('"sha1sync.d.ts"');
  });

  it('removes the stale .js glob assumptions from vitest and tsconfig', () => {
    const vitestConfig = readRepoFile('vitest.config.ts');
    const tsconfig = readRepoFile('tsconfig.json');
    const srcConfig = readRepoFile('tsconfig.src.json');
    const testConfig = readRepoFile('tsconfig.test.json');

    expect(vitestConfig).toContain("from './scripts/coverage-ratchet.ts'");
    expect(vitestConfig).not.toContain('.benchmark.js');
    expect(vitestConfig).not.toContain("src/**/*.js");
    expect(tsconfig).not.toContain('"src/**/*.js"');
    expect(tsconfig).not.toContain('"bin/**/*.js"');
    expect(tsconfig).not.toContain('"scripts/**/*.js"');
    expect(tsconfig).not.toContain('"test/**/*.js"');
    expect(srcConfig).not.toContain('"src/**/*.js"');
    expect(testConfig).not.toContain('"src/**/*.js"');
  });
});

import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createVitest } from 'vitest/node';
import { describe, expect, it } from 'vitest';
import { coverageRunCompleted } from '../../../scripts/coverage-ratchet.ts';

function createProject() {
  const root = mkdtempSync(join(tmpdir(), 'coverage-manifest-'));
  mkdirSync(join(root, 'test'));
  symlinkSync(resolve('node_modules'), join(root, 'node_modules'), 'dir');
  writeFileSync(join(root, 'package.json'), '{"type":"module"}');
  writeFileSync(join(root, 'test/first.test.ts'), "import { it, expect } from 'vitest'; it('passes', () => expect(1).toBe(1));\n");
  writeFileSync(join(root, 'test/second.test.ts'), "import { it } from 'vitest'; it.skip('deliberately skipped', () => {});\n");
  return root;
}

describe('coverage manifest identity using actual Vitest records', () => {
  it('requires terminal records with the exact selected identities, including deliberate skips', async () => {
    const root = createProject();
    const foreignRoot = createProject();
    const options = { include: ['test/*.test.ts'], reporters: [], maxWorkers: 1, watch: false, run: true };
    const runner = await createVitest('test', { ...options, config: false, root });
    const foreign = await createVitest('test', { ...options, config: false, root: foreignRoot });
    try {
      const selected = await runner.globTestSpecifications();
      const collected = await runner.collect();
      expect(coverageRunCompleted(selected, collected.testModules)).toBe(false);
      const result = await runner.start();
      expect(coverageRunCompleted(selected, result.testModules)).toBe(true);
      expect(coverageRunCompleted([], [])).toBe(false);
      expect(coverageRunCompleted(selected, result.testModules.slice(1))).toBe(false);
      const first = result.testModules[0];
      if (!first) throw new Error('Missing actual Vitest module');
      expect(coverageRunCompleted(selected, [first, first])).toBe(false);
      expect(coverageRunCompleted(await foreign.globTestSpecifications(), result.testModules)).toBe(false);
    } finally {
      await runner.close();
      await foreign.close();
      rmSync(root, { recursive: true, force: true });
      rmSync(foreignRoot, { recursive: true, force: true });
    }
  });
});

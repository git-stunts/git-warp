import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import PackedArtifactBoundaryAdapter from '../../../../src/infrastructure/adapters/PackedArtifactBoundaryAdapter.ts';

const roots: string[] = [];
const boundary = new PackedArtifactBoundaryAdapter();

function fixture(module: string): string {
  const root = mkdtempSync(join(tmpdir(), 'packed-boundary-'));
  roots.push(root);
  mkdirSync(join(root, 'dist/bin/cli'), { recursive: true });
  writeFileSync(join(root, 'package.json'), '{"type":"module","files":["README.md"]}');
  writeFileSync(join(root, 'dist/bin/cli/shared.js'), module);
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('packed artifact boundary', () => {
  it('returns schema-validated file values and rejects invalid files', () => {
    const root = fixture('');
    const path = join(root, 'package.json');
    const schema = z.object({ files: z.array(z.string()) });
    expect(boundary.read(path, schema)).toEqual({ files: ['README.md'] });
    writeFileSync(path, '{"files":[42]}');
    expect(() => boundary.read(path, schema)).toThrow();
    writeFileSync(path, '{');
    expect(() => boundary.read(path, schema)).toThrow();
  });

  it('invokes the packaged installer with its receiver and repository hook directory', async () => {
    const root = fixture(`export function createHookInstaller(dependencies) {
      return {
        action: 'installed',
        async install(repo, options) {
          const expected = repo + '/.git/hooks';
          if (await dependencies.resolveHooksDir() !== expected || options.strategy !== 'install') {
            throw new Error('incorrect installation context');
          }
          return { action: this.action };
        }
      };
    }`);
    await expect(boundary.installHook(root, root)).resolves.toBeUndefined();
  });

  it.each([
    'export const createHookInstaller = 1;',
    'export function createHookInstaller() { return null; }',
    'export function createHookInstaller() { return 3; }',
    'export function createHookInstaller() { return {}; }',
  ])('rejects a missing callable capability: %s', async (module) => {
    const root = fixture(module);
    await expect(boundary.installHook(root, root)).rejects.toMatchObject({
      code: 'E_PACKED_ARTIFACT_CAPABILITY',
    });
  });

  it('rejects an installer that does not confirm installation', async () => {
    const root = fixture(`export function createHookInstaller() {
      return { install() { return { action: 'skipped' }; } };
    }`);
    await expect(boundary.installHook(root, root)).rejects.toThrow();
  });
});

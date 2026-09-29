import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import prunePrivateDeclarations from '../../../scripts/package-payload/PrunePrivateDeclarations.ts';

const roots: string[] = [];

/** Creates five public declaration entrypoints and private implementation outputs. */
function fixture(): string {
  const root = mkdtempSync(join(tmpdir(), 'public-declarations-'));
  roots.push(root);
  writeFileSync(join(root, 'package.json'), '{"type":"module"}');
  mkdirSync(join(root, 'src'));
  for (const name of ['index', 'advanced', 'diagnostics', 'charts', 'testing']) {
    writeFileSync(join(root, `${name}.d.ts`), 'export { Value } from "./src/value.js";');
  }
  writeFileSync(join(root, 'src/value.d.ts'), 'export declare class Value { readonly id: string; }');
  writeFileSync(join(root, 'src/private.d.ts'), 'export declare const privateValue: number;');
  writeFileSync(join(root, 'src/private.js'), 'export const privateValue = 1;');
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

it('preserves transitive types reached through JavaScript specifiers and all runtime code', () => {
  const root = fixture();
  prunePrivateDeclarations(root);
  expect(existsSync(join(root, 'src/value.d.ts'))).toBe(true);
  expect(existsSync(join(root, 'index.d.ts'))).toBe(true);
  expect(existsSync(join(root, 'src/private.d.ts'))).toBe(false);
  expect(existsSync(join(root, 'src/private.js'))).toBe(true);
});

it('refuses to delete declarations when the public closure is invalid', () => {
  const root = fixture();
  writeFileSync(join(root, 'index.d.ts'), 'export { Missing } from "./absent.js";');
  expect(() => prunePrivateDeclarations(root)).toThrow('refusing to prune');
  expect(existsSync(join(root, 'src/private.d.ts'))).toBe(true);
});

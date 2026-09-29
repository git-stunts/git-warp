import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import prunePrivateJavaScript from '../../../scripts/package-payload/PrunePrivateJavaScript.ts';

const roots: string[] = [];

/** Writes a build output, creating its parent directory. */
function write(root: string, path: string, contents: string): void {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), contents);
}

/** Models runtime/type exports, both bins, the launcher, and an explicit legacy command. */
function fixture(): string {
  const root = mkdtempSync(join(tmpdir(), 'runtime-pruning-'));
  roots.push(root);
  write(root, 'package.json', `{"type":"module","exports":{
    ".":{"import":"./dist/index.js","default":"./dist/index.js","types":"./dist/index.d.ts"},
    "./package.json":"./package.json"
  },"bin":{"git-warp":"./bin/git-warp","migration":"./dist/migration.js"}}`);
  for (const path of ['index.js', 'migration.js', 'bin/git-warp.js', 'scripts/upgrade-v16-to-v17.js']) {
    write(root, `dist/${path}`, 'export {};\n');
  }
  write(root, 'dist/private.js', 'export const unused = 1;\n');
  write(root, 'dist/private.d.ts', 'export declare const unused: number;\n');
  write(root, 'scripts/hooks/post-merge.sh', '#!/bin/sh\n');
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

it('keeps runtime and filesystem dependencies byte-identical without pruning types or assets', async () => {
  const root = fixture();
  const source = `import { readFileSync } from 'node:fs';
export const asset = readFileSync(new URL('./asset.js', import.meta.url), 'utf8');
export const load = () => import('./lazy.js');
export const platform = () => process.platform === 'win32' ? import('./windows.js') : import('./unix.js');`;
  write(root, 'dist/index.js', source);
  for (const name of ['asset', 'lazy', 'windows', 'unix']) write(root, `dist/${name}.js`, 'export {};\n');
  await prunePrivateJavaScript(root);
  expect(readFileSync(join(root, 'dist/index.js'), 'utf8')).toBe(source);
  for (const name of ['asset', 'lazy', 'windows', 'unix', 'migration', 'bin/git-warp', 'scripts/upgrade-v16-to-v17']) {
    expect(readFileSync(join(root, `dist/${name}.js`), 'utf8')).toBe('export {};\n');
  }
  expect(existsSync(join(root, 'dist/private.js'))).toBe(false);
  expect(existsSync(join(root, 'dist/private.d.ts'))).toBe(true);
  expect(existsSync(join(root, 'scripts/hooks/post-merge.sh'))).toBe(true);
});

it('refuses unresolved imports before deleting files', async () => {
  const root = fixture();
  write(root, 'dist/index.js', "import './missing.js';");
  await expect(prunePrivateJavaScript(root)).rejects.toThrow('refusing to prune');
  expect(existsSync(join(root, 'dist/private.js'))).toBe(true);
});

it('refuses missing executable roots before deleting files', async () => {
  const root = fixture();
  rmSync(join(root, 'dist/migration.js'));
  await expect(prunePrivateJavaScript(root)).rejects.toThrow();
  expect(existsSync(join(root, 'dist/private.js'))).toBe(true);
});

it.each(['import', 'require'])('refuses computed %s loads that NFT cannot fully resolve', async (load) => {
  const root = fixture();
  write(root, 'dist/index.js', `export const load = (path) => ${load}(path);`);
  await expect(prunePrivateJavaScript(root)).rejects.toThrow('computed runtime import');
  expect(existsSync(join(root, 'dist/private.js'))).toBe(true);
});

it('does not prune or copy installed dependencies', async () => {
  const root = fixture();
  write(root, 'dist/index.js', "import 'external';");
  write(root, 'node_modules/external/package.json', '{"main":"index.js"}');
  write(root, 'node_modules/external/index.js', 'module.exports = 1;');
  await prunePrivateJavaScript(root);
  expect(readFileSync(join(root, 'node_modules/external/index.js'), 'utf8')).toBe('module.exports = 1;');
  expect(existsSync(join(root, 'dist/node_modules'))).toBe(false);
});

it('rejects unsupported export conditions and bin paths before deleting files', async () => {
  const root = fixture();
  write(root, 'package.json', '{"exports":{".":{"browser":"./dist/browser.js"}},"bin":{}}');
  await expect(prunePrivateJavaScript(root)).rejects.toThrow();
  expect(existsSync(join(root, 'dist/private.js'))).toBe(true);
});

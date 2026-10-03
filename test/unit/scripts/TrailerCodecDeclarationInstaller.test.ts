import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import TrailerCodecDeclarationInstaller from '../../../scripts/TrailerCodecDeclarationInstaller.ts';

// Size: medium. Real package-local filesystem and JSON module boundaries.
// Oracle: exact declarations only; repeats preserve files, refusals never overwrite.
const source = new URL('../../../patches/trailer-codec-index.d.ts.txt', import.meta.url);
const expected = readFileSync(source);
const roots: string[] = [];

function fixture(metadata = '{"name":"@git-stunts/trailer-codec","version":"2.1.1"}') {
  const root = mkdtempSync(join(tmpdir(), 'trailer-declarations-'));
  roots.push(root);
  const directory = join(root, 'node_modules/@git-stunts/trailer-codec');
  mkdirSync(directory, { recursive: true });
  const manifest = join(directory, 'package.json');
  const target = join(directory, 'index.d.ts');
  const runtime = join(directory, 'index.js');
  writeFileSync(manifest, metadata);
  writeFileSync(runtime, 'export const runtime = 42;\n');
  return { root, directory, manifest, target, runtime };
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('reviewed trailer-codec declaration installation', () => {
  it('installs the exact reviewed payload without changing package metadata or JavaScript', () => {
    const input = fixture();
    const manifest = readFileSync(input.manifest);
    const runtime = readFileSync(input.runtime);
    expect(new TrailerCodecDeclarationInstaller(input.root).install()).toEqual({ status: 'installed' });
    expect(readFileSync(input.target)).toEqual(expected);
    expect(readFileSync(input.manifest)).toEqual(manifest);
    expect(readFileSync(input.runtime)).toEqual(runtime);
  });

  it('accepts an identical repeat without rewriting the existing file', () => {
    const input = fixture();
    const installer = new TrailerCodecDeclarationInstaller(input.root);
    installer.install();
    const before = statSync(input.target);
    expect(installer.install()).toEqual({ status: 'unchanged' });
    const after = statSync(input.target);
    expect(after.ino).toBe(before.ino);
    expect(after.mtimeMs).toBe(before.mtimeMs);
    expect(readFileSync(input.target)).toEqual(expected);
  });

  it('refuses conflicting declarations and preserves their exact contents', () => {
    const input = fixture();
    const conflict = 'export const conflicting: true;\n';
    writeFileSync(input.target, conflict);
    expect(new TrailerCodecDeclarationInstaller(input.root).install()).toEqual({
      status: 'refused', reason: 'Conflicting trailer-codec declarations',
    });
    expect(readFileSync(input.target, 'utf8')).toBe(conflict);
  });

  it.each(['identical', 'conflicting'])('preserves a %s competing creation and returns its existing-file result', mode => {
    const input = fixture();
    const winner = mode === 'identical' ? expected : Buffer.from('competing declarations');
    const winnerPath = join(input.root, 'winner.txt');
    writeFileSync(winnerPath, winner);
    const preload = join(input.root, 'competing-write.cjs');
    writeFileSync(preload, `const fs = require('node:fs');
      const write = fs.writeFileSync;
      fs.writeFileSync = (path, contents, options) => {
        if (path === process.env.DECLARATION_TARGET && options?.flag === 'wx') {
          write(path, fs.readFileSync(process.env.DECLARATION_WINNER));
        }
        return write(path, contents, options);
      };
      require('node:module').syncBuiltinESMExports();
    `);
    const script = `const Installer = (await import(process.env.DECLARATION_INSTALLER)).default;
      const result = new Installer(process.env.DECLARATION_ROOT).install();
      console.log(result.status);
      if (result.status === 'refused') console.log(result.reason);
    `;
    const result = spawnSync(process.execPath, ['--require', preload, '--input-type=module', '-e', script], {
      encoding: 'utf8', timeout: 10000,
      env: {
        ...process.env, DECLARATION_ROOT: input.root, DECLARATION_TARGET: input.target,
        DECLARATION_WINNER: winnerPath,
        DECLARATION_INSTALLER: pathToFileURL(resolve('scripts/TrailerCodecDeclarationInstaller.ts')).href,
      },
    });
    expect(result.error).toBeUndefined();
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toBe(mode === 'identical' ? 'unchanged\n' : 'refused\nConflicting trailer-codec declarations\n');
    expect(readFileSync(input.target)).toEqual(winner);
  });

  it.each([
    '{"name":"@git-stunts/trailer-codec","version":"2.1.2"}',
    '{"name":"another-package","version":"2.1.1"}',
    '{"name":"@git-stunts/trailer-codec","version":211}',
    '{}',
  ])('refuses unsupported metadata %s before any declaration write', metadata => {
    const input = fixture(metadata);
    const existing = 'unchanged target\n';
    writeFileSync(input.target, existing);
    expect(new TrailerCodecDeclarationInstaller(input.root).install()).toEqual({
      status: 'refused', reason: 'Expected @git-stunts/trailer-codec@2.1.1',
    });
    expect(readFileSync(input.target, 'utf8')).toBe(existing);
  });

  it('revalidates changed metadata on the same installer instead of trusting the JSON module cache', () => {
    const input = fixture();
    const installer = new TrailerCodecDeclarationInstaller(input.root);
    installer.install();
    writeFileSync(input.manifest, '{"name":"@git-stunts/trailer-codec","version":"3.0.0"}');
    expect(installer.install()).toEqual({ status: 'refused', reason: 'Expected @git-stunts/trailer-codec@2.1.1' });
    expect(readFileSync(input.target)).toEqual(expected);
  });

  it('refuses a modified declaration source before creating the target', () => {
    const input = fixture();
    const altered = join(input.root, 'altered.txt');
    writeFileSync(altered, Buffer.concat([expected, Buffer.from('\n')]));
    expect(new TrailerCodecDeclarationInstaller(input.root, pathToFileURL(altered)).install()).toEqual({
      status: 'refused', reason: 'Reviewed trailer-codec declarations changed',
    });
    expect(() => readFileSync(input.target)).toThrow();
  });

  it('propagates malformed JSON and removed metadata failures without creating declarations', () => {
    const input = fixture('{');
    expect(() => new TrailerCodecDeclarationInstaller(input.root).install()).toThrow(expect.objectContaining({ name: 'SyntaxError' }));
    rmSync(input.manifest);
    expect(() => new TrailerCodecDeclarationInstaller(input.root).install()).toThrow(expect.objectContaining({ code: 'ENOENT' }));
    expect(() => readFileSync(input.target)).toThrow();
  });

  it('refuses a never-present manifest through the native resolution failure', () => {
    const input = fixture();
    rmSync(input.manifest);
    expect(() => new TrailerCodecDeclarationInstaller(input.root).install()).toThrow(expect.objectContaining({ code: 'MODULE_NOT_FOUND' }));
    expect(() => readFileSync(input.target)).toThrow();
  });

  it('propagates an invalid destination without modifying another file', () => {
    const input = fixture();
    mkdirSync(input.target);
    expect(() => new TrailerCodecDeclarationInstaller(input.root).install()).toThrow(expect.objectContaining({ code: 'EISDIR' }));
    expect(statSync(input.target).isDirectory()).toBe(true);
  });
});

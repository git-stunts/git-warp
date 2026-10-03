import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import * as filesystem from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import TrailerCodecDeclarationInstaller from '../../../scripts/TrailerCodecDeclarationInstaller.ts';

// Size: medium. Real package-local filesystem and JSON module boundaries.
// Oracle: exact declarations only; repeats preserve files, refusals never overwrite.
const source = new URL('../../../patches/trailer-codec-index.d.ts.txt', import.meta.url);
const expected = readFileSync(source);
const roots: string[] = [];

vi.mock('node:fs', async () => ({ ...await vi.importActual<typeof import('node:fs')>('node:fs') }));

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

function expectFailureIdentity(operation: () => void, failure: Error | string) {
  let caught = false;
  try { operation(); }
  catch (error) {
    expect(error).toBe(failure);
    caught = true;
  }
  expect(caught).toBe(true);
}

afterEach(() => {
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('reviewed trailer-codec declaration installation', () => {
  it('leaves no public target after a real kernel partial-write failure and permits an unrestricted retry', () => {
    const input = fixture();
    const script = `import assert from 'node:assert/strict';
      import { existsSync, readdirSync } from 'node:fs';
      const Installer = (await import(process.env.DECLARATION_INSTALLER)).default;
      process.on('SIGXFSZ', () => {});
      assert.throws(() => new Installer(process.env.DECLARATION_ROOT).install(), { code: 'EFBIG' });
      assert.equal(existsSync(process.env.DECLARATION_TARGET), false, 'partial declarations became public');
      assert.deepEqual(readdirSync(process.env.DECLARATION_DIRECTORY).sort(), ['index.js', 'package.json']);
      console.log('kernel EFBIG leaves no target or staging');
    `;
    const result = spawnSync('bash', ['-c', 'ulimit -f 1; exec "$1" --input-type=module -e "$2"',
      'declaration-write-fault', process.execPath, script], {
      encoding: 'utf8', timeout: 10000,
      env: {
        ...process.env, DECLARATION_ROOT: input.root, DECLARATION_TARGET: input.target,
        DECLARATION_DIRECTORY: input.directory,
        DECLARATION_INSTALLER: pathToFileURL(resolve('scripts/TrailerCodecDeclarationInstaller.ts')).href,
      },
    });
    expect(result.error).toBeUndefined();
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toBe('kernel EFBIG leaves no target or staging\n');
    expect(existsSync(input.target)).toBe(false);
    expect(new TrailerCodecDeclarationInstaller(input.root).install()).toEqual({ status: 'installed' });
    expect(readFileSync(input.target)).toEqual(expected);
    expect(readdirSync(input.directory).sort()).toEqual(['index.d.ts', 'index.js', 'package.json']);
  });

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

  it('accepts an identical read-only target without requiring package-directory write permission', () => {
    const input = fixture();
    new TrailerCodecDeclarationInstaller(input.root).install();
    const before = statSync(input.target);
    chmodSync(input.root, 0o755);
    chmodSync(input.directory, 0o555);
    chmodSync(input.target, 0o444);
    const script = `const Installer = (await import(process.env.DECLARATION_INSTALLER)).default;
      console.log(new Installer(process.env.DECLARATION_ROOT).install().status);`;
    const identity = process.getuid?.() === 0 ? { uid: 65534, gid: 65534 } : {};
    let result;
    try {
      result = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
        encoding: 'utf8', timeout: 10000, ...identity,
        env: {
          ...process.env, DECLARATION_ROOT: input.root,
          DECLARATION_INSTALLER: pathToFileURL(resolve('scripts/TrailerCodecDeclarationInstaller.ts')).href,
        },
      });
    } finally {
      chmodSync(input.directory, 0o755);
      chmodSync(input.target, 0o644);
    }
    expect(result.error).toBeUndefined();
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toBe('unchanged\n');
    expect(statSync(input.target).ino).toBe(before.ino);
    expect(statSync(input.target).mtimeMs).toBe(before.mtimeMs);
    expect(readdirSync(input.directory).sort()).toEqual(['index.d.ts', 'index.js', 'package.json']);
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
    const preload = join(input.root, 'competing-publication.cjs');
    writeFileSync(preload, `const fs = require('node:fs');
      const link = fs.linkSync;
      fs.linkSync = (staged, target) => {
        if (target === process.env.DECLARATION_TARGET) {
          fs.writeFileSync(target, fs.readFileSync(process.env.DECLARATION_WINNER));
        }
        return link(staged, target);
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
    expect(readdirSync(input.directory).sort()).toEqual(['index.d.ts', 'index.js', 'package.json']);
  });

  it('publishes complete declarations once under concurrent native installers', () => {
    const input = fixture();
    const worker = `const Installer = (await import(process.env.DECLARATION_INSTALLER)).default;
      console.log(new Installer(process.env.DECLARATION_ROOT).install().status);`;
    const script = `import assert from 'node:assert/strict';
      import { spawn } from 'node:child_process';
      import { readFileSync } from 'node:fs';
      const expected = readFileSync(new URL(process.env.DECLARATION_SOURCE));
      let observations = 0;
      const observe = () => {
        try { assert.deepEqual(readFileSync(process.env.DECLARATION_TARGET), expected); observations++; }
        catch (error) { if (error.code !== 'ENOENT') throw error; }
      };
      const timer = setInterval(observe, 1);
      const outcomes = await Promise.all(Array.from({ length: 8 }, () => new Promise((resolve, reject) => {
        const child = spawn(process.execPath, ['--input-type=module', '-e', process.env.DECLARATION_WORKER]);
        let output = ''; let errors = '';
        child.stdout.on('data', chunk => { output += chunk; });
        child.stderr.on('data', chunk => { errors += chunk; });
        child.on('error', reject);
        child.on('close', code => code === 0 ? resolve(output.trim()) : reject(new Error(errors)));
      })));
      clearInterval(timer); observe();
      assert(observations > 0);
      assert.equal(outcomes.filter(value => value === 'installed').length, 1);
      assert.equal(outcomes.filter(value => value === 'unchanged').length, 7);
      console.log('eight native installers publish one complete target');`;
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
      encoding: 'utf8', timeout: 10000,
      env: {
        ...process.env, DECLARATION_ROOT: input.root, DECLARATION_TARGET: input.target,
        DECLARATION_SOURCE: source.href, DECLARATION_WORKER: worker,
        DECLARATION_INSTALLER: pathToFileURL(resolve('scripts/TrailerCodecDeclarationInstaller.ts')).href,
      },
    });
    expect(result.error).toBeUndefined();
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toBe('eight native installers publish one complete target\n');
    expect(readFileSync(input.target)).toEqual(expected);
    expect(readdirSync(input.directory).sort()).toEqual(['index.d.ts', 'index.js', 'package.json']);
  });

  it.each(['opaque', new Error('read failure'), Object.assign(new Error('denied'), { code: 'EACCES' })])(
    'preserves the exact existing-target read failure %s', failure => {
      const input = fixture();
      vi.spyOn(filesystem, 'readFileSync').mockImplementationOnce(() => expected).mockImplementationOnce(() => { throw failure; });
      const create = vi.spyOn(filesystem, 'mkdtempSync');
      expectFailureIdentity(() => new TrailerCodecDeclarationInstaller(input.root).install(), failure);
      expect(create).not.toHaveBeenCalled();
      expect(existsSync(input.target)).toBe(false);
    });

  it('preserves the staging-directory creation failure without touching the target', () => {
    const input = fixture();
    const failure = Object.assign(new Error('staging denied'), { code: 'EACCES' });
    vi.spyOn(filesystem, 'mkdtempSync').mockImplementationOnce(() => { throw failure; });
    expectFailureIdentity(() => new TrailerCodecDeclarationInstaller(input.root).install(), failure);
    expect(existsSync(input.target)).toBe(false);
    expect(readdirSync(input.directory).sort()).toEqual(['index.js', 'package.json']);
  });

  it('removes its partially written private staging and preserves the exact write error', () => {
    const input = fixture();
    const failure = Object.assign(new Error('quota'), { code: 'ENOSPC' });
    const write = filesystem.writeFileSync;
    vi.spyOn(filesystem, 'writeFileSync').mockImplementationOnce(path => {
      write(path, expected.subarray(0, 1024));
      throw failure;
    });
    expectFailureIdentity(() => new TrailerCodecDeclarationInstaller(input.root).install(), failure);
    expect(existsSync(input.target)).toBe(false);
    expect(readdirSync(input.directory).sort()).toEqual(['index.js', 'package.json']);
    expect(new TrailerCodecDeclarationInstaller(input.root).install()).toEqual({ status: 'installed' });
    expect(readFileSync(input.target)).toEqual(expected);
  });

  it.each(['opaque', new Error('link failure'), Object.assign(new Error('denied'), { code: 'EPERM' })])(
    'cleans staging and preserves the exact publication failure %s', failure => {
      const input = fixture();
      vi.spyOn(filesystem, 'linkSync').mockImplementationOnce(() => { throw failure; });
      expectFailureIdentity(() => new TrailerCodecDeclarationInstaller(input.root).install(), failure);
      expect(existsSync(input.target)).toBe(false);
      expect(readdirSync(input.directory).sort()).toEqual(['index.js', 'package.json']);
    });

  it.each(['identical', 'conflicting'])('checks the %s winner at actual publication in the covered module', mode => {
    const input = fixture();
    const winner = mode === 'identical' ? expected : Buffer.from('winner');
    vi.spyOn(filesystem, 'linkSync').mockImplementationOnce((staged, target) => {
      expect(readFileSync(staged)).toEqual(expected);
      expect(statSync(staged).mode & 0o777).toBe(0o644);
      writeFileSync(target, winner);
      throw Object.assign(new Error('existing'), { code: 'EEXIST' });
    });
    expect(new TrailerCodecDeclarationInstaller(input.root).install()).toEqual(mode === 'identical'
      ? { status: 'unchanged' } : { status: 'refused', reason: 'Conflicting trailer-codec declarations' });
    expect(readFileSync(input.target)).toEqual(winner);
    expect(readdirSync(input.directory).sort()).toEqual(['index.d.ts', 'index.js', 'package.json']);
  });

  it('surfaces cleanup failure after complete publication without damaging the published target', () => {
    const input = fixture();
    const cleanup = Object.assign(new Error('cleanup denied'), { code: 'EACCES' });
    vi.spyOn(filesystem, 'rmSync').mockImplementationOnce(() => { throw cleanup; });
    expectFailureIdentity(() => new TrailerCodecDeclarationInstaller(input.root).install(), cleanup);
    expect(readFileSync(input.target)).toEqual(expected);
    expect(readdirSync(input.directory).filter(name => name.startsWith('.trailer-codec-declaration-'))).toHaveLength(1);
    expect(new TrailerCodecDeclarationInstaller(input.root).install()).toEqual({ status: 'unchanged' });
  });

  it.each(['identical', 'conflicting'])('preserves a %s winner when staging cleanup fails', mode => {
    const input = fixture();
    const winner = mode === 'identical' ? expected : Buffer.from('competing winner');
    const cleanup = Object.assign(new Error('cleanup denied'), { code: 'EACCES' });
    vi.spyOn(filesystem, 'linkSync').mockImplementationOnce((_staged, target) => {
      writeFileSync(target, winner);
      throw Object.assign(new Error('existing'), { code: 'EEXIST' });
    });
    vi.spyOn(filesystem, 'rmSync').mockImplementationOnce(() => { throw cleanup; });
    expectFailureIdentity(() => new TrailerCodecDeclarationInstaller(input.root).install(), cleanup);
    expect(readFileSync(input.target)).toEqual(winner);
    expect(readdirSync(input.directory).filter(name => name.startsWith('.trailer-codec-declaration-'))).toHaveLength(1);
  });

  it('retains both operation and cleanup failures by identity when cleanup also fails', () => {
    const input = fixture();
    const operation = Object.assign(new Error('write quota'), { code: 'ENOSPC' });
    const cleanup = Object.assign(new Error('cleanup denied'), { code: 'EACCES' });
    vi.spyOn(filesystem, 'writeFileSync').mockImplementationOnce(() => { throw operation; });
    vi.spyOn(filesystem, 'rmSync').mockImplementationOnce(() => { throw cleanup; });
    let failure: AggregateError | undefined;
    try { new TrailerCodecDeclarationInstaller(input.root).install(); }
    catch (error) {
      if (!(error instanceof AggregateError)) throw error;
      failure = error;
    }
    expect(failure).toBeInstanceOf(AggregateError);
    expect(failure?.errors[0]).toBe(operation);
    expect(failure?.errors[1]).toBe(cleanup);
    expect(existsSync(input.target)).toBe(false);
    expect(readdirSync(input.directory).filter(name => name.startsWith('.trailer-codec-declaration-'))).toHaveLength(1);
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

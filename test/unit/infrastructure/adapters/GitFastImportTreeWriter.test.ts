import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Plumbing from '@git-stunts/plumbing';
import { textDecode, textEncode } from '../../../../src/domain/utils/bytes.ts';
import GitFastImportTreeScript from '../../../../src/infrastructure/adapters/GitFastImportTreeScript.ts';
import GitFastImportTreeWriter, { E_FAST_IMPORT_PROTOCOL } from '../../../../src/infrastructure/adapters/GitFastImportTreeWriter.ts';

const directories: string[] = [];

afterEach(async () => {
  for (const directory of directories.splice(0)) {
    await rm(directory, { recursive: true, force: true });
  }
});

async function repository(): Promise<Plumbing> {
  const directory = await mkdtemp(join(tmpdir(), 'fast-import-tree-'));
  directories.push(directory);
  const plumbing = await Plumbing.createDefault({ cwd: directory });
  await plumbing.execute({ args: ['init', '--quiet'] });
  return plumbing;
}

describe('GitFastImportTreeScript', () => {
  it('encodes a commit program that builds one tree, reports it and leaves no branch', () => {
    const script = new GitFastImportTreeScript();
    script.graft('n', 'a'.repeat(40));
    script.link('e/1', 'b'.repeat(64));
    script.write('d/x', textEncode('bytes'));
    script.remove('a');
    expect(script.operations).toBe(4);
    expect(textDecode(script.encode())).toBe([
      'commit refs/warp/cone-import/staging',
      'committer git-warp <> 0 +0000',
      'data 0',
      `M 040000 ${'a'.repeat(40)} n`,
      `M 100644 ${'b'.repeat(64)} e/1`,
      'M 100644 inline d/x',
      'data 5',
      'bytes',
      'D a',
      'ls ""',
      'reset refs/warp/cone-import/staging',
      'done',
      '',
    ].join('\n'));
  });

  it('refuses paths and object ids that could escape the program', () => {
    const script = new GitFastImportTreeScript();
    expect(() => { script.remove('a\nD b'); }).toThrow(/plain relative path/u);
    expect(() => { script.remove('/a'); }).toThrow(/plain relative path/u);
    expect(() => { script.graft('a', 'HEAD'); }).toThrow(/full lowercase hex id/u);
    expect(script.operations).toBe(0);
  });
});

describe('GitFastImportTreeWriter', () => {
  it('builds the tree in one fast-import process and returns its id', async () => {
    const plumbing = await repository();
    const writer = new GitFastImportTreeWriter({ plumbing });
    const first = new GitFastImportTreeScript();
    first.write('n/a', textEncode('one'));
    first.write('n/b', textEncode('two'));
    const root = await writer.write(first);
    expect(await plumbing.execute({ args: ['ls-tree', '-r', '--name-only', root] })).toBe('n/a\nn/b');
    const family = (await plumbing.execute({ args: ['rev-parse', `${root}:n`] })).trim();
    const execute = vi.spyOn(plumbing, 'execute');
    const second = new GitFastImportTreeScript();
    second.graft('n', family);
    second.remove('n/a');
    second.write('n/c', textEncode('three'));
    const next = await writer.write(second);
    expect(execute).toHaveBeenCalledTimes(1);
    execute.mockRestore();
    expect(await plumbing.execute({ args: ['ls-tree', '-r', '--name-only', next] })).toBe('n/b\nn/c');
    expect(await plumbing.execute({ args: ['for-each-ref'] })).toBe('');
  });

  it('wraps Git failures and refuses output that is not one root line', async () => {
    const failing = new GitFastImportTreeWriter({ plumbing: { execute: vi.fn().mockRejectedValue(new Error('fatal: broken')) } });
    await expect(failing.write(new GitFastImportTreeScript())).rejects.toThrow('fatal: broken');
    const chatty = new GitFastImportTreeWriter({ plumbing: { execute: vi.fn().mockResolvedValue('040000 tree abc\t\nmore') } });
    await expect(chatty.write(new GitFastImportTreeScript())).rejects.toMatchObject({ code: E_FAST_IMPORT_PROTOCOL });
  });
});

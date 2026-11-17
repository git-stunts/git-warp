import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Plumbing from '@git-stunts/plumbing';
import { textDecode, textEncode } from '../../../../src/domain/utils/bytes.ts';
import type RandomPort from '../../../../src/ports/RandomPort.ts';
import GitFastImportTreeScript from '../../../../src/infrastructure/adapters/GitFastImportTreeScript.ts';
import GitFastImportTreeWriter, { E_FAST_IMPORT_PROTOCOL } from '../../../../src/infrastructure/adapters/GitFastImportTreeWriter.ts';
import RepositoryObjectCensus from '../../../helpers/RepositoryObjectCensus.ts';
import SequenceRandomPort from '../../../helpers/SequenceRandomPort.ts';

const OLD_SECONDS = 946_684_800; // 2000-01-01T00:00:00Z, the age stamped on old garbage
const KEEP = '1999-01-01 00:00:00 +0000'; // older than the stamp: the garbage stays, in a cruft pack
const DROP = '2000-06-01 00:00:00 +0000'; // newer than the stamp: garbage that nothing recent reaches goes

const directories: string[] = [];

afterEach(async () => {
  for (const directory of directories.splice(0)) {
    await rm(directory, { recursive: true, force: true });
  }
});

async function repository(): Promise<{ readonly plumbing: Plumbing; readonly directory: string }> {
  const directory = await mkdtemp(join(tmpdir(), 'fast-import-tree-'));
  directories.push(directory);
  const plumbing = await Plumbing.createDefault({ cwd: directory });
  await plumbing.execute({ args: ['init', '--quiet'] });
  return { plumbing, directory };
}

function present(directory: string, object: string): boolean {
  return spawnSync('git', ['cat-file', '-e', object], { cwd: directory }).status === 0;
}

function gcCruft(directory: string, prune: string): void {
  execFileSync('git', ['gc', '--cruft', `--prune=${prune}`, '--quiet'], { cwd: directory });
}

describe('GitFastImportTreeScript', () => {
  it('encodes a commit program that builds one tree, reports it and leaves no branch', () => {
    const script = new GitFastImportTreeScript();
    script.graft('n', 'a'.repeat(40));
    script.link('e/1', 'b'.repeat(64));
    script.write('d/x', textEncode('bytes'));
    script.remove('a');
    expect(script.operations).toBe(4);
    expect(textDecode(script.encode(textEncode('n0nce')))).toBe([
      'commit refs/warp/cone-import/staging',
      'committer git-warp <> 0 +0000',
      'data 5',
      'n0nce',
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
    const { plumbing } = await repository();
    const writer = new GitFastImportTreeWriter({ plumbing, random: new SequenceRandomPort() });
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

  it('keeps a tree it rebuilt from old garbage through a GC that runs before any ref names it (#1127)', async () => {
    const { plumbing, directory } = await repository();
    const writer = new GitFastImportTreeWriter({ plumbing, random: new SequenceRandomPort() });
    const program = (): GitFastImportTreeScript => {
      const script = new GitFastImportTreeScript();
      script.write('n/a', textEncode('one'));
      return script;
    };
    const root = await writer.write(program());
    new RepositoryObjectCensus(directory).stampLoose(OLD_SECONDS);
    gcCruft(directory, KEEP);
    // Only a cruft pack holds the tree now, with its old age; fast-import reuses it without a refresh.
    expect(new RepositoryObjectCensus(directory).loose().has(root)).toBe(false);

    expect(await writer.write(program())).toBe(root);
    gcCruft(directory, DROP);

    // Oracle: git-gc(1) NOTES, an object newer than the prune date keeps everything reachable from it.
    expect(present(directory, root)).toBe(true);
    expect(present(directory, `${root}:n/a`)).toBe(true);
  });

  it('wraps Git failures and refuses output that is not one root line', async () => {
    const failing = new GitFastImportTreeWriter({ plumbing: { execute: vi.fn().mockRejectedValue(new Error('fatal: broken')) }, random: new SequenceRandomPort() });
    await expect(failing.write(new GitFastImportTreeScript())).rejects.toThrow('fatal: broken');
    const chatty = new GitFastImportTreeWriter({ plumbing: { execute: vi.fn().mockResolvedValue('040000 tree abc\t\nmore') }, random: new SequenceRandomPort() });
    await expect(chatty.write(new GitFastImportTreeScript())).rejects.toMatchObject({ code: E_FAST_IMPORT_PROTOCOL });
  });

  it.each([
    ['no bytes', (): number => 0],
    ['one byte fewer than it asked for', (requested: number): number => requested - 1],
  ])('refuses to run a program when the random port returns %s, so the staging commit cannot fall back to a fixed one (#1127)', async (_case, size) => {
    const execute = vi.fn().mockResolvedValue(`040000 tree ${'a'.repeat(40)}\t`);
    const short: RandomPort = { randomBytes: (requested) => new Uint8Array(size(requested)) };
    const writer = new GitFastImportTreeWriter({ plumbing: { execute }, random: short });

    await expect(writer.write(new GitFastImportTreeScript())).rejects.toMatchObject({ code: 'E_ENTROPY_WRONG_LENGTH' });
    expect(execute).not.toHaveBeenCalled();
  });
});

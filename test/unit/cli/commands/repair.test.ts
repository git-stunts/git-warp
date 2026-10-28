import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import handleRepair from '../../../../bin/cli/commands/repair.ts';
import { closeCliStorages } from '../../../../bin/cli/shared.ts';
import type { CliOptions } from '../../../../bin/cli/types.ts';
import { Runtime } from '../../../../index.ts';
import Intent from '../../../../src/domain/api/Intent.ts';

describe('git warp repair (#1039)', () => {
  let repository: string;
  let options: CliOptions;

  beforeEach(async () => {
    repository = mkdtempSync(join(tmpdir(), 'git-warp-repair-'));
    execFileSync('git', ['init', '-q', repository]);
    options = { repo: repository, lane: 'users', strand: null, writer: 'cli', writerExplicit: true, json: true, jsonl: false, help: false };
    const runtime = await Runtime.open({ at: repository, writer: 'cli' });
    try {
      const lane = await runtime.lane('users');
      await lane.write(Intent.addNode({ subject: 'user:alice' }));
      await lane.write(Intent.addNode({ subject: 'user:bob' }));
    } finally {
      await runtime.close();
    }
  });

  afterEach(async () => {
    await closeCliStorages();
    rmSync(repository, { recursive: true, force: true });
  });

  function git(...args: string[]): string {
    return execFileSync('git', ['-C', repository, ...args], { encoding: 'utf8' }).trim();
  }

  it('advances the cone basis, reporting the patches it folded and none the second time', async () => {
    // Writes fold their own patches; drop the clone-local head as a large fetch would leave it behind.
    git('update-ref', '-d', 'refs/warp/users/cone/head');
    const first = await handleRepair({ options, args: ['--action', 'basis'] });
    expect(first).toMatchObject({
      exitCode: 0,
      payload: { type: 'Repair', action: 'basis', lane: 'users', status: 'completed', foldedPatches: 2, writers: 1 },
    });
    expect(git('for-each-ref', '--format=%(refname)', 'refs/warp/users/checkpoints/')).toBe('');
    const second = await handleRepair({ options, args: ['--action', 'basis'] });
    expect(second.payload).toMatchObject({ status: 'completed', foldedPatches: 0, writers: 1 });
    expect(JSON.parse(second.human)).toEqual(second.payload);
  });

  it('advances a strand Lane basis: its pinned base plus its own writer chain', async () => {
    const runtime = await Runtime.open({ at: repository, writer: 'cli' });
    try {
      const strand = await runtime.fork(await runtime.lane('users'), { name: 'draft' });
      await strand.write(Intent.setProperty({ subject: 'user:alice', key: 'role', value: 'admin' }));
    } finally {
      await runtime.close();
    }
    const result = await handleRepair({ options: { ...options, strand: 'draft' }, args: ['--action', 'basis'] });
    expect(result.payload).toMatchObject({ lane: 'draft', status: 'completed', foldedPatches: 0, writers: 2 });
  });

  it('reports an obstructed basis with its repair hint and a failing exit code', async () => {
    await handleRepair({ options, args: ['--action', 'basis'] });
    const stray = git('-c', 'user.email=repair@test.invalid', '-c', 'user.name=Repair Test', 'commit-tree', git('hash-object', '-t', 'tree', '-w', '/dev/null'), '-m', 'not a patch');
    git('update-ref', 'refs/warp/users/writers/cli', stray);
    const result = await handleRepair({ options, args: ['--action', 'basis'] });
    expect(result).toMatchObject({
      exitCode: 3,
      payload: { status: 'obstructed', reason: 'cone_writer_diverged', repairHints: [{ code: 'rebuild_cone_basis' }] },
    });
  });

  it('keeps the whole-state checkpoint as an explicit global maintenance action', async () => {
    const result = await handleRepair({ options, args: ['--action', 'materialization'] });
    expect(result).toMatchObject({ exitCode: 0, payload: { action: 'materialization', status: 'completed' } });
    expect(git('for-each-ref', '--format=%(refname)', 'refs/warp/users/checkpoints/')).toBe('refs/warp/users/checkpoints/head');
    await expect(handleRepair({ options, args: ['--action', 'everything'] })).rejects.toMatchObject({ exitCode: 1 });
  });
});

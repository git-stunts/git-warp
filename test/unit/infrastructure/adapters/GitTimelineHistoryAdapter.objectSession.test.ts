import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Plumbing from '@git-stunts/plumbing';
import PersistenceError from '../../../../src/domain/errors/PersistenceError.ts';
import { createGitCasRetryPolicy } from '../../../../src/infrastructure/adapters/GitCasRetryPolicy.ts';
import { assertBlobExistsForEmptyRead } from '../../../../src/infrastructure/adapters/GitEmptyBlobProbe.ts';
import { E_REF_LISTING_MALFORMED, parseRefTargetListing } from '../../../../src/infrastructure/adapters/GitRefTargetListing.ts';
import GitTimelineHistoryAdapter from '../../../../src/infrastructure/adapters/GitTimelineHistoryAdapter.ts';
import OperationPolicyPort, { type OperationPolicyExecuteOptions } from '../../../../src/ports/OperationPolicyPort.ts';

class RecordingPolicy extends OperationPolicyPort {
  readonly options: Array<OperationPolicyExecuteOptions | undefined> = [];

  override async execute<T>(operation: () => Promise<T>, options?: OperationPolicyExecuteOptions): Promise<T> {
    this.options.push(options);
    return await operation();
  }

  override async stream<T>(operation: () => Promise<AsyncIterable<T>>): Promise<AsyncIterable<T>> {
    return await operation();
  }
}

const directories: string[] = [];
const histories: GitTimelineHistoryAdapter[] = [];

afterEach(async () => {
  for (const history of histories.splice(0)) {
    await history.close();
  }
  for (const directory of directories.splice(0)) {
    await rm(directory, { recursive: true, force: true });
  }
});

async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'history-session-'));
  directories.push(directory);
  const plumbing = await Plumbing.createDefault({ cwd: directory });
  await plumbing.execute({ args: ['init', '--quiet'] });
  const history = new GitTimelineHistoryAdapter({ plumbing });
  histories.push(history);
  return { plumbing, history };
}

describe('GitTimelineHistoryAdapter object session reads', () => {
  it('lists tree entries through the object session without a process per read', async () => {
    const { plumbing, history } = await fixture();
    const blob = await history.writeBlob('content');
    const inner = await history.writeTree([`100644 blob ${blob}\tleaf`]);
    const tree = await history.writeTree([`040000 tree ${inner}\tdir`, `100644 blob ${blob}\tfile`]);
    expect(await history.readTreeObjectEntries(tree)).toEqual([
      { mode: '040000', type: 'tree', oid: inner, name: 'dir' },
      { mode: '100644', type: 'blob', oid: blob, name: 'file' },
    ]);
    const streams = vi.spyOn(plumbing, 'executeStream');
    expect(await history.readTreeObjectEntries(inner)).toEqual([{ mode: '100644', type: 'blob', oid: blob, name: 'leaf' }]);
    expect(streams).not.toHaveBeenCalled();
    streams.mockRestore();
    await expect(history.readTreeObjectEntries('f'.repeat(40))).rejects.toThrow();
    await expect(history.readTreeObjectEntries('not an oid')).rejects.toThrow();
  });

  it('reads every ref target under a prefix with one for-each-ref', async () => {
    const { plumbing, history } = await fixture();
    const commit = await history.writeBlob('tip');
    await history.updateRef('refs/warp/l/writers/a', commit);
    await history.updateRef('refs/warp/l/writers/b', commit);
    await history.updateRef('refs/warp/other/writers/c', commit);
    const execute = vi.spyOn(plumbing, 'execute');
    expect(await history.readRefTargets('refs/warp/l/writers/')).toEqual(new Map([
      ['refs/warp/l/writers/a', commit], ['refs/warp/l/writers/b', commit],
    ]));
    expect(execute).toHaveBeenCalledTimes(1);
    execute.mockRejectedValueOnce(new Error('fatal: broken repository'));
    await expect(history.readRefTargets('refs/warp/l/writers/')).rejects.toThrow('fatal: broken repository');
    execute.mockRestore();
    expect(await history.readRefTargets('refs/warp/none/')).toEqual(new Map());
  });
});

describe('ref target listing', () => {
  it('parses object id and ref name lines and refuses anything else', () => {
    const oid = 'a'.repeat(40);
    expect(parseRefTargetListing(`${oid} refs/x\n\n${'b'.repeat(64)} refs/y\n`, 'refs/')).toEqual(new Map([['refs/x', oid], ['refs/y', 'b'.repeat(64)]]));
    expect(() => parseRefTargetListing('refs/x', 'refs/')).toThrow(expect.objectContaining({ code: E_REF_LISTING_MALFORMED }));
  });
});

describe('empty blob probe', () => {
  it('passes for a present object, reports a missing one and wraps other failures', async () => {
    await expect(assertBlobExistsForEmptyRead(async () => '', 'a'.repeat(40))).resolves.toBeUndefined();
    const missing = Object.assign(new Error(''), { details: { code: 1, stderr: '' } });
    await expect(assertBlobExistsForEmptyRead(async () => { throw missing; }, 'a'.repeat(40)))
      .rejects.toMatchObject({ code: PersistenceError.E_MISSING_OBJECT });
    await expect(assertBlobExistsForEmptyRead(async () => { throw new Error('fatal: corrupt pack'); }, 'a'.repeat(40)))
      .rejects.toThrow('fatal: corrupt pack');
  });

  it('confirms an empty blob read through the history with one existence probe', async () => {
    const { plumbing, history } = await fixture();
    const empty = await history.writeBlob(new Uint8Array());
    const executions = vi.spyOn(plumbing, 'execute');
    expect(await history.readBlob(empty)).toEqual(new Uint8Array());
    expect(executions.mock.calls.map((call) => call[0].args.slice(0, 2))).toEqual([['cat-file', '-e']]);
  });
});

describe('git-cas retry policy', () => {
  it('runs each git-cas operation through the git-warp policy with its retry options', async () => {
    const recording = new RecordingPolicy();
    const policy = createGitCasRetryPolicy(recording, { retries: 2 });
    expect(await policy.execute(async () => 'done')).toBe('done');
    expect(recording.options).toEqual([{ retries: 2 }]);
  });
});

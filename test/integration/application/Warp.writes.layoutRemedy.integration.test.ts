import { afterEach, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import UnsupportedWriteAttemptLayoutError from '../../../src/domain/errors/UnsupportedWriteAttemptLayoutError.ts';
import { buildWriteAttemptRef } from '../../../src/domain/utils/WriteAttemptRefLayout.ts';
import { disposeWarpFixtures, git, repository } from '../../helpers/WarpWriteFixture.ts';

afterEach(async () => {
  await disposeWarpFixtures();
});

const ATTEMPT = 'a'.repeat(32);
const REMEDY = 'git update-ref -d ';

function refs(path: string): string[] {
  return git(path, ['for-each-ref', '--format=%(refname)']).split('\n');
}

describe('the layout-1 remedy, pasted into a shell', () => {
  it.each(['team$prod', 'x`id', 'a(b)', "it's"])('deletes only the named ref of graph %s', async (graph) => {
    const path = await repository();
    const blob = execFileSync('git', ['hash-object', '-w', '--stdin'], { cwd: path, input: 'record' }).toString().trim();
    const ref = buildWriteAttemptRef(graph, ATTEMPT);
    const kept = buildWriteAttemptRef(graph, 'b'.repeat(32));
    git(path, ['update-ref', ref, blob]);
    git(path, ['update-ref', kept, blob]);
    const { message } = new UnsupportedWriteAttemptLayoutError({ ref, version: 1, writer: 'alice', readable: 2 });

    execFileSync('sh', ['-c', message.slice(message.indexOf(REMEDY))], { cwd: path });

    expect(refs(path)).toEqual([kept]);
  });
});

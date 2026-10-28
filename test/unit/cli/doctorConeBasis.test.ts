import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Plumbing from '@git-stunts/plumbing';
import { CODES } from '../../../bin/cli/commands/doctor/codes.ts';
import { checkConeBasisLag } from '../../../bin/cli/commands/doctor/checksConeBasis.ts';
import { checkCoverageComplete } from '../../../bin/cli/commands/doctor/checks.ts';
import type { DoctorContext } from '../../../bin/cli/commands/doctor/types.ts';
import ConeBasis from '../../../src/domain/services/cone/ConeBasis.ts';
import ConeBasisHead from '../../../src/domain/services/cone/ConeBasisHead.ts';
import ConeFrontier from '../../../src/domain/services/cone/ConeFrontier.ts';
import ConeRoot from '../../../src/domain/services/cone/ConeRoot.ts';
import ConeWriterPosition from '../../../src/domain/services/cone/ConeWriterPosition.ts';
import GitTimelineHistoryAdapter from '../../../src/infrastructure/adapters/GitTimelineHistoryAdapter.ts';
import HookPathPort from '../../../src/ports/HookPathPort.ts';
import InMemoryConeRecordStore from '../../helpers/InMemoryConeRecordStore.ts';

class UnusedHookPaths extends HookPathPort {
  override resolveHooksDir(): Promise<string> {
    return Promise.reject(new Error('unused hook path'));
  }
}

const directories: string[] = [];
afterEach(async () => {
  for (const directory of directories.splice(0)) {
    await rm(directory, { recursive: true, force: true });
  }
});

/** A repository with two linear writer chains: alice has 5 commits, bob 3. */
async function repository() {
  const directory = await mkdtemp(join(tmpdir(), 'doctor-cone-'));
  directories.push(directory);
  const plumbing = await Plumbing.createDefault({ cwd: directory });
  await plumbing.execute({ args: ['init', '--quiet'] });
  await plumbing.execute({ args: ['config', 'user.email', 'doctor@test.invalid'] });
  await plumbing.execute({ args: ['config', 'user.name', 'Doctor Test'] });
  const history = new GitTimelineHistoryAdapter({ plumbing });
  const chain = async (writer: string, length: number): Promise<string[]> => {
    const shas: string[] = [];
    for (let index = 0; index < length; index += 1) {
      const parent = shas[shas.length - 1];
      shas.push(await history.commitNode({ message: `${writer} ${index}`, parents: parent === undefined ? [] : [parent] }));
    }
    return shas;
  };
  return { history, alice: await chain('alice', 5), bob: await chain('bob', 3), stray: await chain('stray', 1) };
}

function context(
  repo: Awaited<ReturnType<typeof repository>>,
  options: { readonly folded: ReadonlyMap<string, string> | null; readonly warnAt?: number; readonly withCone?: boolean },
): DoctorContext {
  const store = new InMemoryConeRecordStore();
  if (options.folded !== null) {
    let frontier = ConeFrontier.empty();
    for (const [writer, sha] of options.folded) { frontier = frontier.advanced(writer, new ConeWriterPosition(sha, 1)); }
    store.forceHead(ConeBasisHead.forLane('demo'), new ConeBasis(ConeRoot.empty(), frontier));
  }
  return {
    persistence: repo.history, stateCache: null, materializationCacheDiagnostics: null,
    coneRecords: options.withCone === false ? null : store, graphName: 'demo',
    writerHeads: [
      { writerId: 'alice', sha: repo.alice[4] ?? null, ref: 'refs/warp/demo/writers/alice' },
      { writerId: 'bob', sha: repo.bob[2] ?? null, ref: 'refs/warp/demo/writers/bob' },
      { writerId: 'dangling', sha: null, ref: 'refs/warp/demo/writers/dangling' },
    ],
    policy: { strict: false, clockSkewMs: 0, coneBasisLagWarnPatches: options.warnAt ?? 10_000, globalDeadlineMs: 0, checkTimeouts: {} },
    repoPath: '.', hookPaths: new UnusedHookPaths(),
  };
}

describe('doctor cone-basis-lag (#1039)', () => {
  it('reports a current basis when every writer tip is folded', async () => {
    const repo = await repository();
    const finding = await checkConeBasisLag(context(repo, { folded: new Map([['alice', repo.alice[4] ?? ''], ['bob', repo.bob[2] ?? '']]) }));
    expect(finding).toMatchObject({ status: 'ok', code: CODES.CONE_BASIS_CURRENT, evidence: { writers: 2 } });
  });

  it('counts the patches each writer has past its folded position, and warns past the threshold', async () => {
    const repo = await repository();
    const pending = await checkConeBasisLag(context(repo, { folded: new Map([['alice', repo.alice[2] ?? '']]) }));
    expect(pending).toMatchObject({
      status: 'ok', code: CODES.CONE_BASIS_LAGGING,
      evidence: { unfoldedPatches: 5, unfolded: { alice: 2, bob: 3 } },
    });
    expect(pending.fix).toContain('--action basis');
    const lagging = await checkConeBasisLag(context(repo, { folded: null, warnAt: 4 }));
    expect(lagging).toMatchObject({ status: 'warn', code: CODES.CONE_BASIS_LAGGING, evidence: { unfoldedPatches: 8 } });
  });

  it('fails a writer chain that no longer extends what the basis folded', async () => {
    const repo = await repository();
    const finding = await checkConeBasisLag(context(repo, { folded: new Map([['alice', repo.stray[0] ?? '']]) }));
    expect(finding).toMatchObject({ status: 'fail', code: CODES.CONE_BASIS_DIVERGED, evidence: { divergedWriters: ['alice'] } });
  });

  it('warns about storage without cone records and reports internal errors', async () => {
    const repo = await repository();
    expect(await checkConeBasisLag(context(repo, { folded: null, withCone: false })))
      .toMatchObject({ status: 'warn', code: CODES.CONE_BASIS_UNAVAILABLE });
    const counts = vi.spyOn(repo.history, 'countNodes').mockRejectedValueOnce(new Error('git unavailable'));
    expect(await checkConeBasisLag(context(repo, { folded: null })))
      .toMatchObject({ status: 'fail', code: CODES.CHECK_INTERNAL_ERROR, message: 'Internal error: git unavailable' });
    counts.mockRejectedValueOnce('not an error');
    expect(await checkConeBasisLag(context(repo, { folded: null }))).toMatchObject({ message: 'Internal error: not an error' });
  });
});

describe('doctor coverage-complete without a coverage anchor (#1039)', () => {
  it('reports the absent anchor as fine: only the global checkpoint maintenance writes one', async () => {
    const repo = await repository();
    const finding = await checkCoverageComplete(context(repo, { folded: null }));
    expect(finding).toMatchObject({ status: 'ok', code: CODES.COVERAGE_NO_REF });
    expect(finding.fix).toBeUndefined();
  });
});

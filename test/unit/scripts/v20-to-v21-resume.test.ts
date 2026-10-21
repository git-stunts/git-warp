import { execFileSync } from 'node:child_process';
import { rm } from 'node:fs/promises';

import { afterEach, describe, expect, it } from 'vitest';

import { getDefaultRuntimeHostNodePorts } from '../../../src/application/RuntimeHostNodeDefaults.ts';
import { Dot } from '../../../src/domain/crdt/Dot.ts';
import Patch from '../../../src/domain/types/Patch.ts';
import NodeAdd from '../../../src/domain/types/ops/NodeAdd.ts';
import GitCasRepositoryAdapter from '../../../src/infrastructure/adapters/GitCasRepositoryAdapter.ts';
import { openDefaultGitPlumbing } from '../../../src/infrastructure/adapters/GitPlumbingRuntimeAdapter.ts';
import GitTimelineHistoryAdapter from '../../../src/infrastructure/adapters/GitTimelineHistoryAdapter.ts';
import { PRE_WORLDLINE_MARKER } from '../../../scripts/v20-to-v21/V21LegacyGraph.ts';
import type { V21MigrationOutcome } from '../../../scripts/v20-to-v21/V21Migration.ts';
import V21MigrationSession from '../../../scripts/v20-to-v21/V21MigrationSession.ts';
import { parseV21MigrationCliOptions, runV21MigrationCli } from '../../../scripts/v20-to-v21/migrate.ts';
import {
  readV19PreWorldlineManifest,
  restoreV19PreWorldlineFixture,
  withFixtureHost,
} from '../../helpers/V19PreWorldlineFixture.ts';

function git(repository: string, args: readonly string[], input?: string): string {
  return execFileSync('git', ['-C', repository, ...args], { encoding: 'utf8', ...(input === undefined ? {} : { input }) }).trim();
}

async function migrate(repository: string, graph: string, owners = new Map<string, string>()): Promise<V21MigrationOutcome> {
  const session = await V21MigrationSession.open(repository);
  try {
    return await session.migrate(graph, owners);
  } finally {
    await session.close();
  }
}

function strandIds(outcome: V21MigrationOutcome): string[] {
  return outcome.status === 'refused' ? [] : outcome.record.strands.map((strand) => strand.strandId ?? '').sort();
}

/** Appends a lane patch the way a still-running v20 process would: with a reused counter. */
async function appendLegacyLanePatch(repository: string, graph: string, writerId: string, counter: number): Promise<string> {
  const plumbing = await openDefaultGitPlumbing(repository);
  const history = new GitTimelineHistoryAdapter({ plumbing });
  const repo = new GitCasRepositoryAdapter({ plumbing, history });
  try {
    const ports = getDefaultRuntimeHostNodePorts();
    const services = repo.createMigrationStorageServices({
      timelineName: graph, codec: ports.codec, crypto: ports.crypto, commitMessageCodec: ports.commitMessageCodec,
    });
    const targetRef = `refs/warp/${graph}/writers/${writerId}`;
    const head = await history.readRef(targetRef);
    const published = await services.patchJournal.appendPatch({
      patch: new Patch({ writer: writerId, lamport: 500, context: { [writerId]: counter }, ops: [new NodeAdd('late:v20', new Dot(writerId, counter))] }),
      graph, writer: writerId, targetRef, expectedHead: head, parent: head, attachments: [],
    });
    return published.sha;
  } finally {
    await repo.close();
    await history.close();
  }
}

describe('v20-to-v21 migration resume, late writes and CLI (#1015)', () => {
  const repositories: string[] = [];

  async function restore(): Promise<string> {
    const repository = await restoreV19PreWorldlineFixture(await readV19PreWorldlineManifest());
    repositories.push(repository);
    return repository;
  }

  afterEach(async () => {
    await Promise.all(repositories.splice(0).map(async (repository) => await rm(repository, { recursive: true, force: true })));
  });

  it('a run interrupted before the marker advanced resumes to the same strand ids and strand views', async () => {
    const repository = await restore();
    const first = await migrate(repository, 'braided');
    const writerRefs = git(repository, ['for-each-ref', '--format=%(refname)', 'refs/warp/braided/strands/']);
    // Interrupt: put the marker back and rewind one converted chain, as a crash would leave them.
    git(repository, ['update-ref', 'refs/warp/braided/substrate-version', git(repository, ['hash-object', '-w', '--stdin'], PRE_WORLDLINE_MARKER)]);
    const chainRef = writerRefs.split('\n').find((ref) => ref.includes('/writers/')) ?? '';
    git(repository, ['update-ref', '-d', chainRef]);

    const resumed = await migrate(repository, 'braided');

    expect(resumed.status).toBe('migrated');
    expect(strandIds(resumed)).toEqual(strandIds(first));
    expect(git(repository, ['for-each-ref', '--format=%(refname)', 'refs/warp/braided/strands/'])).toBe(writerRefs);
    await withFixtureHost(repository, 'braided', 'migration-reader', async (host) => {
      expect([...(await host.materializeStrand('main-work')).nodeAlive.elements()].sort()).toEqual(['base:1', 'support:1', 'work:1']);
    });
  });

  it('reports late lane commits beyond the migration frontier and flags counters a v20 writer reused', async () => {
    const repository = await restore();
    await migrate(repository, 'counter-reset');
    const late = await appendLegacyLanePatch(repository, 'counter-reset', 'alice', 7);

    const session = await V21MigrationSession.open(repository);
    try {
      expect(await session.lateWrites('counter-reset')).toEqual({
        graph: 'counter-reset',
        lanes: [{ writerId: 'alice', commits: [late], reusedDots: [`alice:7@${late}`], rewritten: false }],
        strands: [],
      });
    } finally {
      await session.close();
    }
  });

  it('reports a legacy strand ref that moved after migration, which v21 never reads', async () => {
    const repository = await restore();
    await migrate(repository, 'collision');
    const recorded = git(repository, ['rev-parse', 'refs/warp/collision/strand-overlays/next']);
    const moved = git(repository, ['rev-parse', 'refs/warp/collision/writers/alice']);
    git(repository, ['update-ref', 'refs/warp/collision/strand-overlays/next', moved]);

    const session = await V21MigrationSession.open(repository);
    try {
      expect((await session.lateWrites('collision'))?.strands).toEqual([
        { ref: 'refs/warp/collision/strand-overlays/next', recorded, current: moved },
      ]);
    } finally {
      await session.close();
    }
  });

  it('the CLI prints one JSON report per graph and exits 1 when a graph is refused', async () => {
    const repository = await restore();
    const lines: string[] = [];

    expect(parseV21MigrationCliOptions(['--repo', repository, '--graph', 'ownerless', '--assign-owner', 'orphan=alice']).assignOwners)
      .toEqual(new Map([['orphan', 'alice']]));
    expect(() => parseV21MigrationCliOptions(['--graph', 'x'])).toThrow(/--repo is required/);
    expect(await runV21MigrationCli(parseV21MigrationCliOptions(['--repo', repository, '--graph', 'ownerless']), (line) => lines.push(line))).toBe(1);
    expect(await runV21MigrationCli(parseV21MigrationCliOptions(['--repo', repository, '--graph', 'golden']), (line) => lines.push(line))).toBe(0);
    expect(lines.map((line) => JSON.parse(line) as { graph: string; status: string }).map(({ graph, status }) => [graph, status]))
      .toEqual([['ownerless', 'refused'], ['golden', 'migrated']]);
  });
});

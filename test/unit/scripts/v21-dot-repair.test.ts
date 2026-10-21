import { rm } from 'node:fs/promises';

import { afterEach, describe, expect, it } from 'vitest';

import { getDefaultRuntimeHostNodePorts } from '../../../src/application/RuntimeHostNodeDefaults.ts';
import Patch from '../../../src/domain/types/Patch.ts';
import NodeAdd from '../../../src/domain/types/ops/NodeAdd.ts';
import NodeRemove from '../../../src/domain/types/ops/NodeRemove.ts';
import GitCasRepositoryAdapter from '../../../src/infrastructure/adapters/GitCasRepositoryAdapter.ts';
import { openDefaultGitPlumbing } from '../../../src/infrastructure/adapters/GitPlumbingRuntimeAdapter.ts';
import GitTimelineHistoryAdapter from '../../../src/infrastructure/adapters/GitTimelineHistoryAdapter.ts';
import V21MigrationSession from '../../../scripts/v20-to-v21/V21MigrationSession.ts';
import {
  readV19PreWorldlineManifest,
  restoreV19PreWorldlineFixture,
  withFixtureHost,
} from '../../helpers/V19PreWorldlineFixture.ts';

async function migrated(graph: string): Promise<string> {
  const repository = await restoreV19PreWorldlineFixture(await readV19PreWorldlineManifest());
  const session = await V21MigrationSession.open(repository);
  try {
    expect((await session.migrate(graph, new Map())).status).toBe('migrated');
  } finally {
    await session.close();
  }
  return repository;
}

async function visible(repository: string, graph: string): Promise<string[]> {
  return await withFixtureHost(repository, graph, 'reader', async (host) => [...(await host.materialize()).nodeAlive.elements()].sort());
}

/** Appends a remove an offline replica made before the repair: it observed only the shared dot. */
async function appendPendingRemove(repository: string, graph: string, node: string, observedDot: string): Promise<void> {
  const plumbing = await openDefaultGitPlumbing(repository);
  const history = new GitTimelineHistoryAdapter({ plumbing });
  const repo = new GitCasRepositoryAdapter({ plumbing, history });
  try {
    const ports = getDefaultRuntimeHostNodePorts();
    const services = repo.createMigrationStorageServices({
      timelineName: graph, codec: ports.codec, crypto: ports.crypto, commitMessageCodec: ports.commitMessageCodec,
    });
    await services.patchJournal.appendPatch({
      patch: new Patch({ writer: 'offline', lamport: 900, context: { alice: 1 }, ops: [new NodeRemove(node, [observedDot])] }),
      graph, writer: 'offline', targetRef: `refs/warp/${graph}/writers/offline`, expectedHead: null, parent: null, attachments: [],
    });
  } finally {
    await repo.close();
    await history.close();
  }
}

describe('duplicate-dot repair (#1022)', () => {
  const repositories: string[] = [];

  afterEach(async () => {
    await Promise.all(repositories.splice(0).map(async (repository) => await rm(repository, { recursive: true, force: true })));
  });

  it('dot-reuse: previews, separates the members, and replays to the same patch set', async () => {
    const repository = await migrated('dot-reuse');
    repositories.push(repository);
    await withFixtureHost(repository, 'dot-reuse', 'alice', async (host) => {
      expect(await host.previewDotRepair()).toEqual([expect.objectContaining({
        dot: 'alice:1',
        scope: 'lane',
        repairable: true,
        resolvedBy: null,
        members: [
          expect.objectContaining({ target: 'note:first', visible: true }),
          expect.objectContaining({ target: 'note:second', visible: true }),
        ],
        options: [
          expect.objectContaining({ policy: 'separate', reAdds: ['note:first', 'note:second'] }),
          expect.objectContaining({ policy: 'restore', reAdds: 'selected' }),
        ],
      })]);

      const first = await host.applyDotRepair({ dot: 'alice:1', policy: 'separate' });
      const replayed = await host.applyDotRepair({ dot: 'alice:1', policy: 'separate' });

      expect(first.repairWriter).toBe('repair.alice');
      expect(replayed).toEqual(first);
      expect(await host.getWriterPatches('repair.alice')).toHaveLength(1);
      expect((await host.previewDotRepair())[0]?.resolvedBy).toBe(first.repairId);
    });
    expect(await visible(repository, 'dot-reuse')).toEqual(['note:first', 'note:second']);
  });

  it('dot-reuse-tombstone: restores the selected collateral victim and replays to the same patch set', async () => {
    const repository = await migrated('dot-reuse-tombstone');
    repositories.push(repository);
    await withFixtureHost(repository, 'dot-reuse-tombstone', 'alice', async (host) => {
      const [preview] = await host.previewDotRepair();
      expect(preview?.members.map((member) => [member.target, member.visible])).toEqual([['note:drop', false], ['note:keep', false]]);
      await expect(host.applyDotRepair({ dot: 'alice:1', policy: 'separate' })).rejects.toMatchObject({ code: 'E_DOT_REPAIR_EMPTY' });

      const restored = await host.applyDotRepair({ dot: 'alice:1', policy: 'restore', targets: ['note:keep'] });

      expect(await host.applyDotRepair({ dot: 'alice:1', policy: 'restore', targets: ['note:keep'] })).toEqual(restored);
      expect(await host.getWriterPatches('repair.alice')).toHaveLength(1);
    });
    expect(await visible(repository, 'dot-reuse-tombstone')).toEqual(['note:keep']);
  });

  it('a pending remove arriving after the repair behaves as the preview said: it no longer hides any member', async () => {
    const repository = await migrated('dot-reuse');
    repositories.push(repository);
    await withFixtureHost(repository, 'dot-reuse', 'alice', async (host) => {
      await host.applyDotRepair({ dot: 'alice:1', policy: 'separate' });
    });

    await appendPendingRemove(repository, 'dot-reuse', 'note:first', 'alice:1');

    expect(await visible(repository, 'dot-reuse')).toEqual(['note:first', 'note:second']);
  });

  it('refuses a remove that hits an unresolved shared dot, and allows it once the collision is repaired', async () => {
    const repository = await migrated('dot-reuse');
    repositories.push(repository);
    await withFixtureHost(repository, 'dot-reuse', 'alice', async (host) => {
      await host.materialize();
      await expect(host.patch((patch) => { patch.removeNode('note:first'); }))
        .rejects.toMatchObject({ code: 'E_PATCH_REMOVE_SHARED_DOT', context: { dot: 'alice:1', target: 'note:first' } });

      await host.applyDotRepair({ dot: 'alice:1', policy: 'separate' });
      await host.materialize();
      await host.patch((patch) => { patch.removeNode('note:first'); });
    });
    expect(await visible(repository, 'dot-reuse')).toEqual(['note:second']);
  });

  it('two clones repairing one collision from different frontiers use distinct repair writers and disjoint dots', async () => {
    const left = await migrated('dot-reuse');
    const right = await migrated('dot-reuse');
    repositories.push(left, right);
    await withFixtureHost(right, 'dot-reuse', 'bob', async (host) => {
      await host.patch((patch) => { patch.addNode('bob:extra'); });
    });

    const repairDots = async (repository: string, writer: string): Promise<string[]> =>
      await withFixtureHost(repository, 'dot-reuse', writer, async (host) => {
        const record = await host.applyDotRepair({ dot: 'alice:1', policy: 'separate' });
        return (await host.getWriterPatches(record.repairWriter)).flatMap(({ patch }) => patch.ops)
          .filter((op): op is NodeAdd => op instanceof NodeAdd)
          .map((op) => `${op.dot.writerId}:${op.dot.counter}`);
      });

    const leftDots = await repairDots(left, 'alice');
    const rightDots = await repairDots(right, 'bob');

    expect(leftDots.every((dot) => dot.startsWith('repair.alice:'))).toBe(true);
    expect(rightDots.every((dot) => dot.startsWith('repair.bob:'))).toBe(true);
    expect(leftDots.filter((dot) => rightDots.includes(dot))).toEqual([]);
  });
});

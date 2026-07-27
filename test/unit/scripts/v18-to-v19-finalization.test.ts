import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { runV18ToV19Migration } from '../../../scripts/v18-to-v19/V18MigrationCommand.ts';
import V18MigrationExecutionMode from '../../../scripts/v18-to-v19/V18MigrationExecutionMode.ts';
import { finalizeV18Migration } from '../../../scripts/v18-to-v19/V18MigrationFinalizer.ts';
import {
  listV18MigrationRefs,
  readV18MigrationRef,
  v18MigrationGitText,
} from '../../../scripts/v18-to-v19/V18MigrationGit.ts';
import { planV18ToV19Migration } from '../../../scripts/v18-to-v19/V18MigrationPlan.ts';
import {
  prepareV18MigrationScratch,
  type V18PreparedMigration,
  verifyPromotedV19Repository,
} from '../../../scripts/v18-to-v19/V18MigrationScratch.ts';
import { openScratchGraph } from '../../../scripts/v18-to-v19/V18MigrationScratchGraph.ts';
import { restoreV18RetainedSubstrateFixture } from '../../../scripts/v18-to-v19/V18RetainedSubstrateFixtureRestore.ts';

const MANIFEST_PATH = resolve('fixtures/v18/retained-substrate-golden/manifest.json');

describe('v18-to-v19 finalization boundaries', () => {
  const temporaryDirectories: string[] = [];
  const preparedMigrations: V18PreparedMigration[] = [];

  afterEach(async () => {
    await Promise.all(
      preparedMigrations.splice(0).map(async (prepared) => await prepared.cleanup())
    );
    await Promise.all(
      temporaryDirectories.splice(0).map(async (directory) => {
        await rm(directory, { recursive: true, force: true });
      })
    );
  });

  it('leaves a concurrently advanced writer authoritative', async () => {
    const migration = await prepareFixtureMigration();
    const writer = migration.plan.writers[0];
    if (writer === undefined) {
      throw new Error('authentic fixture has no writer');
    }
    const tree = await v18MigrationGitText(migration.repositoryPath, [
      'show',
      '-s',
      '--format=%T',
      writer.head,
    ]);
    const concurrentHead = await v18MigrationGitText(
      migration.repositoryPath,
      ['commit-tree', tree, '-p', writer.head],
      {
        env: {
          GIT_AUTHOR_DATE: '2026-01-01T00:00:00Z',
          GIT_AUTHOR_EMAIL: 'fixture@example.invalid',
          GIT_AUTHOR_NAME: 'Migration Fixture',
          GIT_COMMITTER_DATE: '2026-01-01T00:00:00Z',
          GIT_COMMITTER_EMAIL: 'fixture@example.invalid',
          GIT_COMMITTER_NAME: 'Migration Fixture',
        },
        input: 'concurrent v18 writer advance\n',
      }
    );
    await v18MigrationGitText(migration.repositoryPath, [
      'update-ref',
      writer.refName,
      concurrentHead,
      writer.head,
    ]);

    await expect(
      finalizeV18Migration({
        plan: migration.plan,
        prepared: migration.prepared,
        recoveryId: 'concurrent-proof',
      })
    ).rejects.toThrow();

    expect(await readV18MigrationRef(migration.repositoryPath, writer.refName)).toBe(
      concurrentHead
    );
    expect(
      await listV18MigrationRefs(
        migration.repositoryPath,
        `refs/warp/${migration.graph}/recovery/v18-to-v19/concurrent-proof/`
      )
    ).toEqual([]);
  });

  it('resumes safely after atomic promotion but before command verification', async () => {
    const migration = await prepareFixtureMigration();
    const finalization = await finalizeV18Migration({
      plan: migration.plan,
      prepared: migration.prepared,
      recoveryId: 'interrupted-proof',
    });

    const resumed = await runV18ToV19Migration({
      graph: migration.graph,
      mode: V18MigrationExecutionMode.promote(),
      repositoryPath: migration.repositoryPath,
    });

    expect(resumed.status).toBe('already-current');
    expect(
      await listV18MigrationRefs(migration.repositoryPath, `${finalization.recoveryPrefix}/`)
    ).not.toEqual([]);
  });

  it('verifies a promoted repository without decoding its oversized full state', async () => {
    const migration = await prepareFixtureMigration();
    const opened = await openScratchGraph(
      migration.prepared.scratchPath,
      migration.graph,
      'oversized-state-writer'
    );
    try {
      await opened.graph.patch((patch) => {
        patch
          .addNode('oversized-state-node-a')
          .setProperty('oversized-state-node-a', 'payload', 'a'.repeat(3 * 1024 * 1024));
      });
      await opened.graph.patch((patch) => {
        patch
          .addNode('oversized-state-node-b')
          .setProperty('oversized-state-node-b', 'payload', 'b'.repeat(3 * 1024 * 1024));
      });
      await opened.graph.materialize();
      await opened.graph.createCheckpoint();
    } finally {
      await opened.close();
    }

    const eagerControl = await openScratchGraph(
      migration.prepared.scratchPath,
      migration.graph,
      'oversized-state-eager-control'
    );
    try {
      await expect(eagerControl.graph.materialize()).rejects.toMatchObject({
        code: 'E_CBOR_DECODE_BOUNDS',
      });
    } finally {
      await eagerControl.close();
    }

    await expect(
      verifyPromotedV19Repository(migration.prepared.scratchPath, migration.graph)
    ).resolves.toBeUndefined();
  });

  async function prepareFixtureMigration(): Promise<
    Readonly<{
      graph: string;
      plan: Awaited<ReturnType<typeof planV18ToV19Migration>>;
      prepared: V18PreparedMigration;
      repositoryPath: string;
    }>
  > {
    const targetDirectory = await mkdtemp(join(tmpdir(), 'git-warp-v18-finalize-'));
    temporaryDirectories.push(targetDirectory);
    const restored = await restoreV18RetainedSubstrateFixture({
      manifestPath: MANIFEST_PATH,
      targetDirectory,
    });
    const plan = await planV18ToV19Migration({
      graph: restored.manifest.graphId,
      passphraseAvailable: false,
      repositoryPath: restored.repositoryPath,
    });
    const prepared = await prepareV18MigrationScratch({ plan });
    preparedMigrations.push(prepared);
    return Object.freeze({
      graph: restored.manifest.graphId,
      plan,
      prepared,
      repositoryPath: restored.repositoryPath,
    });
  }
});

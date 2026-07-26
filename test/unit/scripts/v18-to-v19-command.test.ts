import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import Runtime from '../../../src/application/Runtime.ts';
import WarpError from '../../../src/domain/errors/WarpError.ts';
import { buildCheckpointRef } from '../../../src/domain/utils/RefLayout.ts';
import { restoreV18RetainedSubstrateFixture } from '../../../scripts/v18-to-v19/V18RetainedSubstrateFixtureRestore.ts';
import { runV18ToV19Migration } from '../../../scripts/v18-to-v19/V18MigrationCommand.ts';
import {
  readV18MigrationRef,
  runV18MigrationGit,
  V18MigrationGitError,
  v18MigrationGitText,
} from '../../../scripts/v18-to-v19/V18MigrationGit.ts';
import { readRequiredV18MigrationRefMap } from '../../helpers/V18MigrationRefMap.ts';

const MANIFEST_PATH = resolve(
  'fixtures/v18/retained-substrate-golden/manifest.json',
);
const RECOVERY_ID = 'fixture-proof';

describe('v18-to-v19 migration command', () => {
  const temporaryDirectories: string[] = [];

  afterEach(async () => {
    await Promise.all(
      temporaryDirectories.splice(0).map(async (directory) => {
        await rm(directory, { recursive: true, force: true });
      }),
    );
  });

  it('returns null only for a missing ref and propagates repository failures', async () => {
    const repositoryPath = await mkdtemp(join(tmpdir(), 'git-warp-ref-read-'));
    const nonRepositoryPath = await mkdtemp(join(tmpdir(), 'git-warp-ref-failure-'));
    temporaryDirectories.push(repositoryPath, nonRepositoryPath);
    await v18MigrationGitText(repositoryPath, ['init', '--bare']);

    await expect(readV18MigrationRef(
      repositoryPath,
      'refs/warp/missing',
    )).resolves.toBeNull();
    await expect(readV18MigrationRef(
      nonRepositoryPath,
      'refs/warp/missing',
    )).rejects.toThrow(/not a git repository/iu);
  });

  it('surfaces early-exit stdin failures through the migration Git error', async () => {
    const repositoryPath = await mkdtemp(join(tmpdir(), 'git-warp-stdin-failure-'));
    temporaryDirectories.push(repositoryPath);
    await v18MigrationGitText(repositoryPath, ['init', '--bare']);

    await expect(runV18MigrationGit(
      repositoryPath,
      ['cat-file', 'blob', 'f'.repeat(40)],
      { input: new Uint8Array(8 * 1024 * 1024) },
    )).rejects.toBeInstanceOf(V18MigrationGitError);
  });

  it('atomically promotes verified refs and retains complete recovery roots', async () => {
    const targetDirectory = await mkdtemp(join(tmpdir(), 'git-warp-v18-command-'));
    temporaryDirectories.push(targetDirectory);
    const restored = await restoreV18RetainedSubstrateFixture({
      manifestPath: MANIFEST_PATH,
      targetDirectory,
    });
    const writerFixtureRef = restored.manifest.refs.find(
      (ref) => ref.kind === 'writer',
    );
    if (writerFixtureRef === undefined) {
      throw new Error('fixture has no writer commit for a historical checkpoint ref');
    }
    const oldCheckpointSha = writerFixtureRef.expectedHead;
    const historicalCheckpointRef = `refs/warp/${restored.manifest.graphId}`
      + '/checkpoints/pre-rehearsal';
    await v18MigrationGitText(restored.repositoryPath, [
      'update-ref',
      historicalCheckpointRef,
      oldCheckpointSha,
    ]);
    const sourceHeads = await readRequiredV18MigrationRefMap(
      restored.repositoryPath,
      restored.manifest.refs.map((ref) => ref.refName),
    );
    const runtime = await Runtime.open({
      at: restored.repositoryPath,
      writer: 'preflight-proof',
    });
    try {
      const error = await runtime
        .lane(restored.manifest.graphId)
        .catch((cause: unknown) => cause);
      expect(error).toBeInstanceOf(WarpError);
      if (error instanceof WarpError) {
        expect(error.code).toBe('E_SUBSTRATE_MIGRATION_REQUIRED');
      }
    } finally {
      await runtime.close();
    }
    expect(await readRequiredV18MigrationRefMap(
      restored.repositoryPath,
      restored.manifest.refs.map((ref) => ref.refName),
    )).toEqual(sourceHeads);

    const report = await runV18ToV19Migration({
      apply: true,
      graph: restored.manifest.graphId,
      recoveryId: RECOVERY_ID,
      repositoryPath: restored.repositoryPath,
    });

    expect(report.status).toBe('migrated');
    expect(report.scratchVerified).toBe(true);
    expect(report.finalization?.recoveryPrefix).toBe(
      `refs/warp/${restored.manifest.graphId}/recovery/v18-to-v19/${RECOVERY_ID}`,
    );
    for (const ref of restored.manifest.refs) {
      const live = await readV18MigrationRef(restored.repositoryPath, ref.refName);
      if (ref.kind === 'writer') {
        expect(live).not.toBe(ref.expectedHead);
        expect(await readV18MigrationRef(
          restored.repositoryPath,
          `${report.finalization?.recoveryPrefix}/refs/writers/${ref.writerId}`,
        )).toBe(ref.expectedHead);
      } else {
        expect(live).toBeNull();
        expect(await readV18MigrationRef(
          restored.repositoryPath,
          `${report.finalization?.recoveryPrefix}/refs/state-cache`,
        )).toBe(ref.expectedHead);
      }
    }
    expect(await readV18MigrationRef(
      restored.repositoryPath,
      `${report.finalization?.recoveryPrefix}/retained-payloads/`
        + restored.manifest.retainedState.payloadRoot,
    )).toBe(restored.manifest.retainedState.payloadRoot);
    expect(await readV18MigrationRef(
      restored.repositoryPath,
      `refs/warp/${restored.manifest.graphId}/substrate-version`,
    )).not.toBeNull();
    expect(await readV18MigrationRef(
      restored.repositoryPath,
      buildCheckpointRef(restored.manifest.graphId),
    )).not.toBeNull();
    expect(await readV18MigrationRef(
      restored.repositoryPath,
      historicalCheckpointRef,
    )).toBeNull();
    expect(await readV18MigrationRef(
      restored.repositoryPath,
      `${report.finalization?.recoveryPrefix}/refs/checkpoints/pre-rehearsal`,
    )).toBe(oldCheckpointSha);

    const second = await runV18ToV19Migration({
      apply: true,
      graph: restored.manifest.graphId,
      repositoryPath: restored.repositoryPath,
    });
    expect(second.status).toBe('already-current');
  });
});

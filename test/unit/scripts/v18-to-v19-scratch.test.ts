import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

import ContentAddressableStore, {
  AssetHandle as GitCasAssetHandle,
  CborCodec as GitCasCborCodec,
} from '@git-stunts/git-cas';
import { afterEach, describe, expect, it } from 'vitest';

import Runtime from '../../../src/application/Runtime.ts';
import { createObserver } from '../../../src/domain/api/ObserverRuntime.ts';
import Reading from '../../../src/domain/api/Reading.ts';
import type { SnapshotPropValue } from '../../../src/domain/services/snapshot/SnapshotPropValue.ts';
import { buildCheckpointRef } from '../../../src/domain/utils/RefLayout.ts';
import { restoreV18RetainedSubstrateFixture } from '../../../scripts/v18-to-v19/V18RetainedSubstrateFixtureRestore.ts';
import { planV18ToV19Migration } from '../../../scripts/v18-to-v19/V18MigrationPlan.ts';
import type { V18MigrationProgress } from '../../../scripts/v18-to-v19/V18MigrationProgress.ts';
import {
  prepareV18MigrationScratch,
  type V18PreparedMigration,
} from '../../../scripts/v18-to-v19/V18MigrationScratch.ts';
import { v18MigrationGitText } from '../../../scripts/v18-to-v19/V18MigrationGit.ts';
import { collectAsyncBytes } from '../../helpers/collectAsyncBytes.ts';
import { readRequiredV18MigrationRefMap } from '../../helpers/V18MigrationRefMap.ts';

const MANIFEST_PATH = resolve('fixtures/v18/retained-substrate-golden/manifest.json');
const MEDIUM_MANIFEST_PATH = resolve('fixtures/v18/retained-substrate-medium/manifest.json');

describe('v18-to-v19 scratch migration', () => {
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

  it('proves checkpoint, public reading, append, and content without touching source refs', async () => {
    const targetDirectory = await mkdtemp(join(tmpdir(), 'git-warp-v18-plan-'));
    temporaryDirectories.push(targetDirectory);
    const restored = await restoreV18RetainedSubstrateFixture({
      manifestPath: MANIFEST_PATH,
      targetDirectory,
    });
    const preservedRef = `refs/warp/${restored.manifest.graphId}/strand-overlays/fixture`;
    const preservedHead = restored.manifest.refs[0]?.expectedHead;
    if (preservedHead === undefined) {
      throw new Error('authentic fixture has no writer head');
    }
    await v18MigrationGitText(restored.repositoryPath, ['update-ref', preservedRef, preservedHead]);
    const sourceHeads = await readRequiredV18MigrationRefMap(restored.repositoryPath, [
      ...restored.manifest.refs.map((ref) => ref.refName),
      preservedRef,
    ]);
    const plan = await planV18ToV19Migration({
      graph: restored.manifest.graphId,
      passphraseAvailable: false,
      repositoryPath: restored.repositoryPath,
    });

    expect(plan.status).toBe('migration-required');
    expect(plan.writers.map((writer) => writer.legacyCount)).toEqual([2, 1]);
    expect(plan.preservedRefs).toEqual({ [preservedRef]: preservedHead });
    const scratchRoot = await mkdtemp(join(tmpdir(), 'git-warp-v18-scratch-root-'));
    temporaryDirectories.push(scratchRoot);
    const prepared = await prepareV18MigrationScratch({ plan, scratchRoot });
    preparedMigrations.push(prepared);

    expect(dirname(prepared.scratchPath)).toBe(scratchRoot);
    expect(prepared.desiredRefs).toHaveProperty(buildCheckpointRef(restored.manifest.graphId));
    expect(prepared.desiredRefs).toHaveProperty(plan.markerRef);
    expect(prepared.desiredRefs).toHaveProperty(preservedRef, preservedHead);
    expect(Object.keys(prepared.desiredRefs)).not.toContain(
      restored.manifest.retainedState.refName
    );
    expect(
      await readRequiredV18MigrationRefMap(restored.repositoryPath, [
        ...restored.manifest.refs.map((ref) => ref.refName),
        preservedRef,
      ])
    ).toEqual(sourceHeads);

    const title = await observeProperty(
      prepared.scratchPath,
      restored.manifest.graphId,
      'doc:fixture',
      'title'
    );
    expect(title).toBe('Authentic v18 retained state');
    const contentHandle = await observeProperty(
      prepared.scratchPath,
      restored.manifest.graphId,
      'doc:fixture',
      '_content'
    );
    expect(typeof contentHandle).toBe('string');
    if (typeof contentHandle !== 'string') {
      throw new Error('migrated content property was not a string');
    }
    const cas = await ContentAddressableStore.open({
      cwd: prepared.scratchPath,
      codec: new GitCasCborCodec(),
    });
    try {
      const content = await collectAsyncBytes(
        cas.assets.open({
          handle: GitCasAssetHandle.parse(contentHandle),
        })
      );
      expect(Buffer.from(content).toString('utf8')).toBe(
        'v18 blob-backed content retained for v19 migration proof\n'
      );
    } finally {
      await cas.close();
    }
  });

  it('blocks pre-v18 retained refs before scratch mutation', async () => {
    const targetDirectory = await mkdtemp(join(tmpdir(), 'git-warp-v18-plan-'));
    temporaryDirectories.push(targetDirectory);
    const restored = await restoreV18RetainedSubstrateFixture({
      manifestPath: MANIFEST_PATH,
      targetDirectory,
    });
    const retiredOid = await v18MigrationGitText(
      restored.repositoryPath,
      ['hash-object', '-w', '--stdin'],
      { input: 'retired audit receipt' }
    );
    const retiredRef = `refs/warp/${restored.manifest.graphId}/audit/retired`;
    await v18MigrationGitText(restored.repositoryPath, ['update-ref', retiredRef, retiredOid]);

    await expect(
      planV18ToV19Migration({
        graph: restored.manifest.graphId,
        passphraseAvailable: false,
        repositoryPath: restored.repositoryPath,
      })
    ).rejects.toThrow(
      `retained ref requires a pre-v18 migration before v19: ${retiredRef} targets blob`
    );
  });

  it('replays the translated tail from an authentic v18 checkpoint seed', async () => {
    const targetDirectory = await mkdtemp(join(tmpdir(), 'git-warp-v18-seed-'));
    temporaryDirectories.push(targetDirectory);
    const restored = await restoreV18RetainedSubstrateFixture({
      manifestPath: MEDIUM_MANIFEST_PATH,
      targetDirectory,
    });
    const sourceHeads = await readRequiredV18MigrationRefMap(
      restored.repositoryPath,
      restored.manifest.refs.map((ref) => ref.refName)
    );
    const progress: V18MigrationProgress[] = [];
    const plan = await planV18ToV19Migration({
      graph: restored.manifest.graphId,
      passphraseAvailable: false,
      progress: (event) => progress.push(event),
      repositoryPath: restored.repositoryPath,
    });
    expect(inventoryCounts(progress, 'medium-alice')).toEqual(
      Array.from({ length: 17 }, (_, completed) => completed)
    );
    expect(inventoryCounts(progress, 'medium-bob')).toEqual([0, 1, 2]);
    const prepared = await prepareV18MigrationScratch({ plan });
    preparedMigrations.push(prepared);

    await expect(
      observeProperty(
        prepared.scratchPath,
        restored.manifest.graphId,
        'medium:document:015',
        'ordinal'
      )
    ).resolves.toBe(15);
    await expect(
      observeProperty(
        prepared.scratchPath,
        restored.manifest.graphId,
        'medium:review:01',
        'reviewed'
      )
    ).resolves.toBe(true);
    const contentHandle = await observeProperty(
      prepared.scratchPath,
      restored.manifest.graphId,
      'medium:document:015',
      '_content'
    );
    expect(typeof contentHandle).toBe('string');
    if (typeof contentHandle !== 'string') {
      throw new Error('checkpoint tail content did not use a string handle');
    }
    const cas = await ContentAddressableStore.open({
      cwd: prepared.scratchPath,
      codec: new GitCasCborCodec(),
    });
    try {
      const content = await collectAsyncBytes(
        cas.assets.open({
          handle: GitCasAssetHandle.parse(contentHandle),
        })
      );
      expect(content).toHaveLength(128 * 1024);
    } finally {
      await cas.close();
    }
    expect(
      await readRequiredV18MigrationRefMap(
        restored.repositoryPath,
        restored.manifest.refs.map((ref) => ref.refName)
      )
    ).toEqual(sourceHeads);
  }, 120_000);
});

function inventoryCounts(progress: readonly V18MigrationProgress[], writer: string): number[] {
  return progress
    .filter((event) => event.phase === 'inventory' && event.writer === writer)
    .flatMap((event) => (event.completed === undefined ? [] : [event.completed]));
}

async function observeProperty(
  repositoryPath: string,
  graph: string,
  subject: string,
  key: string
): Promise<SnapshotPropValue> {
  const runtime = await Runtime.open({ at: repositoryPath, writer: 'fixture-reader' });
  try {
    const lane = await runtime.lane(graph);
    const observation = lane.observe(
      createObserver<SnapshotPropValue>(
        `fixture.${key}`,
        Reading.property({ subject, key }),
        (value) => value
      )
    );
    return (await observation.one()).value;
  } finally {
    await runtime.close();
  }
}

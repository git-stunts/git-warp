import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

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
import {
  prepareV18MigrationScratch,
  type V18PreparedMigration,
} from '../../../scripts/v18-to-v19/V18MigrationScratch.ts';
import { v18MigrationGitText } from '../../../scripts/v18-to-v19/V18MigrationGit.ts';

const MANIFEST_PATH = resolve(
  'fixtures/v18/retained-substrate-golden/manifest.json',
);

describe('v18-to-v19 scratch migration', () => {
  const temporaryDirectories: string[] = [];
  const preparedMigrations: V18PreparedMigration[] = [];

  afterEach(async () => {
    await Promise.all(
      preparedMigrations.splice(0).map(async (prepared) => await prepared.cleanup()),
    );
    await Promise.all(
      temporaryDirectories.splice(0).map(async (directory) => {
        await rm(directory, { recursive: true, force: true });
      }),
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
    await v18MigrationGitText(
      restored.repositoryPath,
      ['update-ref', preservedRef, preservedHead],
    );
    const sourceHeads = await readHeads(
      restored.repositoryPath,
      [...restored.manifest.refs.map((ref) => ref.refName), preservedRef],
    );
    const plan = await planV18ToV19Migration({
      graph: restored.manifest.graphId,
      passphraseAvailable: false,
      repositoryPath: restored.repositoryPath,
    });

    expect(plan.status).toBe('migration-required');
    expect(plan.writers.map((writer) => writer.legacyCount)).toEqual([2, 1]);
    expect(plan.preservedRefs).toEqual({ [preservedRef]: preservedHead });
    const prepared = await prepareV18MigrationScratch({ plan });
    preparedMigrations.push(prepared);

    expect(prepared.desiredRefs).toHaveProperty(
      buildCheckpointRef(restored.manifest.graphId),
    );
    expect(prepared.desiredRefs).toHaveProperty(plan.markerRef);
    expect(prepared.desiredRefs).toHaveProperty(preservedRef, preservedHead);
    expect(Object.keys(prepared.desiredRefs)).not.toContain(
      restored.manifest.retainedState.refName,
    );
    expect(await readHeads(
      restored.repositoryPath,
      [...restored.manifest.refs.map((ref) => ref.refName), preservedRef],
    )).toEqual(sourceHeads);

    const title = await observeProperty(
      prepared.scratchPath,
      restored.manifest.graphId,
      'doc:fixture',
      'title',
    );
    expect(title).toBe('Authentic v18 retained state');
    const contentHandle = await observeProperty(
      prepared.scratchPath,
      restored.manifest.graphId,
      'doc:fixture',
      '_content',
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
      const content = await collect(cas.assets.open({
        handle: GitCasAssetHandle.parse(contentHandle),
      }));
      expect(Buffer.from(content).toString('utf8')).toBe(
        'v18 blob-backed content retained for v19 migration proof\n',
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
      { input: 'retired audit receipt' },
    );
    const retiredRef = `refs/warp/${restored.manifest.graphId}/audit/retired`;
    await v18MigrationGitText(
      restored.repositoryPath,
      ['update-ref', retiredRef, retiredOid],
    );

    await expect(planV18ToV19Migration({
      graph: restored.manifest.graphId,
      passphraseAvailable: false,
      repositoryPath: restored.repositoryPath,
    })).rejects.toThrow(
      `retained ref requires a pre-v18 migration before v19: ${retiredRef} targets blob`,
    );
  });
});

async function observeProperty(
  repositoryPath: string,
  graph: string,
  subject: string,
  key: string,
): Promise<SnapshotPropValue> {
  const runtime = await Runtime.open({ at: repositoryPath, writer: 'fixture-reader' });
  try {
    const lane = await runtime.lane(graph);
    const observation = lane.observe(createObserver<SnapshotPropValue>(
      `fixture.${key}`,
      Reading.property({ subject, key }),
      (value) => value,
    ));
    return (await observation.one()).value;
  } finally {
    await runtime.close();
  }
}

async function readHeads(
  repositoryPath: string,
  refs: readonly string[],
): Promise<Readonly<Record<string, string>>> {
  const heads: Record<string, string> = {};
  for (const refName of refs) {
    heads[refName] = await v18MigrationGitText(
      repositoryPath,
      ['rev-parse', '--verify', refName],
    );
  }
  return Object.freeze(heads);
}

async function collect(source: AsyncIterable<Uint8Array>): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  for await (const chunk of source) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

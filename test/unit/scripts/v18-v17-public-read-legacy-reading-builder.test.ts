import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  buildV17RestoredPublicReadLegacyReading,
} from '../../../scripts/v18.0.0/migrations/graph-model/V17RestoredPublicReadLegacyReadingBuilder.ts';
import {
  restoreV17GoldenGraphFixture,
} from '../../../scripts/v18.0.0/migrations/graph-model/V17GoldenGraphFixtureRestore.ts';
import { gitOk, MigrationTestDirectories } from './migrationTestEnvironment.ts';

const FIXTURE_MANIFEST_PATH = resolve('fixtures/v17/graph-model-golden/manifest.json');
const temporaryDirectories = new MigrationTestDirectories();

describe('v18 v17 public-read legacy reading builder', () => {
  afterEach(async () => {
    await temporaryDirectories.cleanup();
  });

  it('builds legacy equivalence facts from a verified restored v17 fixture', async () => {
    const restoreResult = await restoredFixture('git-warp-v17-public-read-');

    const reading = await buildV17RestoredPublicReadLegacyReading({
      repositoryPath: restoreResult.repositoryPath,
      manifest: restoreResult.manifest,
    });

    expect(reading.readingId).toBe('v17-golden-fixture:v17-golden-graph-model-001');
    expect(reading.facts.map((fact) => `${fact.kind}:${fact.factKey}:${fact.fieldPath}`)).toEqual([
      'content-attachment:node:alpha:_content:payload.oid',
      'edge:node:alpha->node:beta:relates:visibility',
      'node:node:alpha:visibility',
      'node:node:beta:visibility',
      'node:node:removed:visibility',
      'property:node:alpha->node:beta:relates:weight:value',
      'property:node:alpha:title:value',
      'property:writers:alice+bob:coverage',
    ]);
    expect(reading.facts.map((fact) => fact.boundary?.writerId)).toEqual([
      'alice',
      'bob',
      'bob',
      'alice',
      'bob',
      'bob',
      'alice',
      'alice',
    ]);
    expect(reading.facts.find((fact) => fact.factKey === 'node:alpha:_content')?.value)
      .toBe('24c25f5d050d4abd1186ab83700fae29144f1f7b');
  });

  it('fails closed when a restored v17 writer ref drifts after restore', async () => {
    const restoreResult = await restoredFixture('git-warp-v17-public-read-drift-');
    const bobHead = restoreResult.restoredRefs[1]?.head;
    if (bobHead === undefined) {
      throw new Error('fixture must restore bob ref');
    }
    await gitOk(restoreResult.repositoryPath, [
      'update-ref',
      'refs/warp/v17-golden-graph/writers/alice',
      bobHead,
    ]);

    await expect(buildV17RestoredPublicReadLegacyReading({
      repositoryPath: restoreResult.repositoryPath,
      manifest: restoreResult.manifest,
    })).rejects.toThrow(/expected 417fe95095a6feae3042c36505065bbd7b3d2a67/);
  });

  it('rejects an invalid restored repository path before Git work', async () => {
    const restoreResult = await restoredFixture('git-warp-v17-public-read-invalid-');

    await expect(buildV17RestoredPublicReadLegacyReading({
      repositoryPath: '',
      manifest: restoreResult.manifest,
    })).rejects.toThrow(/repositoryPath/);
  });
});

async function restoredFixture(prefix: string): Promise<Awaited<ReturnType<typeof restoreV17GoldenGraphFixture>>> {
  const targetDirectory = await temporaryDirectories.create(prefix);
  return await restoreV17GoldenGraphFixture({
    manifestPath: FIXTURE_MANIFEST_PATH,
    targetDirectory,
  });
}

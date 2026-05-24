import { execFile } from 'node:child_process';
import { mkdtemp } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

import {
  collectGraphModelMigrationSourceInventory,
} from '../../../scripts/v18.0.0/migrations/graph-model/GraphModelMigrationSourceInventoryCollector.ts';
import {
  restoreV17GoldenGraphFixture,
} from '../../../scripts/v18.0.0/migrations/graph-model/V17GoldenGraphFixtureRestore.ts';

const FIXTURE_MANIFEST_PATH = resolve('fixtures/v17/graph-model-golden/manifest.json');
const execFileAsync = promisify(execFile);

describe('v18 graph-model source inventory collector', () => {
  it('collects writer chains and patch descriptors from restored v17 refs', async () => {
    const targetDirectory = await mkdtemp(join(tmpdir(), 'git-warp-v17-source-'));
    const restored = await restoreV17GoldenGraphFixture({
      manifestPath: FIXTURE_MANIFEST_PATH,
      targetDirectory,
    });

    const inventory = await collectGraphModelMigrationSourceInventory({
      repositoryPath: restored.repositoryPath,
      graphId: restored.manifest.graphId,
      fixtureManifest: restored.manifest,
    });

    expect(inventory.isUsableForPlanning()).toBe(true);
    expect(inventory.sourceBasis?.basisId).toContain('refs/warp/v17-golden-graph/writers/alice@');
    expect(inventory.writerChains.map((chain) => [chain.writerId, chain.patchIds.length])).toEqual([
      ['alice', 3],
      ['bob', 2],
    ]);
    expect(inventory.patchDescriptors.map((patch) => [patch.writerId, patch.writerSequence])).toEqual([
      ['alice', 0],
      ['alice', 1],
      ['alice', 2],
      ['bob', 0],
      ['bob', 1],
    ]);
    expect(inventory.contentSources.map((source) => source.legacyContentKey)).toEqual([
      'node:alpha:_content',
    ]);
    expect(inventory.fatalErrors).toEqual([]);
  });

  it('fails closed when the graph has no restored writer refs', async () => {
    const repositoryPath = await mkdtemp(join(tmpdir(), 'git-warp-v17-source-empty-'));
    await execFileAsync('git', ['init', '-q'], { cwd: repositoryPath });

    const inventory = await collectGraphModelMigrationSourceInventory({
      repositoryPath,
      graphId: 'missing-graph',
    });

    expect(inventory.isUsableForPlanning()).toBe(false);
    expect(inventory.sourceBasis).toBeNull();
    expect(inventory.fatalErrors.map((notice) => notice.code)).toContain('E_NO_WRITER_REFS');
    expect(inventory.fatalErrors.map((notice) => notice.code)).toContain('E_MISSING_SOURCE_BASIS');
  });

  it('rejects an empty repository path before invoking Git', async () => {
    await expect(collectGraphModelMigrationSourceInventory({
      repositoryPath: '',
      graphId: 'v17-golden-graph',
    })).rejects.toThrow(/repositoryPath/);
  });
});

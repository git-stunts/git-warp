import { copyFile, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';

import {
  restoreV17GoldenGraphFixture,
} from '../../../scripts/v18.0.0/migrations/graph-model/V17GoldenGraphFixtureRestore.ts';
import {
  parseV17GoldenGraphFixtureManifestJson,
} from '../../../src/infrastructure/adapters/V17GoldenGraphFixtureManifestJsonAdapter.ts';

const FIXTURE_MANIFEST_PATH = resolve('fixtures/v17/graph-model-golden/manifest.json');

describe('v18 v17 golden graph-history fixtures', () => {
  it('parses a runtime-backed manifest with the required visible fact families', async () => {
    const raw = await readFile(FIXTURE_MANIFEST_PATH, 'utf8');
    const manifest = parseV17GoldenGraphFixtureManifestJson(raw);

    expect(manifest.fixtureId).toBe('v17-golden-graph-model-001');
    expect(manifest.graphId).toBe('v17-golden-graph');
    expect(manifest.writerChains.map((chain) => chain.writerId)).toEqual(['alice', 'bob']);
    expect(manifest.hasVisibleFactKind('node')).toBe(true);
    expect(manifest.hasVisibleFactKind('edge')).toBe(true);
    expect(manifest.hasVisibleFactKind('property')).toBe(true);
    expect(manifest.hasVisibleFactKind('content')).toBe(true);
    expect(manifest.hasVisibleFactKind('removal')).toBe(true);
    expect(manifest.hasVisibleFactKind('multi-writer')).toBe(true);
  });

  it('restores the bundle into an isolated repository and verifies writer heads', async () => {
    const targetDirectory = await mkdtemp(join(tmpdir(), 'git-warp-v17-golden-'));

    const result = await restoreV17GoldenGraphFixture({
      manifestPath: FIXTURE_MANIFEST_PATH,
      targetDirectory,
    });

    expect(result.repositoryPath).toBe(targetDirectory);
    expect(result.restoredRefs).toEqual([
      {
        refName: 'refs/warp/v17-golden-graph/writers/alice',
        head: '417fe95095a6feae3042c36505065bbd7b3d2a67',
        patchCount: 3,
      },
      {
        refName: 'refs/warp/v17-golden-graph/writers/bob',
        head: 'd7c3a05b3894d5c3c151e03dd972b6bd6c341b0c',
        patchCount: 2,
      },
    ]);
  });

  it('fails closed when a manifest expects the wrong restored head', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'git-warp-v17-golden-bad-'));
    const manifestPath = join(directory, 'manifest.json');
    const targetDirectory = join(directory, 'target');
    const raw = await readFile(FIXTURE_MANIFEST_PATH, 'utf8');
    await copyFile(
      resolve('fixtures/v17/graph-model-golden/v17-golden-graph.bundle'),
      join(directory, 'v17-golden-graph.bundle'),
    );
    await writeFile(
      manifestPath,
      raw.replace(
        '417fe95095a6feae3042c36505065bbd7b3d2a67',
        'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      ),
      'utf8',
    );

    await expect(restoreV17GoldenGraphFixture({
      manifestPath,
      targetDirectory,
    })).rejects.toThrow('expected aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
  });
});

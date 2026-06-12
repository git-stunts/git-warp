import { copyFile, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';

import {
  restoreV17GoldenGraphFixture,
} from '../../../scripts/v18.0.0/migrations/graph-model/V17GoldenGraphFixtureRestore.ts';
import {
  parseV17GoldenGraphFixtureManifestJson,
} from '../../../scripts/v18.0.0/migrations/graph-model/V17GoldenGraphFixtureManifestJsonAdapter.ts';
import {
  V17GoldenContentFact,
  V17GoldenEdgeFact,
  V17GoldenMultiWriterFact,
  V17GoldenNodeFact,
  V17GoldenPropertyFact,
  V17GoldenRemovalFact,
} from '../../../scripts/v18.0.0/migrations/graph-model/V17GoldenGraphFixtureManifest.ts';

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
    expect(manifest.visibleFacts.some((fact) => fact instanceof V17GoldenContentFact)).toBe(true);
    expect(manifest.visibleFacts.some((fact) => fact instanceof V17GoldenEdgeFact)).toBe(true);
    expect(manifest.visibleFacts.some((fact) => fact instanceof V17GoldenNodeFact)).toBe(true);
    expect(manifest.visibleFacts.some((fact) => fact instanceof V17GoldenRemovalFact)).toBe(true);
    expect(manifest.visibleFacts.some((fact) => fact instanceof V17GoldenPropertyFact)).toBe(true);
    expect(manifest.visibleFacts.some((fact) => fact instanceof V17GoldenMultiWriterFact)).toBe(true);
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

  it('rejects malformed manifest JSON at the adapter boundary', () => {
    const cases = Object.freeze([
      {
        raw: '{',
        message: /valid JSON/,
      },
      {
        raw: '[]',
        message: /manifest.*object/,
      },
      {
        raw: manifestJson({ extraRoot: true }),
        message: /manifest\.extra/,
      },
      {
        raw: manifestJson({ writerChains: 'alice' }),
        message: /writerChains.*array/,
      },
      {
        raw: manifestJson({ writerChains: [null] }),
        message: /writerChains\[0\].*object/,
      },
      {
        raw: manifestJson({
          writerChains: [
            {
              writerId: '',
              refName: 'refs/warp/v17-golden-graph/writers/alice',
              expectedHead: '1111111111111111111111111111111111111111',
              patchCount: 1,
            },
          ],
        }),
        message: /writerId.*non-empty string/,
      },
      {
        raw: manifestJson({
          writerChains: [
            {
              writerId: 'alice',
              refName: 'refs/warp/v17-golden-graph/writers/alice',
              expectedHead: '1111111111111111111111111111111111111111',
              patchCount: '1',
            },
          ],
        }),
        message: /patchCount.*finite number/,
      },
      {
        raw: manifestJson({
          visibleFacts: [
            {
              kind: 7,
              key: 'node:alpha',
              description: 'bad kind',
            },
          ],
        }),
        message: /kind.*supported fact kind/,
      },
      {
        raw: manifestJson({
          visibleFacts: [
            {
              kind: 'node',
              key: 'node:alpha',
            },
          ],
        }),
        message: /description.*required/,
      },
    ]);

    for (const candidate of cases) {
      expect(() => parseV17GoldenGraphFixtureManifestJson(candidate.raw))
        .toThrow(candidate.message);
    }
  });

  it('rejects empty restore paths before file-system or Git work', async () => {
    await expect(restoreV17GoldenGraphFixture({
      manifestPath: '',
      targetDirectory: 'target',
    })).rejects.toThrow(/manifestPath/);
    await expect(restoreV17GoldenGraphFixture({
      manifestPath: FIXTURE_MANIFEST_PATH,
      targetDirectory: '',
    })).rejects.toThrow(/targetDirectory/);
  });
});

type ManifestJsonValue =
  | string
  | number
  | boolean
  | null
  | readonly ManifestJsonValue[]
  | { readonly [key: string]: ManifestJsonValue };

type ManifestOverrides = {
  readonly writerChains?: ManifestJsonValue;
  readonly visibleFacts?: ManifestJsonValue;
  readonly extraRoot?: boolean;
};

function manifestJson(overrides: ManifestOverrides = {}): string {
  const manifest = {
    fixtureId: 'fixture:unit',
    graphId: 'v17-golden-graph',
    sourceVersion: '17.0.1',
    generator: 'unit-test',
    bundlePath: 'v17-golden-graph.bundle',
    writerChains: overrides.writerChains ?? [
      {
        writerId: 'alice',
        refName: 'refs/warp/v17-golden-graph/writers/alice',
        expectedHead: '1111111111111111111111111111111111111111',
        patchCount: 1,
      },
    ],
    visibleFacts: overrides.visibleFacts ?? [
      { kind: 'node', key: 'node:alpha', description: 'node' },
      { kind: 'edge', key: 'edge:alpha-beta', description: 'edge' },
      { kind: 'property', key: 'node:alpha:title', description: 'title' },
      { kind: 'content', key: 'node:alpha:_content', description: 'content' },
      { kind: 'removal', key: 'node:removed', description: 'removed' },
      { kind: 'multi-writer', key: 'writers:alice+bob', description: 'multi' },
    ],
    ...(overrides.extraRoot === true ? { extra: true } : {}),
  };
  return JSON.stringify(manifest);
}

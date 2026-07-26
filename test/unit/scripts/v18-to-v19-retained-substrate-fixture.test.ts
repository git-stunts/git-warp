import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  restoreV18RetainedSubstrateFixture,
} from '../../../scripts/v18-to-v19/V18RetainedSubstrateFixtureRestore.ts';
import {
  parseV18RetainedSubstrateFixtureManifestJson,
} from '../../../scripts/v18-to-v19/adapters/V18RetainedSubstrateFixtureJsonAdapter.ts';

const MANIFEST_PATH = resolve(
  'fixtures/v18/retained-substrate-golden/manifest.json',
);

describe('v18-to-v19 retained substrate fixture', () => {
  it('pins the published v18 dependency graph and blob-backed retained ref', async () => {
    const manifest = parseV18RetainedSubstrateFixtureManifestJson(
      await readFile(MANIFEST_PATH, 'utf8'),
    );

    expect(manifest.source.gitWarp.version).toBe('18.2.1');
    expect(manifest.source.gitCas.version).toBe('6.0.0');
    expect(manifest.source.plumbing.version).toBe('3.0.3');
    expect(manifest.refs).toContainEqual({
      kind: 'state-cache',
      refName: 'refs/warp/v18-retained-substrate/state-cache',
      expectedHead: '184107f007c4760057803460307c8a9e7cea6d44',
      expectedObjectType: 'blob',
    });
    expect(manifest.visibleFacts.map((fact) => fact.kind)).toEqual([
      'node',
      'node',
      'node',
      'edge',
      'property',
      'edge-property',
      'content',
      'multi-writer',
    ]);
  });

  it('restores every ref and the JSON-referenced payload tree', async () => {
    const targetDirectory = await mkdtemp(join(
      tmpdir(),
      'git-warp-v18-retained-fixture-',
    ));
    const result = await restoreV18RetainedSubstrateFixture({
      manifestPath: MANIFEST_PATH,
      targetDirectory,
    });

    expect(result.repositoryPath).toBe(targetDirectory);
    expect(result.restoredRefs).toEqual([
      {
        head: '2e7cc2cba64a6685d654b31d03775094771119f4',
        objectType: 'commit',
        refName: 'refs/warp/v18-retained-substrate/writers/alice',
      },
      {
        head: '6ec532e9f78e85c9a37959b3214200d2a5e0e43b',
        objectType: 'commit',
        refName: 'refs/warp/v18-retained-substrate/writers/bob',
      },
      {
        head: '184107f007c4760057803460307c8a9e7cea6d44',
        objectType: 'blob',
        refName: 'refs/warp/v18-retained-substrate/state-cache',
      },
    ]);
    expect(result.manifest.retainedState.payloadRoot)
      .toBe('369ada79ceb9bf744f3d6fc94184490d6e888bda');
  });
});

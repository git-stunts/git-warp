import { rm } from 'node:fs/promises';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  censusWithCurrentRuntime,
  type GraphCensus,
  readReleaseCensus,
  readV19PreWorldlineManifest,
  restoreV19PreWorldlineFixture,
  type V19PreWorldlineManifest,
} from '../../helpers/V19PreWorldlineFixture.ts';

describe('v19.1.0 pre-worldline fixture (#1018)', () => {
  let manifest: V19PreWorldlineManifest;
  let releaseCensus: Record<string, GraphCensus>;
  let currentCensus: Record<string, GraphCensus>;
  let repository: string | undefined;

  beforeAll(async () => {
    manifest = await readV19PreWorldlineManifest();
    releaseCensus = await readReleaseCensus(manifest);
    repository = await restoreV19PreWorldlineFixture(manifest);
    currentCensus = await censusWithCurrentRuntime(
      repository,
      manifest.scenarios.map((scenario) => scenario.graph).sort(),
    );
  }, 120_000);

  afterAll(async () => {
    if (repository !== undefined) {
      await rm(repository, { recursive: true, force: true });
    }
  });

  it('pins the authoring release and one scenario per graph', () => {
    expect(manifest.release).toEqual({
      tag: 'v19.1.0',
      commit: '20a9b7f76d07195de0782f0852102434bdd200d3',
    });
    const graphs = new Set(manifest.refs.map((ref) => ref.refName.split('/')[2]));
    expect([...graphs].sort()).toEqual(
      manifest.scenarios.map((scenario) => scenario.graph).sort(),
    );
    expect(Object.keys(releaseCensus).sort()).toEqual([...graphs].sort());
  });

  it('carries every legacy ref family the v21 migration must move', () => {
    const families = new Set(manifest.refs.map((ref) => ref.refName.split('/')[3]));
    expect([...families].sort()).toEqual([
      'checkpoints',
      'strand-braids',
      'strand-overlays',
      'strands',
      'substrate-version',
      'writers',
    ]);
  });

  it('reads every scenario on the current runtime exactly as v19.1.0 did', () => {
    expect(currentCensus).toEqual(releaseCensus);
  });

  it('golden and edge-case scenarios have owners and no duplicate dot within a v21 mint', () => {
    for (const scenario of manifest.scenarios) {
      if (scenario.classification === 'known-failure') {
        continue;
      }
      const census = releaseCensus[scenario.graph];
      expect(census?.strands.every((strand) => strand.owner !== null)).toBe(true);
      for (const duplicate of census?.duplicateDots ?? []) {
        const families = new Set(duplicate.sites.map((site) => site.refName.split('/')[3]));
        expect(families, `${scenario.graph} ${duplicate.dot}`).toEqual(
          new Set(['writers', 'strand-overlays']),
        );
      }
    }
  });

  it('collision: a lane writer and a strand mint the same legacy dot', () => {
    expect(releaseCensus['collision']?.duplicateDots).toEqual([
      expect.objectContaining({
        dot: 'next:1',
        sites: [
          expect.objectContaining({ refName: 'refs/warp/collision/writers/next', target: 'lane:1' }),
          expect.objectContaining({ refName: 'refs/warp/collision/strand-overlays/next', target: 'strand:1' }),
        ],
      }),
    ]);
  });

  it('dot-reuse: two sessions of one writer mint alice:1 twice', () => {
    expect(releaseCensus['dot-reuse']?.duplicateDots.map((duplicate) => duplicate.dot))
      .toEqual(['alice:1']);
    expect(releaseCensus['dot-reuse']?.visible.nodes).toEqual(['note:first', 'note:second']);
  });

  it('dot-reuse-tombstone: removing one reused node hides the other', () => {
    const census = releaseCensus['dot-reuse-tombstone'];
    expect(census?.duplicateDots.map((duplicate) => duplicate.dot)).toEqual(['alice:1']);
    expect(census?.chains.flatMap((chain) => chain.patches.flatMap((patch) => patch.adds)))
      .toEqual([
        { type: 'NodeAdd', target: 'note:keep', dot: 'alice:1' },
        { type: 'NodeAdd', target: 'note:drop', dot: 'alice:1' },
      ]);
    expect(census?.visible.nodes).toEqual([]);
  });

  it('ownerless: the strand descriptor records no owner', () => {
    expect(releaseCensus['ownerless']?.strands).toEqual([
      expect.objectContaining({ strandId: 'orphan', owner: null, overlayPatchCount: 1 }),
    ]);
  });

  it('known failures name the refusal the migration must report', () => {
    const refusals = manifest.scenarios
      .filter((scenario) => scenario.classification === 'known-failure')
      .map((scenario) => [scenario.graph, scenario.proposedMigration]);
    expect(refusals).toEqual([
      ['dot-reuse', expect.objectContaining({ verdict: 'refuse', refusal: 'duplicate-dot' })],
      ['dot-reuse-tombstone', expect.objectContaining({ verdict: 'refuse', refusal: 'duplicate-dot' })],
      ['ownerless', expect.objectContaining({ verdict: 'refuse', refusal: 'ownerless-strand' })],
    ]);
  });

  it.todo('v21 migration accepts golden and edge-case scenarios with the manifest mints (#1015)');
  it.todo('v21 migration refuses known-failure scenarios with the manifest refusal (#1015)');
});

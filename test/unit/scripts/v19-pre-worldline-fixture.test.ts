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

  it('counter-reset: the chain head understates counters the writer already used', () => {
    const census = releaseCensus['counter-reset'];
    const patches = census?.chains[0]?.patches ?? [];
    const head = patches[patches.length - 1];
    const used = patches.flatMap((patch) => patch.adds.map((add) => Number(add.dot.split(':')[1])));

    expect(patches).toHaveLength(101);
    expect(head?.ownContextCounter).toBe(1);
    expect(head?.adds).toEqual([{ type: 'NodeAdd', target: 'item:after-restart', dot: 'alice:1' }]);
    expect(Math.max(...used)).toBe(100);
    expect(census?.duplicateDots.map((duplicate) => duplicate.dot)).toEqual(['alice:1']);
  });

  it('collision-remove: one legacy key names both lane and strand dots, so removes resolve by origin', () => {
    const census = releaseCensus['collision-remove'];
    const addOrigin = new Map<string, string>();
    for (const chain of census?.chains ?? []) {
      for (const patch of chain.patches) {
        for (const add of patch.adds) {
          addOrigin.set(add.dot, chain.refName.split('/')[3] ?? '');
        }
      }
    }
    const overlay = census?.chains.find((chain) => chain.refName.endsWith('/strand-overlays/next'));
    const removes = overlay?.patches.flatMap((patch) => patch.removes) ?? [];

    expect([...addOrigin]).toEqual([
      ['next:1', 'writers'],
      ['next:2', 'strand-overlays'],
      ['next:3', 'strand-overlays'],
    ]);
    expect(removes.map((remove) => [remove.target, remove.observedDots.map((dot) => addOrigin.get(dot))]))
      .toEqual([
        ['lane:1', ['writers']],
        ['strand:2', ['strand-overlays']],
      ]);
    expect(census?.strands[0]?.visible.nodes).toEqual(['strand:1']);
    expect(census?.visible.nodes).toEqual(['lane:1']);
  });

  it('shared-dot-strand-remove: a strand remove of a reused lane dot hides both objects in the strand only', () => {
    const census = releaseCensus['shared-dot-strand-remove'];
    const overlay = census?.chains.find((chain) => chain.refName.endsWith('/strand-overlays/cleanup'));

    expect(census?.duplicateDots.map((duplicate) => duplicate.dot)).toEqual(['alice:1']);
    expect(overlay?.patches.flatMap((patch) => patch.removes)).toEqual([
      { type: 'NodeRemove', target: 'note:drop', observedDots: ['alice:1'] },
    ]);
    expect(census?.strands).toEqual([
      expect.objectContaining({ strandId: 'cleanup', owner: 'bob', visible: { nodes: [], edges: [] } }),
    ]);
    expect(census?.visible.nodes).toEqual(['note:drop', 'note:keep']);
  });

  it('known failures preserve interpretation: damage is reported, only ownerless strands refuse', () => {
    const outcomes = manifest.scenarios
      .filter((scenario) => scenario.classification === 'known-failure')
      .map((scenario) => [scenario.graph, scenario.proposedMigration]);
    expect(outcomes).toEqual([
      ['counter-reset', expect.objectContaining({
        verdict: 'migrate', damage: ['duplicate-dot'], allocationFloors: { alice: 100 },
      })],
      ['dot-reuse', expect.objectContaining({ verdict: 'migrate', damage: ['duplicate-dot'] })],
      ['dot-reuse-tombstone', expect.objectContaining({
        verdict: 'migrate', damage: ['duplicate-dot', 'collateral-deletion'],
      })],
      ['ownerless', expect.objectContaining({ verdict: 'refuse', refusal: 'ownerless-strand' })],
      ['shared-dot-strand-remove', expect.objectContaining({
        verdict: 'migrate', damage: ['duplicate-dot', 'collateral-deletion'],
      })],
    ]);
  });

  it('lane mints keep their bare v20 keys; only strand mints carry sigils', () => {
    for (const scenario of manifest.scenarios) {
      for (const mint of scenario.proposedMigration.mints) {
        expect(mint.includes('@'), `${scenario.graph} ${mint}`).toBe(mint.includes('@s.'));
        expect(mint.startsWith('@w.') || !mint.includes('@')).toBe(true);
      }
    }
  });

  it.todo('v21 migration converts each migrate scenario to the manifest mints with unchanged visible state (#1015)');
  it.todo('v21 migration persists the manifest allocation floors; counter-reset writes above alice:100 (#1021)');
  it.todo('v21 migration reports the manifest damage and refuses ownerless strands without --assign-owner (#1015)');
  it.todo('v21 migration keeps shared-dot-strand-remove: the strand view still hides note:keep and note:drop (#1015)');
  it.todo('v21 migration fans a synthetic cross-origin remove out to every identity it denoted, and blocks that strand when its view is unknown (#1015)');
});

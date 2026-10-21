import { execFileSync } from 'node:child_process';
import { rm } from 'node:fs/promises';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import NodeAdd from '../../../src/domain/types/ops/NodeAdd.ts';
import NodeRemove from '../../../src/domain/types/ops/NodeRemove.ts';
import type SnapshotWarpState from '../../../src/domain/services/snapshot/SnapshotWarpState.ts';
import { CURRENT_SUBSTRATE_MARKER } from '../../../src/infrastructure/adapters/SubstrateVersionGate.ts';
import type { V21MigrationOutcome } from '../../../scripts/v20-to-v21/V21Migration.ts';
import type { V21MigrationRecord } from '../../../scripts/v20-to-v21/V21MigrationRecord.ts';
import V21MigrationSession from '../../../scripts/v20-to-v21/V21MigrationSession.ts';
import {
  type GraphCensus,
  readReleaseCensus,
  readV19PreWorldlineManifest,
  restoreV19PreWorldlineFixture,
  type V19PreWorldlineManifest,
  withFixtureHost,
} from '../../helpers/V19PreWorldlineFixture.ts';

type Visible = { nodes: string[]; edges: string[] };

function visibleOf(state: SnapshotWarpState): Visible {
  return {
    nodes: [...state.nodeAlive.elements()].sort(),
    edges: [...state.edgeAlive.elements()].map((edge) => edge.split('\0').join('|')).sort(),
  };
}

function markerOf(repository: string, graph: string): string {
  return execFileSync('git', ['-C', repository, 'cat-file', 'blob', `refs/warp/${graph}/substrate-version`], { encoding: 'utf8' });
}

function recordOf(outcome: V21MigrationOutcome | undefined): V21MigrationRecord {
  if (outcome === undefined || outcome.status === 'refused') { throw new Error('graph was not migrated'); }
  return outcome.record;
}

describe('v20-to-v21 migration on the v19.1.0 fixture (#1015)', () => {
  let manifest: V19PreWorldlineManifest;
  let releaseCensus: Record<string, GraphCensus>;
  let repository = '';
  const outcomes = new Map<string, V21MigrationOutcome>();

  beforeAll(async () => {
    manifest = await readV19PreWorldlineManifest();
    releaseCensus = await readReleaseCensus(manifest);
    repository = await restoreV19PreWorldlineFixture(manifest);
    const session = await V21MigrationSession.open(repository);
    try {
      for (const scenario of manifest.scenarios) {
        outcomes.set(scenario.graph, await session.migrate(scenario.graph, new Map()));
      }
    } finally {
      await session.close();
    }
  }, 240_000);

  afterAll(async () => {
    if (repository.length > 0) { await rm(repository, { recursive: true, force: true }); }
  });

  it('refuses an ownerless strand without an assigned owner and leaves the graph on v19', () => {
    expect(outcomes.get('ownerless')).toEqual({ status: 'refused', reason: 'ownerless-strand', strands: ['orphan'] });
    expect(markerOf(repository, 'ownerless')).not.toBe(CURRENT_SUBSTRATE_MARKER);
  });

  it('migrates every other scenario and advances its marker last', () => {
    for (const scenario of manifest.scenarios.filter((candidate) => candidate.proposedMigration.verdict === 'migrate')) {
      expect(outcomes.get(scenario.graph)?.status, scenario.graph).toBe('migrated');
      expect(recordOf(outcomes.get(scenario.graph)).status).toBe('complete');
      expect(markerOf(repository, scenario.graph)).toBe(CURRENT_SUBSTRATE_MARKER);
    }
  });

  it('reads every migrated lane and strand exactly as v19.1.0 did', async () => {
    for (const scenario of manifest.scenarios.filter((candidate) => candidate.proposedMigration.verdict === 'migrate')) {
      const census = releaseCensus[scenario.graph];
      await withFixtureHost(repository, scenario.graph, 'migration-reader', async (host) => {
        expect(visibleOf(await host.materialize()), scenario.graph).toEqual({
          nodes: census?.visible.nodes, edges: census?.visible.edges,
        });
        for (const strand of census?.strands ?? []) {
          expect(visibleOf(await host.materializeStrand(strand.strandId)), `${scenario.graph}/${strand.strandId}`)
            .toEqual(strand.visible);
        }
      });
    }
  });

  it('keeps lane mints bare and gives each strand the manifest mint under its new id', () => {
    for (const scenario of manifest.scenarios.filter((candidate) => candidate.proposedMigration.verdict === 'migrate')) {
      const record = recordOf(outcomes.get(scenario.graph));
      const ids = new Map(record.strands.map((strand) => [strand.name, strand.strandId ?? '']));
      const expected = scenario.proposedMigration.mints
        .map((mint) => mint.replace(/\{([^}]+)\}/, (_match, name: string) => ids.get(name) ?? '?'))
        .sort();
      const actual = [...Object.keys(record.frontier.lanes), ...record.strands.map((strand) => strand.mint ?? '?')].sort();
      expect(actual, scenario.graph).toEqual(expected);
      expect(record.strands.every((strand) => strand.status === 'converted')).toBe(true);
    }
  });

  it('persists the manifest allocation floors', () => {
    for (const scenario of manifest.scenarios) {
      const floors = scenario.proposedMigration.allocationFloors;
      if (floors === undefined) { continue; }
      expect(recordOf(outcomes.get(scenario.graph)).floors, scenario.graph).toMatchObject(floors);
    }
  });

  it('reports the manifest damage and never blocks on duplicates', () => {
    for (const scenario of manifest.scenarios.filter((candidate) => candidate.proposedMigration.verdict === 'migrate')) {
      const { damage } = recordOf(outcomes.get(scenario.graph));
      const kinds = [
        ...(damage.duplicateDots.length > 0 ? ['duplicate-dot'] : []),
        ...(damage.collateralDeletions.length > 0 ? ['collateral-deletion'] : []),
      ];
      expect(kinds, scenario.graph).toEqual(scenario.proposedMigration.damage ?? []);
    }
  });

  it('collision-remove: the strand remove of lane:1 still names lane dot next:1, and its own dots are re-keyed', async () => {
    const record = recordOf(outcomes.get('collision-remove'));
    const mint = record.strands[0]?.mint ?? '';
    await withFixtureHost(repository, 'collision-remove', 'migration-reader', async (host) => {
      const entries = await host.getStrandOverlayPatches('next');
      const ops = entries.flatMap(({ patch }) => patch.ops);
      expect(ops.filter((op) => op instanceof NodeAdd).map((op) => `${op.dot.writerId}:${op.dot.counter}`))
        .toEqual([`${mint}:2`, `${mint}:3`]);
      expect(ops.filter((op) => op instanceof NodeRemove).map((op) => [op.node, [...op.observedDots]]))
        .toEqual([['lane:1', ['next:1']], ['strand:2', [`${mint}:3`]]]);
    });
  });

  it('shared-dot-strand-remove: the strand still hides both notes and the strand-local collateral deletion is reported', () => {
    const { damage } = recordOf(outcomes.get('shared-dot-strand-remove'));
    expect(damage.collateralDeletions).toEqual([
      expect.objectContaining({ scope: 'strand:cleanup', target: 'note:drop', observedDot: 'alice:1', collateralTargets: ['note:keep'] }),
    ]);
  });

  it('counter-reset: after migration alice writes above alice:100', async () => {
    await withFixtureHost(repository, 'counter-reset', 'alice', async (host) => {
      const builder = await host.createPatch();
      builder.addNode('item:after-migration');
      await builder.commit();
      const added = (await host.getWriterPatches('alice')).flatMap(({ patch }) => patch.ops)
        .filter((op): op is NodeAdd => op instanceof NodeAdd && op.node === 'item:after-migration');
      expect(added.map((op) => op.dot.counter)).toEqual([101]);
    });
  });

  it('migrates the ownerless strand once an owner is assigned, and reports a rerun as already migrated', async () => {
    const session = await V21MigrationSession.open(repository);
    try {
      const assigned = await session.migrate('ownerless', new Map([['orphan', 'alice']]));
      expect(assigned.status).toBe('migrated');
      expect(recordOf(assigned).strands[0]).toMatchObject({ name: 'orphan', owner: 'alice', status: 'converted' });
      expect((await session.migrate('golden', new Map())).status).toBe('already-migrated');
    } finally {
      await session.close();
    }
    await withFixtureHost(repository, 'ownerless', 'migration-reader', async (host) => {
      expect(visibleOf(await host.materializeStrand('orphan')).nodes).toEqual(['base:1', 'orphan:1']);
    });
  });
});

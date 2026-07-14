import { describe, expect, it } from 'vitest';

import WarpApp from '../../../src/domain/WarpApp.ts';
import Observer from '../../../src/domain/services/query/Observer.ts';
import type { Aperture } from '../../../src/domain/types/Aperture.ts';
import WarpWorldline from '../../../src/domain/WarpWorldline.ts';
import InMemoryGraphAdapter from '../../../src/infrastructure/adapters/InMemoryGraphAdapter.ts';
import {
  openMemoryWarpApp,
  openMemoryWarpGraph as openWarpGraph,
  openMemoryWarpWorldline as openWarpWorldline,
} from '../../helpers/MemoryRuntimeHost.ts';
import { createInMemoryRepo } from '../../helpers/warpGraphTestUtils.ts';

const PUBLIC_USERS_APERTURE: Aperture = Object.freeze({
  match: 'user:*',
  expose: ['name', 'role', 'level'],
  redact: ['secret'],
});

async function openEventsWorldline(): Promise<WarpWorldline> {
  return await openWarpWorldline({
    persistence: new InMemoryGraphAdapter(),
    worldlineName: 'events',
    writerId: 'agent-1',
  });
}

async function seedGuideGraph(events: WarpWorldline): Promise<void> {
  await events.commit((patch) => {
    patch
      .addNode('user:alice')
      .setProperty('user:alice', 'name', 'Alice')
      .setProperty('user:alice', 'role', 'engineering')
      .setProperty('user:alice', 'level', 3)
      .setProperty('user:alice', 'secret', 'redacted')
      .addNode('user:bob')
      .setProperty('user:bob', 'name', 'Bob')
      .setProperty('user:bob', 'role', 'engineering')
      .setProperty('user:bob', 'level', 2)
      .addNode('user:carol')
      .setProperty('user:carol', 'name', 'Carol')
      .setProperty('user:carol', 'role', 'marketing')
      .setProperty('user:carol', 'level', 1)
      .addNode('project:atlas')
      .addNode('internal:salary')
      .addEdge('user:alice', 'user:bob', 'manages')
      .addEdge('user:bob', 'user:carol', 'knows')
      .addEdge('user:alice', 'project:atlas', 'owns')
      .addEdge('user:alice', 'internal:salary', 'classified');
  });
}

describe('internal worldline executable examples', () => {
  it('opens the internal graph composition root', async () => {
    const graph = await openWarpGraph({
      persistence: new InMemoryGraphAdapter(),
      graphName: 'public-api-smoke',
      writerId: 'agent-1',
    });

    expect(Object.isFrozen(graph)).toBe(true);
    expect(graph.revelation.query).toBe(graph.query);
    expect(graph.commitment.patches).toBe(graph.patches);
    expect(graph.graphName).toBe('public-api-smoke');
    expect(graph.writerId).toBe('agent-1');
  });

  it('runs the getting-started worldline write/read path end to end', async () => {
    const events = await openEventsWorldline();

    const sha = await events.commit((patch) => {
      patch
        .addNode('user:alice')
        .setProperty('user:alice', 'name', 'Alice')
        .setProperty('user:alice', 'role', 'engineering')
        .addNode('project:atlas')
        .addEdge('user:alice', 'project:atlas', 'owns');
    });

    const live = events.live();
    const queryResult = await live.query().match('user:*').select(['id', 'props']).run();

    expect(sha.length).toBeGreaterThan(0);
    await expect(live.hasNode('user:alice')).resolves.toBe(true);
    await expect(live.hasNode('project:atlas')).resolves.toBe(true);
    await expect(live.getNodeProps('user:alice')).resolves.toEqual({
      name: 'Alice',
      role: 'engineering',
    });
    expect(queryResult).toMatchObject({
      nodes: [
        {
          id: 'user:alice',
          props: {
            name: 'Alice',
            role: 'engineering',
          },
        },
      ],
    });
  });

  it('runs guide-style filtered queries, traversals, aggregates, and conflict reads', async () => {
    const persistence = new InMemoryGraphAdapter();
    const writerA = await openWarpWorldline({
      persistence,
      worldlineName: 'guide',
      writerId: 'writer-a',
    });
    const writerB = await openWarpWorldline({
      persistence,
      worldlineName: 'guide',
      writerId: 'writer-b',
    });

    await seedGuideGraph(writerA);
    await writerA.commit((patch) => {
      patch.setProperty('user:alice', 'status', 'reviewing');
    });
    await writerB.commit((patch) => {
      patch.addNode('writer-b:clock');
    });
    await writerB.commit((patch) => {
      patch.setProperty('user:alice', 'status', 'approved');
    });

    const live = writerA.live();
    const engineers = await live
      .query()
      .match('user:*')
      .where({ role: 'engineering' })
      .select(['id'])
      .run();
    const directReports = await live
      .query()
      .match('user:alice')
      .outgoing('manages')
      .select(['id'])
      .run();
    const twoHopPath = await live
      .query()
      .match('user:alice')
      .outgoing('manages')
      .outgoing('knows')
      .select(['id'])
      .run();
    const aggregate = await live
      .query()
      .match('user:*')
      .aggregate({ count: true, sum: 'level', avg: 'level' })
      .run();

    expect(engineers).toMatchObject({
      nodes: [{ id: 'user:alice' }, { id: 'user:bob' }],
    });
    expect(directReports).toMatchObject({ nodes: [{ id: 'user:bob' }] });
    expect(twoHopPath).toMatchObject({ nodes: [{ id: 'user:carol' }] });
    expect(aggregate).toMatchObject({ count: 3, sum: 6, avg: 2 });
    await expect(live.getNodeProps('user:alice')).resolves.toMatchObject({
      status: 'approved',
    });
  });

  it('materializes observer geometry with deterministic live and historical apertures', async () => {
    const events = await openEventsWorldline();
    await events.commit((patch) => {
      patch
        .addNode('user:alice')
        .setProperty('user:alice', 'name', 'Alice')
        .setProperty('user:alice', 'secret', 'redacted');
    });
    await events.commit((patch) => {
      patch
        .addNode('user:bob')
        .setProperty('user:bob', 'name', 'Bob')
        .addNode('internal:salary')
        .addEdge('user:alice', 'user:bob', 'knows')
        .addEdge('user:alice', 'internal:salary', 'classified');
    });

    const liveObserver = await events.observer('public-users', PUBLIC_USERS_APERTURE);
    const historical = await events.seek({ source: { kind: 'live', ceiling: 1 } });
    const historicalObserver = await historical.observer(
      'public-users-at-first-tick',
      PUBLIC_USERS_APERTURE
    );

    expect(liveObserver).toBeInstanceOf(Observer);
    expect(liveObserver.name).toBe('public-users');
    expect(liveObserver.source).toEqual({ kind: 'live' });
    await expect(liveObserver.getNodes()).resolves.toEqual(['user:alice', 'user:bob']);
    await expect(liveObserver.getNodeProps('user:alice')).resolves.toEqual({ name: 'Alice' });
    await expect(liveObserver.getEdges()).resolves.toEqual([
      {
        from: 'user:alice',
        to: 'user:bob',
        label: 'knows',
        props: {},
      },
    ]);

    expect(historicalObserver.name).toBe('public-users-at-first-tick');
    expect(historicalObserver.source).toEqual({ kind: 'live', ceiling: 1 });
    await expect(historicalObserver.getNodes()).resolves.toEqual(['user:alice']);
    await expect(historicalObserver.hasNode('user:bob')).resolves.toBe(false);
  });

  it('signals worldline read costs through runtime capability posture objects', async () => {
    const events = await openEventsWorldline();
    const report = events.capabilities();

    expect(report.safeNames()).toEqual(['memory-budget-contract']);
    expect(report.transitionalNames()).toEqual(['checkpoint-tail-optics']);
    expect(report.diagnosticNames()).toEqual(['graph-wide-materialization']);
    expect(report.legacyNames()).toEqual(['legacy-query-arrays']);
    expect(report.requireCapability('memory-budget-contract').posture.toString()).toBe('safe');
    expect(report.requireCapability('checkpoint-tail-optics').posture.toString()).toBe(
      'transitional'
    );
    expect(report.requireCapability('graph-wide-materialization').posture.toString()).toBe(
      'diagnostic'
    );
    expect(report.requireCapability('legacy-query-arrays').posture.toString()).toBe('legacy');
  });

  it('uses migrated in-memory test fixtures through the worldline handle', async () => {
    const repo = createInMemoryRepo();
    try {
      const events = await openWarpWorldline({
        persistence: repo.persistence,
        worldlineName: 'helper-migration',
        writerId: 'agent-1',
      });

      await events.commit((patch) => {
        patch.addNode('helper:node');
      });

      await expect(events.live().hasNode('helper:node')).resolves.toBe(true);
      expect(events).toBeInstanceOf(WarpWorldline);
      expect(Object.isFrozen(events)).toBe(true);
      expect('materialize' in events).toBe(false);
    } finally {
      await repo.cleanup();
    }
  });

  it('keeps WarpApp observer labels as runtime identity instead of source text', async () => {
    const app = await openMemoryWarpApp({
      persistence: new InMemoryGraphAdapter(),
      graphName: 'app-observers',
      writerId: 'agent-1',
      autoMaterialize: true,
    });

    await app.patch((patch) => {
      patch
        .addNode('user:alice')
        .setProperty('user:alice', 'name', 'Alice')
        .setProperty('user:alice', 'secret', 'redacted');
    });
    await app.core().materialize();

    const defaultObserver = await app.observer(PUBLIC_USERS_APERTURE);
    const namedObserver = await app.observer('public-users', PUBLIC_USERS_APERTURE);

    expect(defaultObserver).toBeInstanceOf(Observer);
    expect(defaultObserver.name).toBe('observer');
    expect(namedObserver).toBeInstanceOf(Observer);
    expect(namedObserver.name).toBe('public-users');
    await expect(namedObserver.getNodeProps('user:alice')).resolves.toEqual({ name: 'Alice' });
  });
});

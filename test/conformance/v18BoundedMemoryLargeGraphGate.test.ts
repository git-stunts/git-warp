import { describe, expect, it } from 'vitest';

import { openWarpWorldline } from '../../index.ts';
import MemoryBudgetError from '../../src/domain/errors/MemoryBudgetError.ts';
import BoundedQueryReadModel from '../../src/domain/services/query/BoundedQueryReadModel.ts';
import InMemoryGraphAdapter from '../../src/infrastructure/adapters/InMemoryGraphAdapter.ts';
import V18LargeGraphOverSmallPoolFixture from './fixtures/V18LargeGraphOverSmallPoolFixture.ts';

describe('v18 bounded-memory large-graph gate', () => {
  it('supplies a canonical large-graph-over-small-pool fixture', () => {
    const fixture = new V18LargeGraphOverSmallPoolFixture();

    expect(fixture.nodeCount).toBeGreaterThan(fixture.pool.snapshot().limit);
    expect(() => fixture.leaseWholeGraph()).toThrow(MemoryBudgetError);
  });

  it('streams fixture nodes through bounded one-result leases', async () => {
    const fixture = new V18LargeGraphOverSmallPoolFixture();
    const readModel = new BoundedQueryReadModel({
      source: fixture.readModel(),
      pool: fixture.pool,
    });
    const nodeIds: string[] = [];

    for await (const node of readModel.nodes({ pattern: '*', select: null })) {
      nodeIds.push(node.id);
    }

    expect(nodeIds).toEqual(fixture.nodeIds);
    expect(fixture.pool.snapshot()).toMatchObject({
      leased: 0,
      peak: 1,
      rejected: 0,
    });
  });

  it('leases exact node property reads without requiring full-node residency', async () => {
    const fixture = new V18LargeGraphOverSmallPoolFixture();
    const readModel = new BoundedQueryReadModel({
      source: fixture.readModel(),
      pool: fixture.pool,
    });

    await expect(readModel.nodeProps('v18:node:03')).resolves.toEqual({});
    expect(fixture.pool.snapshot()).toMatchObject({
      leased: 0,
      peak: 1,
      rejected: 0,
    });
  });

  it('keeps blessed worldline public paths off full-residency APIs', async () => {
    const worldline = await openWarpWorldline({
      persistence: new InMemoryGraphAdapter(),
      worldlineName: 'v18-bounded-public-path',
      writerId: 'agent-1',
    });

    expect('materialize' in worldline).toBe(false);
    expect('getStateSnapshot' in worldline).toBe(false);
    expect('getNodes' in worldline).toBe(false);
    expect('getEdges' in worldline).toBe(false);
    expect(worldline.capabilities().legacyNames()).toEqual(['legacy-query-arrays']);
    expect(worldline.capabilities().diagnosticNames()).toEqual(['graph-wide-materialization']);
  });
});

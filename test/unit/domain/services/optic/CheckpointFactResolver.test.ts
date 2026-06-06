import { describe, expect, it } from 'vitest';

import MemoryBudget from '../../../../../src/domain/memory/MemoryBudget.ts';
import WarpMemoryPool from '../../../../../src/domain/memory/WarpMemoryPool.ts';
import CheckpointFactResolver from '../../../../../src/domain/services/optic/CheckpointFactResolver.ts';
import {
  CheckpointContentAnchorFact,
  CheckpointEdgeFact,
  CheckpointNodeLivenessFact,
  CheckpointNodePropertyFact,
  type CheckpointBasisFact,
} from '../../../../../src/domain/services/optic/CheckpointBasisFact.ts';
import { EventId } from '../../../../../src/domain/utils/EventId.ts';

describe('CheckpointFactResolver', () => {
  it('resolves node liveness from a streamed fact set under a one-fact pool', async () => {
    const { resolver, pool } = resolverFixture();

    await expect(resolver.resolveNodeLiveness(facts([
      nodeAlive('task:1', true, 1),
      nodeAlive('task:1', false, 3),
      nodeAlive('task:2', true, 2),
    ]), 'task:1')).resolves.toBe(false);
    await expect(resolver.resolveNodeLiveness(facts([
      nodeAlive('task:1', true, 1),
    ]), 'task:missing')).resolves.toBeNull();
    expect(pool.snapshot()).toMatchObject({ leased: 0, peak: 1, rejected: 0 });
  });

  it('resolves edge endpoint liveness from latest streamed edge fact', async () => {
    const { resolver, pool } = resolverFixture();

    await expect(resolver.resolveEdgeEndpoints(facts([
      edgeFact('task:1', 'task:2', 'blocks', true, 1),
      edgeFact('task:1', 'task:2', 'blocks', false, 4),
      edgeFact('task:2', 'task:3', 'blocks', true, 3),
    ]), { from: 'task:1', to: 'task:2', label: 'blocks' })).resolves.toEqual({
      from: 'task:1',
      to: 'task:2',
      label: 'blocks',
      alive: false,
    });
    expect(pool.snapshot()).toMatchObject({ leased: 0, peak: 1, rejected: 0 });
  });

  it('resolves node property values without confusing null with not-found', async () => {
    const { resolver, pool } = resolverFixture();

    await expect(resolver.resolveNodeProperty(facts([
      nodeProperty('task:1', 'title', 'first', 1),
      nodeProperty('task:1', 'title', 'latest', 2),
      nodeProperty('task:1', 'optional', null, 3),
    ]), { nodeId: 'task:1', key: 'title' })).resolves.toEqual({ found: true, value: 'latest' });
    await expect(resolver.resolveNodeProperty(facts([
      nodeProperty('task:1', 'optional', null, 3),
    ]), { nodeId: 'task:1', key: 'optional' })).resolves.toEqual({ found: true, value: null });
    await expect(resolver.resolveNodeProperty(facts([]), { nodeId: 'task:1', key: 'missing' })).resolves.toEqual({
      found: false,
      value: null,
    });
    expect(pool.snapshot()).toMatchObject({ leased: 0, peak: 1, rejected: 0 });
  });

  it('resolves current content OID from streamed content anchors', async () => {
    const { resolver, pool } = resolverFixture();

    await expect(resolver.resolveContentOid(facts([
      contentAnchor('task:1', 'oid-old', 1),
      contentAnchor('task:1', 'oid-current', 5),
      contentAnchor('task:2', 'oid-other', 6),
    ]), 'task:1')).resolves.toBe('oid-current');
    await expect(resolver.resolveContentOid(facts([]), 'task:missing')).resolves.toBeNull();
    expect(pool.snapshot()).toMatchObject({ leased: 0, peak: 1, rejected: 0 });
  });
});

function resolverFixture(): { readonly resolver: CheckpointFactResolver; readonly pool: WarpMemoryPool } {
  const pool = new WarpMemoryPool({
    name: 'checkpoint-fact-resolver',
    budget: MemoryBudget.facts(1),
  });
  return Object.freeze({
    resolver: new CheckpointFactResolver({ pool }),
    pool,
  });
}

async function* facts(values: readonly CheckpointBasisFact[]): AsyncIterable<CheckpointBasisFact> {
  for (const value of values) {
    yield value;
  }
}

function nodeAlive(nodeId: string, alive: boolean, lamport: number): CheckpointNodeLivenessFact {
  return new CheckpointNodeLivenessFact({ nodeId, alive, eventId: event(lamport) });
}

function edgeFact(from: string, to: string, label: string, alive: boolean, lamport: number): CheckpointEdgeFact {
  return new CheckpointEdgeFact({ from, to, label, alive, eventId: event(lamport) });
}

function nodeProperty(nodeId: string, key: string, value: string | null, lamport: number): CheckpointNodePropertyFact {
  return new CheckpointNodePropertyFact({ nodeId, key, value, eventId: event(lamport) });
}

function contentAnchor(owner: string, contentOid: string, lamport: number): CheckpointContentAnchorFact {
  return new CheckpointContentAnchorFact({ owner, contentOid, eventId: event(lamport) });
}

function event(lamport: number): EventId {
  return new EventId(lamport, 'writer-a', lamport.toString(16).padStart(4, '0'), 0);
}

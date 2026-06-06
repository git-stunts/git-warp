import { describe, expect, it } from 'vitest';

import MemoryBudget from '../../../../../src/domain/memory/MemoryBudget.ts';
import WarpMemoryPool from '../../../../../src/domain/memory/WarpMemoryPool.ts';
import CheckpointExistingEntityWriteResolver
  from '../../../../../src/domain/services/optic/CheckpointExistingEntityWriteResolver.ts';
import {
  CheckpointEdgeFact,
  CheckpointNodeLivenessFact,
  type CheckpointBasisFact,
} from '../../../../../src/domain/services/optic/CheckpointBasisFact.ts';
import { EventId } from '../../../../../src/domain/utils/EventId.ts';

describe('CheckpointExistingEntityWriteResolver', () => {
  it('allows existing-node property writes and rejects tombstoned nodes without full state', async () => {
    const { resolver, pool } = resolverFixture();

    await expect(resolver.canWriteNodeProperty(facts([
      nodeAlive('task:1', true, 1),
      nodeAlive('task:2', true, 2),
      nodeAlive('task:2', false, 3),
    ]), 'task:1')).resolves.toBe(true);
    await expect(resolver.canWriteNodeProperty(facts([
      nodeAlive('task:2', true, 2),
      nodeAlive('task:2', false, 3),
    ]), 'task:2')).resolves.toBe(false);
    expect(pool.snapshot()).toMatchObject({ leased: 0, peak: 1, rejected: 0 });
  });

  it('allows existing-edge property writes and rejects removed edges without full state', async () => {
    const { resolver, pool } = resolverFixture();

    await expect(resolver.canWriteEdgeProperty(facts([
      edgeFact('task:1', 'task:2', 'blocks', true, 1),
      edgeFact('task:3', 'task:4', 'blocks', true, 2),
    ]), { from: 'task:1', to: 'task:2', label: 'blocks' })).resolves.toBe(true);
    await expect(resolver.canWriteEdgeProperty(facts([
      edgeFact('task:1', 'task:2', 'blocks', true, 1),
      edgeFact('task:1', 'task:2', 'blocks', false, 2),
    ]), { from: 'task:1', to: 'task:2', label: 'blocks' })).resolves.toBe(false);
    expect(pool.snapshot()).toMatchObject({ leased: 0, peak: 1, rejected: 0 });
  });
});

function resolverFixture(): { readonly resolver: CheckpointExistingEntityWriteResolver; readonly pool: WarpMemoryPool } {
  const pool = new WarpMemoryPool({
    name: 'existing-entity-write-resolver',
    budget: MemoryBudget.facts(1),
  });
  return Object.freeze({
    resolver: new CheckpointExistingEntityWriteResolver({ pool }),
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

function event(lamport: number): EventId {
  return new EventId(lamport, 'writer-a', lamport.toString(16).padStart(4, '0'), 0);
}

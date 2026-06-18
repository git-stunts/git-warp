import { describe, expect, it } from 'vitest';

import {
  addNodeToState,
  createEmptyState,
  createInMemoryRepo,
  createMockPersistence,
  createOidGenerator,
  createPatch,
} from '../../helpers/warpGraphTestUtils.ts';

describe('warp graph test helper structure', () => {
  it('keeps the legacy helper barrel executable for persistence and patch fixtures', async () => {
    const persistence = createMockPersistence();
    const oidGenerator = createOidGenerator();
    const ref = 'refs/warp/test/writers/agent-1';
    const currentOid = oidGenerator.next();
    const patch = createPatch({
      writer: 'agent-1',
      lamport: 1,
      ops: [
        {
          type: 'NodeAdd',
          node: 'node:barrel',
          dot: { writerId: 'agent-1', counter: 1 },
        },
      ],
    });

    await persistence.updateRef(ref, currentOid);

    await expect(persistence.readRef(ref)).resolves.toBe(currentOid);
    expect(patch.writer).toBe('agent-1');
    expect(patch.ops).toHaveLength(1);
  });

  it('keeps state and in-memory repository helpers executable through the barrel', async () => {
    const state = createEmptyState();
    const repo = createInMemoryRepo();

    addNodeToState(state, 'node:seeded', 1, 'agent-1');

    expect(state.nodeAlive.contains('node:seeded')).toBe(true);
    expect(repo.persistence.emptyTree).toBe('4b825dc642cb6eb9a060e54bf8d69288fbee4904');
    await expect(repo.cleanup()).resolves.toBeUndefined();
  });
});

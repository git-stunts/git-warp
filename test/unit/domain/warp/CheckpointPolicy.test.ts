import { describe, expect, it, vi } from 'vitest';

import CheckpointPolicy from '../../../../src/domain/warp/CheckpointPolicy.ts';
import { openMemoryRuntimeHostProduct } from '../../../helpers/MemoryRuntimeHost.ts';
import InMemoryGraphAdapter from '../../../helpers/InMemoryGraphAdapter.ts';

describe('CheckpointPolicy', () => {
  it('provides an immutable default cadence of exactly 64 patches', () => {
    expect(CheckpointPolicy.DEFAULT).toBeInstanceOf(CheckpointPolicy);
    expect(CheckpointPolicy.DEFAULT.every).toBe(64);
    expect(Object.isFrozen(CheckpointPolicy.DEFAULT)).toBe(true);
  });

  it('constructs an immutable policy from boundary configuration', () => {
    const config = { every: 5 };
    const policy = CheckpointPolicy.from(config);

    expect(policy).toBeInstanceOf(CheckpointPolicy);
    expect(policy.every).toBe(5);
    expect(policy).not.toBe(config);
    expect(Object.isFrozen(policy)).toBe(true);
  });

  it('preserves an already-validated policy instance', () => {
    expect(CheckpointPolicy.from(CheckpointPolicy.DEFAULT)).toBe(CheckpointPolicy.DEFAULT);
  });

  it.each([0, -1, 1.5])('rejects invalid cadence %s', (every) => {
    expect(() => CheckpointPolicy.from({ every })).toThrow(
      'checkpointPolicy.every must be a positive integer',
    );
  });

  it('checkpoints at exactly the default threshold, but not before it', async () => {
    const persistence = new InMemoryGraphAdapter();
    const graph = await openMemoryRuntimeHostProduct({
      persistence,
      graphName: 'test',
      writerId: 'writer-1',
      autoMaterialize: false,
    });
    for (let patchNumber = 1; patchNumber < 64; patchNumber += 1) {
      await graph.patch((patch) => {
        patch.addNode(`node:${patchNumber}`);
      });
    }
    const createCheckpoint = vi.spyOn(graph, 'createCheckpoint').mockResolvedValue('checkpoint-sha');

    await graph.materialize();
    expect(createCheckpoint).not.toHaveBeenCalled();

    await graph.patch((patch) => {
      patch.addNode('node:64');
    });
    await graph.materialize();
    expect(createCheckpoint).toHaveBeenCalledOnce();
  });
});

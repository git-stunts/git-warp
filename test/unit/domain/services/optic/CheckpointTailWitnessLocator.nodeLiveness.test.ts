import { describe, expect, it } from 'vitest';
import { Dot, encodeDot } from '../../../../../src/domain/crdt/Dot.ts';
import NodeAdd from '../../../../../src/domain/types/ops/NodeAdd.ts';
import NodeRemove from '../../../../../src/domain/types/ops/NodeRemove.ts';
import { NODE_LIFECYCLE_RECEIPT_PATH } from '../../../../../src/domain/services/index/NodeLifecycleShardReader.ts';
import {
  HARNESS_NODE, replay, stepsOf, tailNodeRead, type HarnessScenario,
} from '../../../../helpers/CheckpointTailLifecycleHarness.ts';

const removedDot = Dot.create('Y', 1);
const removedAdd = { writer: 'Y', lamport: 3, sha: 'ffff0003', ops: [new NodeAdd(HARNESS_NODE, removedDot)] };
const remove = { writer: 'X', lamport: 5, sha: 'dddd0005', ops: [new NodeRemove(HARNESS_NODE, [encodeDot(removedDot)])] };
const independentAdd = { writer: 'A', lamport: 1, sha: 'aaaa0001', ops: [new NodeAdd(HARNESS_NODE, Dot.create('A', 1))] };
const removedScenario: HarnessScenario = { checkpoint: [remove], tail: [removedAdd] };

describe('checkpoint-tail node liveness with floating removed dots (#894)', () => {
  it.each([
    { name: 'only the removed dot exists', scenario: removedScenario, expected: false },
    { name: 'an independent checkpoint add survives', scenario: { checkpoint: [independentAdd, remove], tail: [removedAdd] }, expected: true },
    { name: 'an independent tail add survives', scenario: { checkpoint: [remove], tail: [removedAdd, independentAdd] }, expected: true },
  ])('agrees with full membership when $name', async ({ scenario, expected }) => {
    const all = [...scenario.checkpoint, ...scenario.tail];
    for (const patches of [all, [...all].reverse()]) {
      expect(replay(stepsOf(patches)).nodeAlive.contains(HARNESS_NODE)).toBe(expected);
    }
    for (const tail of [scenario.tail, [...scenario.tail].reverse()]) {
      expect((await tailNodeRead({ checkpoint: scenario.checkpoint, tail })).alive).toBe(expected);
    }
  });

  it('includes the tombstone receipt in read identity', async () => {
    const read = await tailNodeRead(removedScenario);
    expect(read.readIdentity.checkpointIndexShards.map((shard) => shard.path)).toContain(NODE_LIFECYCLE_RECEIPT_PATH);
  });

  it('reads unchanged checkpoint membership without legacy lifecycle records', async () => {
    const read = await tailNodeRead({ checkpoint: [independentAdd], tail: [] }, { recordsAbsent: true });
    expect(read.alive).toBe(true);
  });

  it('refuses an invalid lifecycle receipt instead of assuming no tombstones', async () => {
    await expect(tailNodeRead(removedScenario, { damage: 'receipt-schema-version' })).rejects.toMatchObject({
      code: 'E_OPTIC_NO_BOUNDED_BASIS', context: { cause: 'checkpoint-shard-invalid' },
    });
  });

  it('refuses a tail add when the checkpoint has no lifecycle receipt', async () => {
    await expect(tailNodeRead(removedScenario, { recordsAbsent: true })).rejects.toMatchObject({
      code: 'E_OPTIC_NO_BOUNDED_BASIS',
      context: { cause: 'tail-node-add-needs-checkpoint-lifecycle-witnesses' },
    });
  });
});

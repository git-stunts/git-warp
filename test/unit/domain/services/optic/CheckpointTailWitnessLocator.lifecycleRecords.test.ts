/**
 * A bounded checkpoint-tail property read must agree with the state that
 * every delivery order of the same operations reduces to, or refuse.
 *
 * Each case lists the checkpoint patches and the tail patches. The read goes
 * through CheckpointTailWitnessLocator over index roots written by the
 * checkpoint writer (`MaterializationIndexRootPlan`), so it sees exactly what
 * a checkpoint stores. Oracle: `projectState` over a JoinReducer replay of
 * every permutation of every operation, which is the reduction
 * `materialize()` performs. The reducer is also fed the tail patches in
 * every order and must give the same answer.
 *
 * The cases where a tail event sorts below a checkpoint event need two
 * writers that did not see each other's patches, so lamport clocks here are
 * chosen by hand.
 */

import { describe, expect, it } from 'vitest';
import { Dot, encodeDot } from '../../../../../src/domain/crdt/Dot.ts';
import NodeAdd from '../../../../../src/domain/types/ops/NodeAdd.ts';
import NodeRemove from '../../../../../src/domain/types/ops/NodeRemove.ts';
import PropSet from '../../../../../src/domain/types/ops/PropSet.ts';
import {
  HARNESS_KEY as KEY,
  HARNESS_NODE as NODE,
  materializedValue,
  reducerReadsInEveryTailOrder,
  tailRead,
  type HarnessScenario,
} from '../../../../helpers/CheckpointTailLifecycleHarness.ts';

const add = (writer: string, counter: number): NodeAdd => new NodeAdd(NODE, Dot.create(writer, counter));
const remove = (...dots: readonly (readonly [string, number])[]): NodeRemove => new NodeRemove(
  NODE,
  dots.map(([writer, counter]) => encodeDot(Dot.create(writer, counter))),
);
const write = (value: string): PropSet => new PropSet(NODE, KEY, value);

/** Round 4 probe (c): a tail write sorts below a pending checkpoint remove that a tail add passes. */
const PROBE_C: HarnessScenario = {
  checkpoint: [
    { writer: 'A', lamport: 1, sha: 'aaaa0001', ops: [add('A', 1)] },
    { writer: 'B', lamport: 3, sha: 'bbbb0003', ops: [add('B', 1)] },
    { writer: 'A', lamport: 5, sha: 'aaaa0005', ops: [remove(['A', 1])] },
  ],
  tail: [
    { writer: 'C', lamport: 4, sha: 'cccc0004', ops: [write('w')] },
    { writer: 'C', lamport: 6, sha: 'cccc0006', ops: [add('C', 1)] },
  ],
};

/** Round 4 probe (e): a tail write sorts below the checkpoint's clear event, with no tail add or remove. */
const PROBE_E: HarnessScenario = {
  checkpoint: [
    { writer: 'A', lamport: 1, sha: 'aaaa0001', ops: [add('A', 1)] },
    { writer: 'A', lamport: 8, sha: 'aaaa0008', ops: [remove(['A', 1])] },
    { writer: 'A', lamport: 10, sha: 'aaaa000a', ops: [add('A', 2)] },
  ],
  tail: [{ writer: 'B', lamport: 5, sha: 'bbbb0005', ops: [write('x')] }],
};

/** Round 4 control: the same write sorting above the checkpoint. */
const PROBE_CONTROL: HarnessScenario = {
  checkpoint: PROBE_E.checkpoint,
  tail: [{ writer: 'B', lamport: 11, sha: 'bbbb000b', ops: [write('x')] }],
};

/** Round 3: the checkpoint holds a pending remove; a tail add passes it and hides the checkpoint value. */
const PENDING_REMOVE_THEN_TAIL_ADD: HarnessScenario = {
  checkpoint: [
    { writer: 'A', lamport: 1, sha: 'aaaa0001', ops: [add('A', 1)] },
    { writer: 'A', lamport: 2, sha: 'aaaa0002', ops: [write('v')] },
    { writer: 'B', lamport: 3, sha: 'bbbb0003', ops: [add('B', 1)] },
    { writer: 'A', lamport: 5, sha: 'aaaa0005', ops: [remove(['A', 1])] },
  ],
  tail: [{ writer: 'W', lamport: 6, sha: 'eeee0006', ops: [add('W', 9)] }],
};

/** Round 4 counterexample (b): a concurrent tail remove and add sort below the checkpoint value. */
const CONCURRENT_TAIL_READD: HarnessScenario = {
  checkpoint: [
    { writer: 'A', lamport: 1, sha: 'aaaa0001', ops: [add('A', 1)] },
    { writer: 'A', lamport: 5, sha: 'aaaa0005', ops: [write('v')] },
  ],
  tail: [
    { writer: 'B', lamport: 3, sha: 'bbbb0003', ops: [remove(['A', 1])] },
    { writer: 'B', lamport: 4, sha: 'bbbb0004', ops: [add('B', 1)] },
  ],
};

/** One writer removes and re-adds the node after the checkpoint, then writes again. */
const SINGLE_WRITER_READD: HarnessScenario = {
  checkpoint: [
    { writer: 'A', lamport: 1, sha: 'aaaa0001', ops: [add('A', 1)] },
    { writer: 'A', lamport: 2, sha: 'aaaa0002', ops: [write('v')] },
  ],
  tail: [
    { writer: 'A', lamport: 3, sha: 'aaaa0003', ops: [remove(['A', 1])] },
    { writer: 'A', lamport: 4, sha: 'aaaa0004', ops: [add('A', 2)] },
  ],
};

const SINGLE_WRITER_READD_AND_WRITE: HarnessScenario = {
  checkpoint: SINGLE_WRITER_READD.checkpoint,
  tail: [
    ...SINGLE_WRITER_READD.tail,
    { writer: 'A', lamport: 5, sha: 'aaaa0005', ops: [write('new')] },
  ],
};

/** A tail write sorts below the checkpoint's value, which therefore wins. */
const TAIL_WRITE_BELOW_CHECKPOINT_VALUE: HarnessScenario = {
  checkpoint: [
    { writer: 'A', lamport: 1, sha: 'aaaa0001', ops: [add('A', 1)] },
    { writer: 'A', lamport: 7, sha: 'aaaa0007', ops: [write('v')] },
  ],
  tail: [{ writer: 'B', lamport: 4, sha: 'bbbb0004', ops: [write('late')] }],
};

describe('checkpoint-tail property reads with node lifecycle records in the checkpoint', () => {
  it.each([
    ['probe (c): tail write below a pending remove, then a tail add', PROBE_C, null],
    ['probe (e): tail write below the checkpoint clear event', PROBE_E, null],
    ['probe control: tail write above the checkpoint', PROBE_CONTROL, 'x'],
    ['round 3: pending checkpoint remove, then a tail add', PENDING_REMOVE_THEN_TAIL_ADD, null],
    ['round 4 (b): concurrent tail remove and add below the checkpoint value', CONCURRENT_TAIL_READD, 'v'],
    ['one writer removes and re-adds the node in the tail', SINGLE_WRITER_READD, null],
    ['one writer re-adds the node and writes again in the tail', SINGLE_WRITER_READD_AND_WRITE, 'new'],
    ['a tail write sorts below the checkpoint value', TAIL_WRITE_BELOW_CHECKPOINT_VALUE, 'v'],
  ] as const)('%s', async (_name, scenario, expected) => {
    expect(materializedValue(scenario)).toBe(expected);

    const read = await tailRead(scenario);

    expect(read).toEqual({ kind: 'value', value: materializedValue(scenario) });
    for (const reordered of reducerReadsInEveryTailOrder(scenario)) {
      expect(reordered).toEqual(read);
    }
  });
});

describe('checkpoint-tail property reads the records cannot decide', () => {
  it('refuses when a tail remove may leave the node without a live add', async () => {
    const scenario: HarnessScenario = {
      checkpoint: SINGLE_WRITER_READD.checkpoint,
      tail: [{ writer: 'A', lamport: 3, sha: 'aaaa0003', ops: [remove(['A', 1])] }],
    };
    expect(materializedValue(scenario)).toBeNull();

    await expect(tailRead(scenario)).resolves.toEqual({
      kind: 'refused',
      reason: 'tail-node-remove-needs-raw-liveness-witnesses',
    });
  });

  it('does not restore a cleared checkpoint register when a concurrent tail add survives', async () => {
    // The node is removed at the checkpoint, so its property is not in the
    // property shard. A concurrent add that sorts below the remove preserves
    // membership but cannot restore the cleared property.
    const scenario: HarnessScenario = {
      checkpoint: [
        { writer: 'A', lamport: 1, sha: 'aaaa0001', ops: [add('A', 1)] },
        { writer: 'A', lamport: 2, sha: 'aaaa0002', ops: [write('v')] },
        { writer: 'A', lamport: 3, sha: 'aaaa0003', ops: [remove(['A', 1])] },
      ],
      tail: [{ writer: 'B', lamport: 2, sha: 'bbbb0002', ops: [add('B', 1)] }],
    };
    expect(materializedValue(scenario)).toBeNull();

    await expect(tailRead(scenario)).resolves.toEqual({
      kind: 'value', value: null,
    });
  });

  it('answers without the records when the tail does not touch the node or the property', async () => {
    const scenario: HarnessScenario = {
      checkpoint: SINGLE_WRITER_READD.checkpoint,
      tail: [{ writer: 'B', lamport: 3, sha: 'bbbb0003', ops: [new PropSet('other', KEY, 'z')] }],
    };

    await expect(tailRead(scenario, { recordsAbsent: true })).resolves.toEqual({ kind: 'value', value: 'v' });
  });
});

describe('checkpoint-tail property reads when a checkpoint remove observed a tail add', () => {
  // Writer X saw writer Y's add of dot (Y,1) and removed it; the checkpoint
  // holds X's remove, but Y's add is after the checkpoint frontier, as a
  // checkpoint taken while a sync has delivered X's chain and not yet Y's
  // leaves it. The remove's tombstone kills the tail add in every order, so
  // Y's later write, which sorts above the remove, is not visible.
  const REMOVE_BEFORE_ITS_ADD: HarnessScenario = {
    checkpoint: [
      { writer: 'X', lamport: 5, sha: 'dddd0005', ops: [remove(['Y', 1])] },
    ],
    tail: [
      { writer: 'Y', lamport: 3, sha: 'ffff0003', ops: [add('Y', 1)] },
      { writer: 'Y', lamport: 9, sha: 'ffff0009', ops: [write('w')] },
    ],
  };

  /** The same history with a second, unobserved checkpoint add that keeps the node live. */
  const REMOVE_BEFORE_ITS_ADD_LIVE: HarnessScenario = {
    checkpoint: [
      { writer: 'A', lamport: 1, sha: 'aaaa0001', ops: [add('A', 1)] },
      ...REMOVE_BEFORE_ITS_ADD.checkpoint,
    ],
    tail: REMOVE_BEFORE_ITS_ADD.tail,
  };

  it.each([
    ['the node has no other add', REMOVE_BEFORE_ITS_ADD, null],
    ['another checkpoint add keeps the node live', REMOVE_BEFORE_ITS_ADD_LIVE, 'w'],
  ] as const)('answers as materialize() when %s', async (_name, scenario, expected) => {
    expect(materializedValue(scenario)).toBe(expected);

    const read = await tailRead(scenario);

    expect(read).toEqual({ kind: 'value', value: expected });
    for (const reordered of reducerReadsInEveryTailOrder(scenario)) {
      expect(reordered).toEqual(read);
    }
  });
});

describe('checkpoint-tail property reads over an index root whose lifecycle receipt does not match its members', () => {
  it('refuses when the receipt is present and the node lifecycle shard is missing', async () => {
    // Without the shard the node reads as having no record, and probe (e)'s
    // tail write, which the checkpoint's clear event hides, would answer.
    expect(materializedValue(PROBE_E)).toBeNull();

    await expect(tailRead(PROBE_E, { damage: 'drop-node-lifecycle-shard' })).resolves.toEqual({
      kind: 'refused',
      reason: 'checkpoint-shard-invalid',
    });
  });

  it('refuses when the receipt carries a schema version this runtime does not read', async () => {
    await expect(tailRead(PROBE_E, { damage: 'receipt-schema-version' })).resolves.toEqual({
      kind: 'refused',
      reason: 'checkpoint-shard-invalid',
    });
  });
});

describe('checkpoint-tail property reads over a checkpoint written without node lifecycle records', () => {
  it.each([
    ['probe (c)', PROBE_C, 'tail-node-add-needs-checkpoint-lifecycle-witnesses'],
    ['probe (e)', PROBE_E, 'tail-property-needs-checkpoint-lifecycle-witnesses'],
    ['round 3: pending checkpoint remove, then a tail add', PENDING_REMOVE_THEN_TAIL_ADD, 'tail-node-add-needs-checkpoint-lifecycle-witnesses'],
    ['a tail write below the checkpoint value', TAIL_WRITE_BELOW_CHECKPOINT_VALUE, 'tail-property-needs-checkpoint-lifecycle-witnesses'],
  ] as const)('refuses %s', async (_name, scenario, reason) => {
    await expect(tailRead(scenario, { recordsAbsent: true })).resolves.toEqual({ kind: 'refused', reason });
  });
});
